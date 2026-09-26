import { db } from './security.js';
import { ACCOUNT_URL, ACCOUNT_PUBLIC_KEY } from './accountProvider.js';

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Vul een geldig e-mailadres in.');
  return email;
}
export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 128) throw new AuthError('Kies een wachtwoord van 8 tot 128 tekens.');
  return password;
}
export function accessAllowed(record, now = Date.now()) {
  if (!record?.actief) return false;
  if (record.access_until) {
    const end = Date.parse(record.access_until);
    if (!Number.isFinite(end) || end <= now) return false;
  }
  return true;
}

export async function authRequest(path, { method = 'POST', body, token } = {}) {
  const url = process.env.BOT_AUTH_URL || ACCOUNT_URL;
  const key = process.env.BOT_AUTH_PUBLIC_KEY || ACCOUNT_PUBLIC_KEY;
  if (!url || !key) throw new AuthError('Inloggen is nog niet volledig ingesteld.', 503);
  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/${path}`, {
      method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new AuthError('De accountdienst is tijdelijk niet bereikbaar. Probeer het opnieuw.', 503); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(data.code)) throw new AuthError('Te veel pogingen. Wacht even en probeer het opnieuw.', 429);
    if (data.code === 'email_not_confirmed') throw new AuthError('Bevestig eerst je e-mailadres via de mail in je inbox of spammap.', 401);
    if (data.code === 'email_address_not_authorized') throw new AuthError('E-mailverzending is nog niet gereed. Neem contact op met Carrièremoeder.', 503);
    if (data.code === 'weak_password' || data.code === 'same_password') throw new AuthError('Kies een ander, sterker wachtwoord.');
    if (path.startsWith('token?')) throw new AuthError('E-mailadres of wachtwoord onjuist. Heb je nog geen account? Kies Account aanmaken.', 401);
    if (path.startsWith('signup') && ['user_already_exists', 'email_exists'].includes(data.code)) return {};
    if (path.startsWith('recover') && response.status < 500 && !['email_address_invalid', 'email_address_not_authorized'].includes(data.code)) return {};
    if (path === 'user' || path === 'verify') throw new AuthError('Deze link is verlopen of al gebruikt. Vraag een nieuwe herstellink aan.', 401);
    throw new AuthError('Dit lukt momenteel niet. Probeer het later opnieuw.', response.status >= 500 ? 503 : 400);
  }
  return data;
}

export function requireVerifiedUser(user) {
  if (!user?.id || !user.email_confirmed_at || !user.email) throw new AuthError('Bevestig eerst je e-mailadres.', 401);
  return { id: user.id, email: normaliseEmail(user.email) };
}

export async function botAccountForUser(rawUser) {
  const user = requireVerifiedUser(rawUser);
  const fields = 'code,email,actief,access_type,access_until,auth_user_id';
  const bound = await db('codes', { query: `?auth_user_id=eq.${encodeURIComponent(user.id)}&select=${fields}&limit=2` });
  if (bound?.length === 1 && accessAllowed(bound[0])) return bound[0];
  if (bound?.length) throw new AuthError('Je bottoegang is niet actief. Neem contact op met Carrièremoeder als je al hebt betaald.', 403);
  // Escape PostgREST/SQL pattern characters: an underscore in an email is literal.
  const pattern = user.email.replace(/[\\%_*]/g, '\\$&');
  const matches = await db('codes', { query: `?email=ilike.${encodeURIComponent(pattern)}&auth_user_id=is.null&select=${fields}&limit=2` });
  const candidates = (matches || []).filter(row => String(row.email).trim().toLowerCase() === user.email);
  if (candidates.length !== 1 || !accessAllowed(candidates[0])) throw new AuthError('We vinden nog geen actieve bottoegang bij dit e-mailadres. Gebruik het e-mailadres van je aankoop of neem contact op met Carrièremoeder.', 403);
  const account = candidates[0];
  const linked = await db('codes', { method: 'PATCH', query: `?code=eq.${encodeURIComponent(account.code)}&auth_user_id=is.null&actief=eq.true`, data: { auth_user_id: user.id } });
  if (linked?.length === 1 && accessAllowed(linked[0])) return linked[0];
  // A simultaneous login may have linked this same user first.
  const current = await db('codes', { query: `?code=eq.${encodeURIComponent(account.code)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=${fields}&limit=1` });
  if (current?.length === 1 && accessAllowed(current[0])) return current[0];
  throw new AuthError('Je toegang kon niet worden gekoppeld. Probeer opnieuw in te loggen.', 403);
}

export async function handleEmailAction(req, res, issueSession) {
  const action = req.body?.action;
  const redirect = encodeURIComponent('https://bot.carrieremoeder.com/');
  if (action === 'email-login') {
    const email = normaliseEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!password || password.length > 128) throw new AuthError('Vul je e-mailadres en wachtwoord in.');
    const data = await authRequest('token?grant_type=password', { body: { email, password } });
    const account = await botAccountForUser(data.user);
    // Never send the account provider's access/refresh token to the bot browser.
    return res.status(200).json({ loggedIn: true, token: issueSession(res, account.code) });
  }
  if (action === 'email-signup') {
    await authRequest(`signup?redirect_to=${redirect}`, { body: { email: normaliseEmail(req.body.email), password: validatePassword(req.body.password) } });
    return res.status(200).json({ sent: true });
  }
  if (action === 'email-recover') {
    await authRequest(`recover?redirect_to=${redirect}`, { body: { email: normaliseEmail(req.body.email) } });
    return res.status(200).json({ sent: true });
  }
  if (action === 'email-confirm') {
    const tokenHash = String(req.body.tokenHash || '');
    if (!/^[a-zA-Z0-9_-]{20,2000}$/.test(tokenHash)) throw new AuthError('Deze bevestigingslink is ongeldig.');
    const data = await authRequest('verify', { body: { token_hash: tokenHash, type: 'email' } });
    requireVerifiedUser(data.user);
    return res.status(200).json({ confirmed: true });
  }
  if (action === 'email-reset') {
    const password = validatePassword(req.body.password);
    let token = String(req.body.recoveryToken || '');
    if (req.body.tokenHash) {
      const tokenHash = String(req.body.tokenHash);
      if (!/^[a-zA-Z0-9_-]{20,2000}$/.test(tokenHash)) throw new AuthError('Deze herstellink is ongeldig.');
      const data = await authRequest('verify', { body: { token_hash: tokenHash, type: 'recovery' } });
      token = data.access_token;
    }
    if (!token || token.length > 8192) throw new AuthError('Deze herstellink is ongeldig.', 401);
    const user = await authRequest('user', { method: 'GET', token });
    requireVerifiedUser(user);
    await authRequest('user', { method: 'PUT', token, body: { password } });
    return res.status(200).json({ updated: true });
  }
  throw new AuthError('Onbekende accountactie.');
}

