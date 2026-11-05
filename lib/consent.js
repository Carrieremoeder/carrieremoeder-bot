// Toestemming voor eigen gevoelige gegevens (art. 9 lid 2 sub a AVG).
// De keuze van de klant (ja of nee) wordt vastgelegd in een contactveld in Systeme.io,
// met datum en versie, zodat Meester Masha kan aantonen wat iemand heeft gekozen.
// Ook zonder toestemming kan de klant de Bot gebruiken; dan deelt hij geen gevoelige gegevens over zichzelf.
import { sio } from './systeme.js';

export const CONSENT_VERSION = '2026-12-01';

export function consentSlug() { return process.env.BOT_CONSENT_FIELD || 'bot_toestemming'; }

function items(data) { return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []; }

let consentFieldReady = false;
export async function ensureConsentField() {
  if (consentFieldReady) return;
  const slug = consentSlug();
  const fields = items(await sio('/contact_fields?limit=100'));
  if (!fields.some(f => f?.slug === slug)) {
    try { await sio('/contact_fields', { method: 'POST', body: { fieldName: 'Bot toestemming', slug } }); }
    catch (error) { if (![409, 422].includes(error.status)) throw error; }
  }
  consentFieldReady = true;
}

export function currentConsent(contact) {
  const field = (contact?.fields || []).find(f => (f?.slug || f?.fieldName) === consentSlug());
  return typeof field?.value === 'string' ? field.value.trim() : '';
}

// Heeft de klant de vraag voor de huidige versie al beantwoord (ja of nee)?
export function hasAnswered(contact) {
  return currentConsent(contact).endsWith('versie ' + CONSENT_VERSION);
}

export function consentValue(choice, now = new Date()) {
  const date = now.toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${choice ? 'ja' : 'nee'} op ${date}, versie ${CONSENT_VERSION}`;
}

export async function saveConsent(contactId, choice) {
  await ensureConsentField();
  await sio('/contacts/' + encodeURIComponent(contactId), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: consentSlug(), value: consentValue(choice === true) }] }
  });
}
