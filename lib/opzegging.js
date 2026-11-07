// Automatisch opzeggen van het Bot-abonnement.
//
// De klant vult het opzegformulier op meestermasha.nl/opzeggen-bot in. Een workflow in Systeme.io
// stuurt dan een seintje naar /api/opzeggen. De Bot zoekt het abonnement zelf op in Systeme.io:
//   - Na het eerste jaar: direct opzeggen per het einde van de lopende betaalperiode.
//   - In het eerste jaar: de opzegging wordt vastgelegd bij het contact (veld "Bot opzegging").
//     Een dagelijkse controle (/api/opzeg-check) loopt alle Bot-klanten langs en zegt het abonnement
//     op zodra de laatste maand van het eerste jaar is begonnen. Zo stopt het precies na twaalf maanden.
//     (Geen extra tag: het Startup-plan van Systeme.io heeft maar 10 tags.)
//   - Lukt het niet (geen abonnement gevonden, fout bij Systeme.io), dan krijgt het contact de tag
//     "bot-opzegging-handmatig". Een automatisering in Systeme.io mailt Masha dan om het zelf te regelen.
// Er wordt niets buiten Systeme.io opgeslagen.
import { sio, SystemeError, accessTags } from './systeme.js';
import { botSubscriptions, isActive, subscriptionStart } from './botStatus.js';

export const TAGS = {
  manual: () => process.env.BOT_CANCEL_MANUAL_TAG || 'bot-opzegging-handmatig'
};
export function cancelFieldSlug() { return process.env.BOT_CANCEL_FIELD || 'bot_opzegging'; }

function items(data) { return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []; }

// ---------- Datums ----------
export function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
function addDays(date, days) { return new Date(date.getTime() + days * 86_400_000); }
export function iso(date) { return date.toISOString().slice(0, 10); }
export function nl(date) {
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Amsterdam' });
}

// Wat moet er gebeuren met dit abonnement? (zuivere rekenfunctie, los te testen)
//   { action: 'now' }                         → nu opzeggen per einde betaalperiode
//   { action: 'schedule', due, end }          → op of na "due" opzeggen; stopt dan per "end"
export function planCancellation(start, now = new Date()) {
  if (!start) return { action: 'now' };
  const end = addMonths(start, 12);
  // De twaalfde betaling valt op start + 11 maanden. Daarna pas opzeggen, dan stopt het op start + 12 maanden.
  const due = addDays(addMonths(start, 11), 1);
  if (now >= due) return { action: 'now', end: now < end ? end : null };
  return { action: 'schedule', due, end };
}

// Leest "opzeggen op JJJJ-MM-DD" uit het veld "Bot opzegging".
export function plannedDueDate(contact) {
  const field = (contact?.fields || []).find(f => (f?.slug || f?.fieldName) === cancelFieldSlug());
  const m = /opzeggen op (\d{4}-\d{2}-\d{2})/.exec(String(field?.value || ''));
  if (!m) return null;
  const d = new Date(m[1] + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- Systeme.io-hulpjes ----------
let fieldReady = false;
async function ensureCancelField() {
  if (fieldReady) return;
  const slug = cancelFieldSlug();
  const fields = items(await sio('/contact_fields?limit=100'));
  if (!fields.some(f => f?.slug === slug)) {
    try { await sio('/contact_fields', { method: 'POST', body: { fieldName: 'Bot opzegging', slug } }); }
    catch (error) { if (![409, 422].includes(error.status)) throw error; }
  }
  fieldReady = true;
}

async function setCancelField(contactId, value) {
  await ensureCancelField();
  await sio('/contacts/' + encodeURIComponent(contactId), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: cancelFieldSlug(), value }] }
  });
}

const tagIds = new Map();
export async function ensureTag(name, { create = true } = {}) {
  const key = name.toLowerCase();
  if (tagIds.has(key)) return tagIds.get(key);
  const find = async () => {
    let after = '';
    for (let page = 0; page < 30; page++) {
      const data = await sio('/tags?limit=100' + (after ? '&startingAfter=' + encodeURIComponent(after) : ''));
      const list = items(data);
      const hit = list.find(t => String(t?.name || '').trim().toLowerCase() === key);
      if (hit) return hit;
      if (!data?.hasMore || !list.length) return null;
      after = list[list.length - 1].id;
    }
    return null;
  };
  let tag = await find();
  if (!tag && create) {
    try { tag = await sio('/tags', { method: 'POST', body: { name } }); }
    catch (error) { if (![400, 409, 422].includes(error.status)) throw error; }
    if (!tag?.id) tag = await find();
  }
  if (!tag?.id) throw new SystemeError(`Tag ${name} kon niet worden aangemaakt.`, 503);
  tagIds.set(key, Number(tag.id));
  return Number(tag.id);
}

