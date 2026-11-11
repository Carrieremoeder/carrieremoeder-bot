import { readEvents } from '../lib/coachStream.js';
import { BOT_INSTRUCTIES } from '../lib/botInstructions.js';
import { requireCode, sameOrigin } from '../lib/security.js';

// De coach draait op de Responses API: eerst Microsoft Azure OpenAI in de EU Data Zone,
// met OpenAI (VS) alleen als vangnet bij een storing, time-out of drukte bij Azure.
// Privacy: `store: false` zorgt dat het antwoord niet wordt bewaard voor latere opvraging,
// en deze server slaat zelf geen gespreksinhoud op en logt die ook niet.
// OPENAI_BASE_URL is optioneel, bijvoorbeeld https://eu.api.openai.com voor EU-dataresidentie (als je OpenAI-project dat ondersteunt).
const openaiUrl = () => `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '')}/v1/responses`;
const AZURE_DEFAULT_ENDPOINT = 'https://carrieremoeder-7227-resource.openai.azure.com/openai/v1';
const DEFAULT_MODEL = 'gpt-5.6-luna';
export const CONTENT_FILTER_MESSAGE = 'Dit bericht kon de coach niet verwerken. Probeer het in je eigen woorden en zonder de heftigste details opnieuw. Ben je of is je kind in gevaar? Bel 112. Bij huiselijk geweld: Veilig Thuis, 0800-2000.';

// Volgorde van aanbieders. Azure alleen als de sleutel is ingesteld; OpenAI als vangnet.
export function providers(env = process.env) {
  const list = [];
  if (env.AZURE_OPENAI_API_KEY) list.push({
    name: 'azure',
    url: `${(env.AZURE_OPENAI_ENDPOINT || AZURE_DEFAULT_ENDPOINT).replace(/\/+$/, '')}/responses`,
    headers: { 'api-key': env.AZURE_OPENAI_API_KEY },
    model: env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_MODEL
  });
  if (env.OPENAI_API_KEY) list.push({
    name: 'openai',
    url: openaiUrl(),
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    model: env.BOT_MODEL || DEFAULT_MODEL
  });
  return list;
}

// Alleen bij storing, time-out of drukte naar het vangnet; nooit bij een inhoudelijke weigering.
const retryable = status => status === 408 || status === 429 || status >= 500;
const isContentFilter = upstream => /content_filter|content_policy|responsibleai/i.test(`${upstream?.error?.code || ''} ${upstream?.error?.type || ''} ${upstream?.error?.innererror?.code || ''}`);

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
    if (!(await requireCode(req, res))) return;
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 30 || JSON.stringify(messages).length > 7_000_000 || messages.some(m => !['user', 'assistant'].includes(m?.role))) return res.status(400).json({ error: 'Ongeldig gesprek' });
    let input;
    try { input = messages.map(toOpenAI); } catch { return res.status(400).json({ error: 'Ongeldige berichtinhoud of bestandstype.' }); }
    const chain = providers();
    if (!chain.length) return res.status(503).json({ error: 'AI is nog niet ingesteld.' });
    const streaming = req.body?.stream === true;
    const effort = ['minimal', 'low', 'medium', 'high'].includes(process.env.BOT_REASONING_EFFORT) ? process.env.BOT_REASONING_EFFORT : 'low';
    let response;
    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      const last = i === chain.length - 1;
      // Wacht korter op de eerste aanbieder als er nog een vangnet is; de rest van de tijd is voor het antwoord zelf.
      const controller = new AbortController();
      const headerTimer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), last ? 55_000 : 25_000);
      try {
        response = await fetch(provider.url, {
          method: 'POST',
          headers: { ...provider.headers, 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: provider.model,
            instructions: BOT_INSTRUCTIES,
            input,
            max_output_tokens: 3000,
            reasoning: { effort },
            store: false,
            stream: streaming
          })
        });
      } catch (error) {
        clearTimeout(headerTimer);
        console.error('Bot AI:', { provider: provider.name, type: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'request_failed' });
        if (last) throw error;
        continue;
      }
      clearTimeout(headerTimer);
      setTimeout(() => controller.abort(), 55_000);
      if (response.ok) {
        if (i > 0) console.warn('Bot AI: vangnet gebruikt', { provider: provider.name });
        break;
      }
      // Log uitsluitend metadata; nooit promptinhoud, sleutel of upstream foutbericht.
      let upstream = {};
      try { upstream = await response.json(); } catch {}
      console.error('Bot AI upstream:', {
        provider: provider.name,
        status: response.status,
        type: String(upstream?.error?.type || 'unknown').slice(0, 80),
        code: String(upstream?.error?.code || 'unknown').slice(0, 80)
      });
      if (isContentFilter(upstream)) return res.status(422).json({ error: CONTENT_FILTER_MESSAGE });
      if (last || !retryable(response.status)) return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    }
    if (streaming) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      const emit = event => res.write('data: ' + JSON.stringify(event) + '\n\n');
      let text = '';
      try {
        for await (const event of readEvents(response.body)) {
          if (event.type === 'response.incomplete' && event.response?.incomplete_details?.reason === 'content_filter') {
            emit({ type: 'error', message: CONTENT_FILTER_MESSAGE });
            return res.end();
          }
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
    return res.status(200).json({ content: [{ text }] });
  } catch (error) {
    console.error('Bot AI:', { type: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' });
    return res.status(500).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
  }
}
