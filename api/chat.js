import { BOT_INSTRUCTIES } from '../lib/botInstructions.js';
import { requireCode, sameOrigin } from '../lib/security.js';

function toOpenAI(message) {
  if (typeof message.content === 'string') return { role: message.role, content: message.content.slice(0, 20000) };
  if (message.role !== 'user' || !Array.isArray(message.content)) throw new Error('Ongeldige berichtinhoud');
  const parts = message.content.map(part => {
    if (part.type === 'text' && typeof part.text === 'string') return { type: 'input_text', text: part.text.slice(0, 20000) };
    if (part.type === 'image' && ['image/png','image/jpeg','image/webp'].includes(part.source?.media_type) && /^[A-Za-z0-9+/=]+$/.test(part.source?.data || ''))
      return { type: 'input_image', image_url: `data:${part.source.media_type};base64,${part.source.data}` };
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
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI is nog niet ingesteld.' });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.BOT_MODEL || 'gpt-6-sol', instructions: BOT_INSTRUCTIES, input: messages.map(toOpenAI), store: false, max_output_tokens: 2200 })
    });
    if (!response.ok) return res.status(502).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
    const data = await response.json();
    const text = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
    return res.status(200).json({ content: [{ text: text || 'Er is geen antwoord ontvangen. Probeer opnieuw.' }] });
  } catch (error) {
    console.error('Bot AI:', error.message);
    return res.status(500).json({ error: 'De coach is tijdelijk niet beschikbaar.' });
  }
}
