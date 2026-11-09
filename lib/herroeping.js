// Automatisch afhandelen van een herroeping (binnen 14 dagen na aankoop).
//
// 1. De klant vult het herroepingsformulier in op meestermasha.nl/herroepen-bot. Systeme.io stuurt direct
//    de wettelijke bevestiging en een seintje naar /api/herroepen.
// 2. De Bot zoekt het abonnement op. Is het minder dan 14 dagen oud, dan krijgt de klant een persoonlijke
//    link (via de bestaande inlogmail, dus geen extra tag). Zo weten we zeker dat de klant zelf bij dit
//    e-mailadres kan: iemand anders kan zo geen abonnement van een ander stopzetten.
// 3. Klikt de klant op de link en bevestigt hij, dan stopt de Bot het abonnement direct, sluit de toegang af
//    en betaalt via Mollie terug wat de klant te veel betaald heeft (naar rato van de dagen met toegang).
// Lukt iets niet, dan krijgt Masha een melding (tag "bot-opzegging-handmatig") en regelt zij het zelf.
import { sio } from './systeme.js';
import { botSubscriptions, subscriptionStart, statusSlug, ensureStatusField } from './botStatus.js';
import { addMonths, needsManual, nl, nlTime, setCancelField } from './opzegging.js';
import { findPaymentForSubscription, refundPayment, refundedCents, toCents, fromCents } from './mollie.js';

const DAY = 86_400_000;

// Datum in Nederland (JJJJ-MM-DD), om kalenderdagen te tellen.
function amsterdamDay(date) {
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}
function dayNumber(date) { return Date.parse(amsterdamDay(date) + 'T00:00:00Z') / DAY; }

// Valt het moment van herroepen binnen de bedenktijd? 14 dagen, te rekenen vanaf de dag na de aankoop.
export function withinWithdrawalPeriod(start, receivedAt) {
  if (!start) return false;
  const diff = dayNumber(receivedAt) - dayNumber(start);
  return diff >= 0 && diff <= 14;
}

// Wat betaalt de klant voor de dagen met toegang, en wat krijgt hij terug? Bedragen in centen.
// Elke begonnen dag telt mee; de eerste betaalperiode is één maand.
export function computeRefund(paidCents, start, receivedAt) {
  const periodDays = Math.round((addMonths(start, 1) - start) / DAY);
  const usedDays = Math.min(periodDays, Math.max(1, Math.ceil((new Date(receivedAt) - start) / DAY)));
  const keepCents = Math.round(paidCents * usedDays / periodDays);
  return { usedDays, periodDays, keepCents, refundCents: Math.max(0, paidCents - keepCents) };
}

export function euro(cents) { return '€ ' + fromCents(cents).replace('.', ','); }

// Stap 2: na het formulier. Geeft { ok, subscriptionId } terug, of meldt het aan Masha.
export async function findWithdrawableSubscription(contact, now = new Date()) {
  let subs;
  try { subs = await botSubscriptions(contact); }
  catch { return { ok: false, reason: 'abonnement niet op te halen' }; }
  const candidates = subs
    .filter(sub => withinWithdrawalPeriod(subscriptionStart(sub), now))
    .sort((a, b) => subscriptionStart(b) - subscriptionStart(a));
  if (!candidates.length) return { ok: false, reason: subs.length ? 'geen abonnement van minder dan 14 dagen' : 'geen Bot-abonnement bij dit e-mailadres' };
  return { ok: true, subscription: candidates[0] };
}

export async function reportManual(contactId, reason) {
  return needsManual(contactId, 'herroeping: ' + reason);
}

async function getSubscription(contactId, subscriptionId) {
  const subs = await botSubscriptions({ id: contactId });
  return subs.find(s => String(s.id) === String(subscriptionId)) || null;
}

function isStillRunning(sub) {
  const status = String(sub?.status || sub?.state || '').toLowerCase();
  return !/inactive|cancel|ended|expired|stopped|unpaid|fail/.test(status) && /active|trial/.test(status);
}

// Haalt alles op wat nodig is om de klant te laten zien wat er gaat gebeuren (zonder iets te veranderen).
export async function previewWithdrawal({ contactId, subscriptionId, receivedAt }) {
  const sub = await getSubscription(contactId, subscriptionId);
  if (!sub) return { state: 'unknown' };
  const start = subscriptionStart(sub);
  if (!withinWithdrawalPeriod(start, receivedAt)) return { state: 'too-late' };
  const payment = await findPaymentForSubscription(subscriptionId, new Date(start.getTime() - 2 * DAY));
  if (!payment) return { state: 'no-payment', sub };
  const paidCents = toCents(payment.amount?.value);
  if (!paidCents) return { state: 'no-payment', sub };
  const calc = computeRefund(paidCents, start, receivedAt);
  const done = refundedCents(payment) > 0;
  return { state: done ? 'done' : 'ready', sub, start, payment, paidCents, running: isStillRunning(sub), ...calc };
}

// Systeme.io: abonnement direct stoppen (niet pas aan het einde van de periode).
async function cancelNow(subscriptionId) {
  let lastError;
  for (const cancel of ['Now', 'Immediately']) {
    try {
      await sio(`/payment/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'POST', body: { cancel } });
      return;
    } catch (error) {
      lastError = error;
      if (![400, 422].includes(error.status)) throw error;
    }
  }
  throw lastError;
}

async function setStatus(contactId, value) {
  await ensureStatusField();
  await sio('/contacts/' + encodeURIComponent(contactId), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: statusSlug(), value }] }
  });
}

// Stap 3: de klant heeft bevestigd. Stopt het abonnement, sluit de toegang af en betaalt terug.
// Veilig om opnieuw te proberen: een betaling die al (deels) is teruggestort, wordt niet nog eens teruggestort.
export async function confirmWithdrawal(ref, now = new Date()) {
  const preview = await previewWithdrawal(ref);
  if (preview.state === 'done') return { ok: true, already: true };
  if (preview.state !== 'ready') {
    await reportManual(ref.contactId, preview.state === 'too-late' ? 'bedenktijd voorbij' : preview.state === 'no-payment' ? 'betaling niet gevonden in Mollie' : 'abonnement niet gevonden');
    return { ok: false, state: preview.state };
  }

  if (preview.running) {
    try { await cancelNow(ref.subscriptionId); }
    catch (error) {
      await reportManual(ref.contactId, `abonnement stoppen bij Systeme.io mislukt (${error.status || 'fout'}), nog niets teruggestort`);
      return { ok: false, state: 'cancel-failed' };
    }
  }
  // Toegang direct afsluiten. "herroepen" wordt niet door een latere controle teruggezet.
  await setStatus(ref.contactId, `herroepen per ${nl(now)}`);

  if (preview.refundCents > 0) {
    try {
      await refundPayment(preview.payment.id, preview.refundCents, 'Herroeping Always In Control Bot');
    } catch (error) {
      await reportManual(ref.contactId, `abonnement gestopt, maar terugbetalen via Mollie mislukt (${error.status || 'fout'}); terug te betalen: ${euro(preview.refundCents)}`);
      return { ok: false, state: 'refund-failed' };
    }
  }
  await setCancelField(ref.contactId, `herroepen op ${nlTime(now)}: ${euro(preview.refundCents)} teruggestort, ${euro(preview.keepCents)} ingehouden voor ${preview.usedDays} dag(en) toegang`);
  return { ok: true, refundCents: preview.refundCents, keepCents: preview.keepCents, usedDays: preview.usedDays };
}
