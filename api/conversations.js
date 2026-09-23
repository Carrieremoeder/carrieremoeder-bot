import { db, requireCode, sameOrigin } from '../lib/security.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const code = await requireCode(req, res); if (!code) return;
    if (req.method === 'GET') {
      const rows = await db('chat', { query: `?code=eq.${encodeURIComponent(code)}&select=data&limit=1` });
      return res.status(200).json({ conversations: Array.isArray(rows?.[0]?.data) ? rows[0].data : [] });
    }
    if (req.method !== 'PUT' && req.method !== 'DELETE') return res.status(405).end();
    if (!sameOrigin(req)) return res.status(403).end();
    const conversations = req.method === 'DELETE' ? [] : req.body?.conversations;
    if (!Array.isArray(conversations) || conversations.length > 100 || JSON.stringify(conversations).length > 300000) return res.status(413).json({ error: 'Gespreksgeschiedenis is te groot.' });
    const safe = conversations.map(c => ({ ...c, messages: (c.messages || []).map(m => {
      if (m.role !== 'user' || typeof m.content === 'string') return m;
      const text = Array.isArray(m.content) ? m.content.find(part => part.type === 'text')?.text || '[afbeelding]' : '[afbeelding]';
      return { role: 'user', content: text, display: text };
    }) }));
    await db('chat', { method: 'POST', data: { code, data: safe, updated_at: new Date().toISOString() } });
    return res.status(200).json({ ok: true });
  } catch (error) { console.error('Bot conversations:', error.message); return res.status(500).json({ error: 'Opslaan lukt momenteel niet.' }); }
}
