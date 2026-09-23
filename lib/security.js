import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TTL = 12 * 60 * 60;
const cookieName = 'cm_bot_session';
function secret() {
  const value = process.env.BOT_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('BOT_SESSION_SECRET ontbreekt of is te kort');
  return value;
}
function mac(value) { return createHmac('sha256', secret()).update(value).digest('base64url'); }
function cookie(req) { return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1); }
export function currentCode(req) {
  const token = cookie(req);
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = mac(body);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { code, expires } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof code === 'string' && /^[A-Z0-9-]{4,80}$/.test(code) && expires > Date.now() ? code : null;
  } catch { return null; }
}
export function setSession(res, code) {
  const body = Buffer.from(JSON.stringify({ code, expires: Date.now() + TTL * 1000 })).toString('base64url');
  res.setHeader('Set-Cookie', `${cookieName}=${body}.${mac(body)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL}`);
}
export function clearSession(res) { res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`); }
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, code, saved) {
  if (typeof saved !== 'string') return false;
  if (saved.startsWith('scrypt:')) {
    const [,salt,hash] = saved.split(':');
    if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
    return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
  }
  // Oude browseropslag gebruikte base64(wachtwoord + toegangscode). Na login omzetten.
  const old = Buffer.from(saved), actual = Buffer.from(Buffer.from(password + code).toString('base64'));
  return old.length === actual.length && timingSafeEqual(old, actual);
}
export async function db(table, { method = 'GET', query = '', data } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Databaseconfiguratie ontbreekt');
  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  if (!response.ok) throw new Error(`Databasefout ${response.status}`);
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}
export async function activeCode(code) {
  const rows = await db('codes', { query: `?code=eq.${encodeURIComponent(code)}&actief=eq.true&select=code,wachtwoord&limit=1` });
  return rows?.[0] || null;
}
export async function requireCode(req, res) {
  const code = currentCode(req);
  if (!code || !(await activeCode(code))) { res.status(401).json({ error: 'Log opnieuw in.' }); return null; }
  return code;
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
