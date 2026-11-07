// Seintje van Systeme.io (workflow "Stuur webhook") bij een nieuwe verkoop, opzegging of mislukte betaling.
// Het seintje zelf wordt niet vertrouwd: de Bot zoekt het contact en zijn abonnementen zelf op
// in Systeme.io en zet daarna het veld "Bot status". Er wordt geen gespreksinhoud of extra data bewaard.
import { findContact, getContact, normaliseEmail } from '../lib/systeme.js';
import { syncStatus } from '../lib/botStatus.js';

// Zoekt in het (onbekende) webhook-formaat naar een contactnummer en/of e-mailadres.
export function extractContactRef(body) {
  let id = null, email = null;
  const seen = new Set();
  const walk = (value, key = '', depth = 0) => {
    if (!value || depth > 6 || seen.has(value)) return;
    if (typeof value === 'object') {
      seen.add(value);
      const isContact = /contact|customer|subscriber/i.test(key);
      if (isContact && !id && (typeof value.id === 'number' || /^\d{1,20}$/.test(String(value.id || '')))) id = String(value.id);
      if (isContact && !email && value.email) email = normaliseEmail(value.email);
      for (const [k, v] of Object.entries(value)) walk(v, k, depth + 1);
      return;
    }
    if (!id && /^(contact_?id|contactId|customer_?id)$/i.test(key) && /^\d{1,20}$/.test(String(value))) id = String(value);
    if (!email && /email/i.test(key)) email = normaliseEmail(value);
  };
  walk(body);
  return { id, email };
}

// Alleen de veldnamen van een seintje (geen waarden), om het formaat van Systeme.io te kunnen zien.
export function bodyShape(value, depth = 0) {
  if (value === null || typeof value !== 'object') return typeof value;
  if (depth > 3) return '…';
  if (Array.isArray(value)) return [value.length ? bodyShape(value[0], depth + 1) : 'leeg'];
  return Object.fromEntries(Object.keys(value).slice(0, 30).map(k => [k, bodyShape(value[k], depth + 1)]));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  console.log('Bot sync seintje:', { type: req.headers?.['content-type'] || '', shape: JSON.stringify(bodyShape(req.body)).slice(0, 800) });
  const { id, email } = extractContactRef(req.body || {});
  if (!id && !email) console.log('Bot sync: geen contact gevonden in seintje');
  if (!id && !email) return res.status(200).json({ ok: true, skipped: true });
  try {
    let contact = null;
    if (id) { try { contact = await getContact(id); } catch (error) { if (error.status !== 404) throw error; } }
    if (!contact && email) contact = await findContact(email);
    if (contact) await syncStatus(contact);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Bot sync:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return res.status(200).json({ ok: false });
  }
}
