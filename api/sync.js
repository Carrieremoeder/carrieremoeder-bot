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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const { id, email } = extractContactRef(req.body || {});
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
