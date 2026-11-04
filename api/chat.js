import { readEvents } from '../lib/coachStream.js';
import { BOT_INSTRUCTIES } from '../lib/botInstructions.js';
import { db, requireCode, sameOrigin } from '../lib/security.js';

// De coach draait op de OpenAI Responses API.
// Privacy: `store: false` zorgt dat OpenAI het antwoord niet bewaart voor latere opvraging,
// en deze server slaat zelf geen gespreksinhoud op en logt die ook niet.
// OPENAI_BASE_URL is optioneel, bijvoorbeeld https://eu.api.openai.com voor EU-dataresidentie (als je OpenAI-project dat ondersteunt).
const openaiUrl = () => `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '')}/v1/responses`;
const DEFAULT_MODEL = 'gpt-5.6-sol';
const DEFAULT_LIGHT_MODEL = 'gpt-5.6-terra';
const DEFAULT_DAILY_PREMIUM = 10;

// Kiest het model: de eerste N berichten per dag het sterke model, daarna het lichtere.
// Telt alleen aantallen per toegangscode per dag (geen inhoud). Lukt tellen niet, dan het lichtere model.
async function chooseModel(code) {
  const premium = process.env.BOT_MODEL || DEFAULT_MODEL;
  const light = process.env.BOT_LIGHT_MODEL || DEFAULT_LIGHT_MODEL;
  const limit = Number.parseInt(process.env.BOT_DAILY_PREMIUM ?? '', 10);
  const daily = Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_DAILY_PREMIUM;
  // Dagmaximum 0 = altijd het lichte model; dan hoeft er ook niets geteld te worden.
  if (daily === 0) return { model: light, light: false };
  try {
    const count = Number(await db('rpc/bot_increment_usage', { method: 'POST', data: { p_code: code } }));
    if (!Number.isFinite(count)) throw new Error('Ongeldige teller');
    return count <= daily ? { model: premium, light: false } : { model: light, light: true };
  } catch (error) {
    console.error('Bot usage:', { type: 'count_failed' });
    return { model: light, light: true };
  }
}

// Zet het berichtformaat van de app om naar het formaat van OpenAI.
function toOpenAI(message) {
  if (typeof message.content === 'string') return { role: message.role, content: message.content.slice(0, 20000) };
  if (message.role !== 'user' || !Array.isArray(message.content)) throw new Error('Ongeldige berichtinhoud');
  const parts = message.content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return { type: 'input_text', text: part.text.slice(0, 20000) };
    // Afbeeldingen worden bewust niet geaccepteerd (dataminimalisatie): alleen tekst.
    throw new Error('Bestandstype niet ondersteund');
  });
  return { role: 'user', content: parts };
}

function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  return (data?.output || [])
    .filter(item => item?.type === 'message')
    .flatMap(item => item.content || [])
    .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Ongeldige aanvraag' });
  try {
    const code = await requireCode(req, res);
    if (!code) return;
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 30 || JSON.stringify(messages).length > 7_000_000 || messages.some(m => !['user', 'assistant'].includes(m?.role))) return res.status(400).json({ error: 'Ongeldig gesprek' });
    let input;
    try { input = messages.map(toOpenAI); } catch { return res.status(400).json({ error: 'Ongeldige berichtinhoud of bestandstype.' }); }
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI is nog niet ingesteld.' });
    const streaming = req.body?.stream === true;
    const { model, light } = await chooseModel(code);
    const response = await fetch(openaiUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        model,
        instructions: BOT_INSTRUCTIES,
        input,
        max_output_tokens: 3000,
        reasoning: { effort: ['minimal', 'low', 'medium', 'high'].includes(process.env.BOT_REASONING_EFFORT) ? process.env.BOT_REASONING_EFFORT : 'low' },
        store: false,
        stream: streaming
      })
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
    if (streaming) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      const emit = event => res.write('data: ' + JSON.stringify(event) + '\n\n');
      if (light) emit({ type: 'meta', light: true });
      let text = '';
      try {
        for await (const event of readEvents(response.body)) {
          if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') throw new Error('Upstream stream error');
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && event.delta) {
            text += event.delta;
            emit({ type: 'text', text: event.delta });
          }
          if (event.type === 'response.completed') {
            if (!text.trim()) throw new Error('Empty answer');
            emit({ type: 'done' });
            return res.end();
          }
        }
        throw new Error('Incomplete stream');
      } catch {
        emit({ type: 'error' });
        return res.end();
      }
    }
    const data = await response.json();
    if (data?.status && data.status !== 'completed') return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    const text = outputText(data);
    if (!text.trim()) return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    return res.status(200).json({ content: [{ text }], light });
  } catch (error) {
    console.error('Bot AI:', { type: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' });
    return res.status(500).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
  }
}
