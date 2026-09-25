import { activeCode, clearSession, db, hashPassword, requireCode, sameOrigin, setSession, verifyPassword } from '../lib/security.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const code = await requireCode(req, res);
      return code && res.status(200).json({ loggedIn: true });
    }
    if (req.method === 'DELETE') { if (!sameOrigin(req)) return res.status(403).end(); clearSession(res); return res.status(204).end(); }
    if (req.method !== 'POST') return res.status(405).end();
    if (!sameOrigin(req)) return res.status(403).end();
    if (req.body?.action === 'renew') {
      const code = await requireCode(req, res);
      return code && res.status(200).json({ loggedIn: true, token: setSession(res, code) });
    }
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,80}$/.test(code)) return res.status(400).json({ error: 'Controleer je toegangscode.' });
    const record = await activeCode(code);
    if (!record) return res.status(401).json({ error: 'Toegangscode niet herkend.' });
    if (req.body?.action === 'check') return res.status(200).json({ needsPassword: !!record.wachtwoord });
    const password = String(req.body?.password || '');
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Gebruik een wachtwoord van minimaal 8 tekens.' });
    if (req.body?.action === 'register') {
      if (record.wachtwoord) return res.status(409).json({ error: 'Dit account heeft al een wachtwoord.' });
      // Voor productie dient de code voldoende willekeurig en geheim te zijn.
      const updated = await db('codes', { method: 'PATCH', query: `?code=eq.${encodeURIComponent(code)}&wachtwoord=is.null`, data: { wachtwoord: hashPassword(password) } });
      if (!updated?.length) return res.status(409).json({ error: 'Dit account heeft inmiddels een wachtwoord.' });
    } else if (req.body?.action === 'login') {
      if (!verifyPassword(password, code, record.wachtwoord)) return res.status(401).json({ error: 'Onjuist wachtwoord.' });
      if (!record.wachtwoord.startsWith('scrypt:')) await db('codes', { method: 'PATCH', query: `?code=eq.${encodeURIComponent(code)}`, data: { wachtwoord: hashPassword(password) } });
    } else return res.status(400).end();
    return res.status(200).json({ loggedIn: true, token: setSession(res, code) });
  } catch (error) { console.error('Bot session:', error.message); return res.status(500).json({ error: 'Inloggen lukt momenteel niet.' }); }
}