async function addTag(contactId, name, { retrigger = false } = {}) {
  const tagId = await ensureTag(name);
  if (retrigger) {
    try { await sio(`/contacts/${encodeURIComponent(contactId)}/tags/${tagId}`, { method: 'DELETE' }); }
    catch (error) { if (![404, 422].includes(error.status)) throw error; }
  }
  try { await sio(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', body: { tagId } }); }
  catch (error) { if (![409, 422].includes(error.status)) throw error; }
}

async function removeTag(contactId, name) {
  const tagId = await ensureTag(name);
  try { await sio(`/contacts/${encodeURIComponent(contactId)}/tags/${tagId}`, { method: 'DELETE' }); }
  catch (error) { if (![404, 422].includes(error.status)) throw error; }
}

// Zegt het abonnement op per het einde van de lopende betaalperiode (nooit direct).
export async function cancelAtPeriodEnd(subscriptionId) {
  await sio(`/payment/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST', body: { cancel: 'WhenBillingPeriodEnds' }
  });
}

function logShape(label, sub) {
  // Alleen de namen van de velden en de status, geen persoonsgegevens.
  try { console.log(label, { keys: Object.keys(sub || {}).join(','), status: String(sub?.status || sub?.state || '') }); } catch {}
}

async function needsManual(contactId, reason) {
  console.error('Bot opzegging handmatig:', { reason });
  if (!contactId) return { ok: false, reason };
  await setCancelField(contactId, `handmatig regelen (${reason}) — ${nl(new Date())}`);
  // De tag start de mail aan Masha. Bestaat de tag niet (tag-limiet), dan blijft het bij het veld.
  try { await addTag(contactId, TAGS.manual(), { retrigger: true }); }
  catch (error) { console.error('Bot opzegging: tag voor handmatig ontbreekt', { status: error?.status || 0 }); }
  return { ok: false, reason };
}

// ---------- Verwerken ----------
// Verwerkt een opzegging voor dit contact. Geeft { ok, result } terug.
export async function processCancellation(contact, now = new Date()) {
  if (!contact?.id) return needsManual(null, 'geen contact gevonden');
  let subs;
  try { subs = await botSubscriptions(contact); }
  catch (error) { return needsManual(contact.id, 'abonnement niet op te halen'); }
  const active = subs.filter(isActive);
  if (!active.length) return needsManual(contact.id, subs.length ? 'abonnement is al gestopt' : 'geen Bot-abonnement bij dit e-mailadres');

  const sub = active[0];
  logShape('Bot opzegging abonnement:', sub);
  const plan = planCancellation(subscriptionStart(sub), now);

  if (plan.action === 'schedule') {
    await setCancelField(contact.id, `gepland: opzeggen op ${iso(plan.due)}, stopt per ${nl(plan.end)} (doorgegeven ${nl(now)})`);
    return { ok: true, result: 'gepland', due: iso(plan.due) };
  }

  try { for (const s of active) await cancelAtPeriodEnd(s.id); }
  catch (error) { return needsManual(contact.id, `opzeggen bij Systeme.io mislukt (${error.status || 'fout'})`); }
  await setCancelField(contact.id, `opgezegd op ${nl(now)}, stopt aan het einde van de lopende betaalperiode${plan.end ? ` (${nl(plan.end)})` : ''}`);
  return { ok: true, result: 'opgezegd' };
}

// Dagelijkse controle: loopt alle Bot-klanten langs (toegangstags) en zegt geplande opzeggingen op
// zodra het moment daar is. Herkent geplande opzeggingen aan het veld "Bot opzegging".
export async function runDueCancellations(now = new Date()) {
  const seen = new Map();
  for (const name of accessTags()) {
    let tagId;
    try { tagId = await ensureTag(name, { create: false }); } catch { continue; }
    let after = '';
    for (let page = 0; page < 100; page++) {
      const data = await sio(`/contacts?limit=100&tags=${tagId}` + (after ? '&startingAfter=' + encodeURIComponent(after) : ''));
      const list = items(data);
      for (let c of list) {
        // Komen de velden niet mee in de lijst, haal het contact dan los op.
        if (!Array.isArray(c?.fields)) { try { c = await sio('/contacts/' + encodeURIComponent(c.id)); } catch { continue; } }
        if (plannedDueDate(c)) seen.set(String(c.id), c);
      }
      if (!data?.hasMore || !list.length) break;
      after = list[list.length - 1].id;
    }
  }
  const summary = { checked: seen.size, cancelled: 0, waiting: 0, manual: 0 };
  for (const contact of seen.values()) {
    const due = plannedDueDate(contact);
    if (now < due) { summary.waiting++; continue; }
    try {
      const active = (await botSubscriptions(contact)).filter(sub => isActive(sub, now));
      if (active.length) for (const s of active) await cancelAtPeriodEnd(s.id);
      await setCancelField(contact.id, `opgezegd op ${nl(now)}, stopt na het eerste jaar`);
      summary.cancelled++;
    } catch (error) {
      await needsManual(contact.id, `geplande opzegging mislukt (${error?.status || 'fout'})`);
      summary.manual++;
    }
  }
  return summary;
}
