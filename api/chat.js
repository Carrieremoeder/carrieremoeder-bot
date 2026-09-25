import { BOT_INSTRUCTIES } from '../lib/botInstructions.js';
import { requireCode, sameOrigin } from '../lib/security.js';

function toClaude(message) {
  if (typeof message.content === 'string') return { role: message.role, content: message.content.slice(0, 20000) };
  if (message.role !== 'user' || !Array.isArray(message.content)) throw new Error('Ongeldige berichtinhoud');
  const parts = message.content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return { type: 'text', text: part.text.slice(0, 20000) };
    if (part?.type === 'image' && ['image/png','image/jpeg','image/webp'].includes(part.source?.media_type) && /^[A-Za-z0-9+/=]+$/.test(part.source?.data || ''))
      return { type: 'image', source: { type: 'base64', media_type: part.source.media_type, data: part.source.data } };
    throw new Error('Bestandstype niet ondersteund');
  });
  return { role: 'user', content: parts };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Ongeldige aanvraag' });
  try {
    if (!(await requireCode(req, res))) return;
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 30 || JSON.stringify(messages).length > 7_000_000 || messages.some(m => !['user','assistant'].includes(m?.role))) return res.status(400).json({ error: 'Ongeldig gesprek' });
    let input;
    try { input = messages.map(toClaude); } catch { return res.status(400).json({ error: 'Ongeldige berichtinhoud of bestandstype.' }); }
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is nog niet ingesteld.' });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ model: process.env.BOT_CLAUDE_MODEL || 'claude-sonnet-4-6', system: BOT_INSTRUCTIES, messages: input, max_tokens: 2200 })
    });
    if (!response.ok) {
      // Log uitsluitend metadata; nooit promptinhoud, sleutel of upstream foutbericht.
      let upstream = {};
      try { upstream = await response.json(); } catch {}
      console.error('Bot AI upstream:', {
        status: response.status,
        type: String(upstream?.error?.type || 'unknown').slice(0, 80),
        code: String(upstream?.error?.code || 'unknown').slice(0, 80)
      });
      return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    }
    const data = await response.json();
    const text = (data.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    if (!text.trim()) return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    return res.status(200).json({ content: [{ text }] });
  } catch (error) {
    console.error('Bot AI:', { type: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' });
    return res.status(500).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
  }
}
