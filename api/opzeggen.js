// Seintje van Systeme.io (workflow "Stuur webhook") als iemand het opzegformulier invult.
// Adres in de workflow: https://bot.meestermasha.nl/api/opzeggen
// Geen geheime sleutel nodig: het opzegformulier zelf is openbaar, dus een sleutel voegt niets toe.
// Het seintje zelf wordt niet vertrouwd: de Bot zoekt het contact en het abonnement zelf op in Systeme.io.
import { findContact, getContact } from '../lib/systeme.js';
import { extractContactRef } from './sync.js';
import { processCancellation } from '../lib/opzegging.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const { id, email } = extractContactRef(req.body || {});
  try {
    let contact = null;
    if (id) { try { contact = await getContact(id); } catch (error) { if (error.status !== 404) throw error; } }
    if (!contact && email) contact = await findContact(email);
    const outcome = await processCancellation(contact);
    console.log('Bot opzegging:', { ok: outcome.ok, result: outcome.result || outcome.reason });
    return res.status(200).json({ ok: outcome.ok });
  } catch (error) {
    console.error('Bot opzegging:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return res.status(200).json({ ok: false });
  }
}
