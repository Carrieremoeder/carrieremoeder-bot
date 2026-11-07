// Dagelijkse controle van geplande opzeggingen (opzeggingen in het eerste jaar).
// Wordt elke dag aangeroepen door de Cloudflare Worker "bot-dagelijkse-check" (zie workers/dagelijkse-check.js).
import { runDueCancellations } from '../lib/opzegging.js';

// Geen geheime sleutel: de controle zegt alleen op wat al gepland staat, vaker aanroepen kan dus geen kwaad.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const summary = await runDueCancellations();
    console.log('Bot dagelijkse check:', summary);
    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('Bot dagelijkse check:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return res.status(500).json({ ok: false });
  }
}
