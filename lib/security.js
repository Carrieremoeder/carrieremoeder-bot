import { createHmac, timingSafeEqual } from 'node:crypto';

// Sessies en inloglinks zijn ondertekend met BOT_SESSION_SECRET. Er is geen database nodig:
// de server bewaart geen sessies, geen wachtwoorden en geen klantgegevens.
const TTL = 30 * 60;
export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
const cookieName = 'cm_bot_session';

function secret() {
  const value = process.env.BOT_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('BOT_SESSION_SECRET ontbreekt of is te kort');
  return value;
}
function mac(value) { return createHmac('sha256', secret()).update(value).digest('base64url'); }

function readSigned(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [body, signature] = token.split('.');
  const expected = mac(body);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function currentCode(req) {
  const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return null;
  const data = readSigned(token);
  if (!data) return null;
  const { code, expires, version } = data;
  return version === 2 && typeof code === 'string' && /^[A-Z0-9-]{4,80}$/.test(code) && Number.isFinite(expires) && expires > Date.now() && expires <= Date.now() + TTL * 1000 ? code : null;
}
export function setSession(res, code) {
  clearSession(res);
  return sign({ version: 2, code, expires: Date.now() + TTL * 1000 });
}
export function clearSession(res) { res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`); }

// Inloglink: bevat alleen het Systeme.io-contactnummer en een tijdstip, 15 minuten geldig.
export function createLoginToken(contactId, now = Date.now()) {
  return sign({ purpose: 'login', cid: String(contactId), iat: now, exp: now + LOGIN_LINK_TTL_MS });
}
export function readLoginToken(token, now = Date.now()) {
  const data = readSigned(token);
  if (!data || data.purpose !== 'login' || !/^\d{1,20}$/.test(String(data.cid || ''))) return null;
  if (!Number.isFinite(data.exp) || data.exp <= now || data.exp > now + LOGIN_LINK_TTL_MS) return null;
  return { contactId: String(data.cid), issuedAt: data.iat };
}
export function issuedAtOfLink(link) {
  try {
    const token = new URL(link).searchParams.get('login');
    const data = readSigned(token);
    return data?.purpose === 'login' && Number.isFinite(data.iat) ? data.iat : 0;
  } catch { return 0; }
}

export async function requireCode(req, res) {
  const code = currentCode(req);
  if (!code) { res.status(401).json({ error: 'Log opnieuw in.' }); return null; }
  return code;
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
