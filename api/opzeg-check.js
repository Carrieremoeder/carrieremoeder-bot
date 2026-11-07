// Dagelijkse controle van geplande opzeggingen (opzeggingen in het eerste jaar).
// Wordt elke dag aangeroepen door de Cloudflare Worker "bot-dagelijkse-check" (zie workers/dagelijkse-check.js).
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { runDueCancellations } from '../lib/opzegging.js';

export function secretMatches(req) {
  const expected = process.env.BOT_CRON_SECRET || '';
  if (expected.length < 24) return false;
  let given = String(req.headers?.['x-bot-key'] || '');
  if (!given) { try { given = new URL(req.url, 'https://x').searchParams.get('key') || ''; } catch {} }
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!secretMatches(req)) return res.status(403).json({ ok: false });
  try {
    const summary = await runDueCancellations();
    console.log('Bot dagelijkse check:', summary);
    return res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    console.error('Bot dagelijkse check:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return res.status(500).json({ ok: false });
  }
}
