// Koppeling met Mollie, alleen voor het terugbetalen bij een herroeping.
// Systeme.io zet bij elke betaling het abonnementsnummer in de metadata ("sio_subscription_id").
// Daarmee vindt de Bot precies de juiste betaling terug. De sleutel staat als geheim in Cloudflare (MOLLIE_API_KEY).
const API = 'https://api.mollie.com/v2';

export class MollieError extends Error {
  constructor(message, status = 503, detail = '') { super(message); this.name = 'MollieError'; this.status = status; this.detail = detail; }
}

function apiKey() {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) throw new MollieError('Mollie-koppeling is nog niet ingesteld.', 503, 'MOLLIE_API_KEY ontbreekt');
  return key;
}

async function mollie(pathOrUrl, { method = 'GET', body } = {}) {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : API + pathOrUrl;
  if (!url.startsWith(API)) throw new MollieError('Onverwacht Mollie-adres.', 500);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + apiKey(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    if (error instanceof MollieError) throw error;
    throw new MollieError('Mollie is tijdelijk niet bereikbaar.', 503, `${method}: ${error?.name || 'fetch'}`);
  }
  const text = await response.text();
  if (!response.ok) throw new MollieError(`Mollie gaf status ${response.status}`, response.status, text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

export function toCents(value) {
  const m = /^(\d+)\.(\d{2})$/.exec(String(value || ''));
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}
export function fromCents(cents) { return (cents / 100).toFixed(2); }

// Zoekt de eerste betaalde betaling van dit abonnement.
// Systeme.io zet in Mollie een eigen nummer (sio_subscription_id) dat niet gelijk is aan het nummer uit de
// Systeme.io-API. Daarom: betaalde abonnementsbetaling rond het startmoment, van een Mollie-klant met
// hetzelfde e-mailadres. Alleen bij precies één treffer wordt die gebruikt.
export async function findPaymentForSubscription({ subscriptionId, start, email }) {
  const from = new Date(start.getTime() - 2 * 60 * 60 * 1000);
  const until = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const wantedEmail = String(email || '').trim().toLowerCase();
  const candidates = [];
  let next = '/payments?limit=250';
  for (let page = 0; page < 8 && next; page++) {
    const data = await mollie(next);
    const list = data?._embedded?.payments || [];
    let older = false;
    for (const p of list) {
      const created = new Date(p.createdAt);
      if (created < from) { older = true; continue; }
      if (created > until || p.status !== 'paid') continue;
      if (String(p?.metadata?.sio_subscription_id ?? '') === String(subscriptionId)) return p; // directe treffer
      if (p?.metadata?.sio_subscription_id !== undefined && p.customerId) candidates.push(p);
    }
    if (older) break;
    next = data?._links?.next?.href || '';
  }
  if (!wantedEmail) return null;
  const emails = new Map();
  const matches = [];
  for (const p of candidates) {
    if (!emails.has(p.customerId)) {
      try { emails.set(p.customerId, String((await mollie('/customers/' + encodeURIComponent(p.customerId)))?.email || '').trim().toLowerCase()); }
      catch { emails.set(p.customerId, ''); }
    }
    if (emails.get(p.customerId) === wantedEmail) matches.push(p);
  }
  return matches.length === 1 ? matches[0] : null;
}

export function refundedCents(payment) { return toCents(payment?.amountRefunded?.value) || 0; }

export async function refundPayment(paymentId, cents, description) {
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId))) throw new MollieError('Ongeldige betaling.', 400);
  return mollie(`/payments/${paymentId}/refunds`, {
    method: 'POST',
    body: { amount: { currency: 'EUR', value: fromCents(cents) }, description }
  });
}
