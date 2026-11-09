// Abonnementsstatus van de Bot.
// Iedereen met een toegangstag blijft die tag houden (zodat Masha haar klanten terugvindt).
// Of iemand de Bot nog mag gebruiken, staat in het contactveld "Bot status":
//   leeg                      → lifetime klant (geen abonnement), altijd toegang
//   "abonnee sinds dd-mm-jjjj" → lopend abonnement, toegang
//   "gestopt per dd-mm-jjjj"   → abonnement gestopt of betaling mislukt, geen toegang
// De Bot zoekt de echte status zelf op in Systeme.io; een seintje van buitenaf kan dus niets vervalsen.
import { hasAccess, sio } from './systeme.js';

export function statusSlug() { return process.env.BOT_STATUS_FIELD || 'bot_status'; }

function items(data) { return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []; }

let statusFieldReady = false;
export async function ensureStatusField() {
  if (statusFieldReady) return;
  const slug = statusSlug();
  const fields = items(await sio('/contact_fields?limit=100'));
  if (!fields.some(f => f?.slug === slug)) {
    try { await sio('/contact_fields', { method: 'POST', body: { fieldName: 'Bot status', slug } }); }
    catch (error) { if (![409, 422].includes(error.status)) throw error; }
  }
  statusFieldReady = true;
}

export function currentStatus(contact) {
  const field = (contact?.fields || []).find(f => (f?.slug || f?.fieldName) === statusSlug());
  return typeof field?.value === 'string' ? field.value.trim() : '';
}

// "herroepen per …": de klant heeft binnen 14 dagen herroepen; toegang is direct gestopt.
export function isStopped(contact) { return /^(gestopt|herroepen)/i.test(currentStatus(contact)); }

function herroepDate(status) {
  const m = /^herroepen per (\d{2})-(\d{2})-(\d{4})/i.exec(status || '');
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1] + 1)) : null; // einde van die dag
}

// Mag deze persoon de Bot gebruiken? Toegangstag én niet gestopt.
export function canUseBot(contact) { return hasAccess(contact) && !isStopped(contact); }

function subscriptionMatcher() {
  return new RegExp(process.env.BOT_SUBSCRIPTION_MATCH || 'bot abonnement|always in control bot - abonnement', 'i');
}

function belongsTo(sub, contact) {
  const id = String(contact?.id || '');
  const email = String(contact?.email || '').toLowerCase();
  const ids = [sub?.contact?.id, sub?.contactId, sub?.customer?.id, sub?.contact].map(v => (v && typeof v !== 'object') ? String(v) : String(v?.id || ''));
  if (id && ids.includes(id)) return true;
  if (!ids.some(Boolean) && !sub?.contact && !sub?.customer) return true; // lijst is al gefilterd op contact
  const emails = [sub?.contact?.email, sub?.customer?.email, sub?.email].filter(Boolean).map(v => String(v).toLowerCase());
  return Boolean(email && emails.includes(email));
}

// Is er een einddatum in de toekomst (opgezegd per einde betaalperiode, maar die periode loopt nog)?
export function paidUntil(sub, now = new Date()) {
  const dates = [];
  for (const [key, value] of Object.entries(sub || {})) {
    if (!/(period.?end|ends?_?at|end_?date|cancel_?at$|cancelAt$|expires?|valid_?until|paid_?until|next_?(billing|payment|charge))/i.test(key)) continue;
    const d = toDate(value);
    if (d) dates.push(d);
  }
  const future = dates.filter(d => d > now).sort((a, b) => b - a);
  return future[0] || null;
}

export function isActive(sub, now = new Date()) {
  const status = String(sub?.status || sub?.state || '').toLowerCase();
  if (/unpaid|fail|past_due/.test(status)) return false;
  // Opgezegd, maar de betaalde periode loopt nog: dan houdt de klant toegang tot die datum.
  if (/inactive|cancel|ended|expired|stopped/.test(status)) return Boolean(/cancel/.test(status) && paidUntil(sub, now));
  return /active|trial/.test(status);
}

export function subscriptionStart(sub) {
  return toDate(sub?.createdAt || sub?.startedAt || sub?.created_at || sub?.startDate || sub?.start_date);
}

function toDate(value) {
  const d = value ? new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function nl(date) {
  const d = date || new Date();
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Amsterdam' });
}

// Haalt de abonnementen van dit contact op bij Systeme.io.
export async function botSubscriptions(contact) {
  const match = subscriptionMatcher();
  const found = [];
  const tryList = async (query) => {
    let after = '';
    for (let page = 0; page < 20; page++) {
      const data = await sio('/payment/subscriptions?limit=10' + query + (after ? '&startingAfter=' + encodeURIComponent(after) : ''));
      const list = items(data);
      for (const sub of list) if (belongsTo(sub, contact)) found.push(sub);
      if (!data?.hasMore || !list.length) return;
      after = list[list.length - 1].id;
    }
  };
  // Systeme.io vereist de parameter "contact" (het contactnummer).
  await tryList('&contact=' + encodeURIComponent(contact.id));
  return found.filter(sub => match.test(JSON.stringify(sub)));
}

// Berekent de status ("abonnee sinds …", "gestopt per …" of leeg) uit de abonnementen.
export function statusFromSubscriptions(subs) {
  if (!subs.length) return '';
  const active = subs.filter(isActive);
  if (active.length) {
    const start = active.map(s => toDate(s.createdAt || s.startedAt || s.created_at)).filter(Boolean).sort((a, b) => a - b)[0];
    return `abonnee sinds ${nl(start)}`;
  }
  const end = subs.map(s => toDate(s.cancelledAt || s.canceledAt || s.endedAt || s.updatedAt || s.canceled_at)).filter(Boolean).sort((a, b) => b - a)[0];
  return `gestopt per ${nl(end)}`;
}

// Werkt het veld "Bot status" bij volgens Systeme.io. Geeft het bijgewerkte contact terug.
export async function syncStatus(contact) {
  if (!contact?.id) return contact;
  const subs = await botSubscriptions(contact);
  const next = statusFromSubscriptions(subs);
  const now = currentStatus(contact);
  if (!next) return contact; // geen bot-abonnement (lifetime klant): niets aanpassen
  // Na een herroeping alleen weer toegang bij een nieuw abonnement, afgesloten na de herroeping.
  const withdrawnAt = herroepDate(now);
  if (withdrawnAt && !subs.some(sub => isActive(sub) && subscriptionStart(sub) > withdrawnAt)) return contact;
  const value = next || now;
  // Een eerder "abonnee sinds"-datum bewaren als het abonnement nog loopt.
  const finalValue = /^abonnee/i.test(value) && /^abonnee/i.test(now) ? now : value;
  if (finalValue === now) return contact;
  await ensureStatusField();
  await sio('/contacts/' + encodeURIComponent(contact.id), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: statusSlug(), value: finalValue }] }
  });
  const fields = (contact.fields || []).filter(f => (f?.slug || f?.fieldName) !== statusSlug());
  return { ...contact, fields: [...fields, { slug: statusSlug(), value: finalValue }] };
}
