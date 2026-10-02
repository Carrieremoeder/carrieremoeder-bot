import { db, activeCode, currentCode } from './security.js';

export async function canManageSubscription(code) {
  if (process.env.BOT_SUBSCRIPTIONS_ENABLED !== 'true') return false;
  const rows = await db('bot_contracts', { query: `?code=eq.${encodeURIComponent(code)}&closed_at=is.null&select=id&limit=2` });
  return rows?.length === 1;
}

export async function sessionAccess(req) {
  const code = currentCode(req, { allowManagement: true });
  if (!code) return null;
  // Management credentials never become chat credentials on renewal.
  if (currentCode(req) && await activeCode(code)) return { code, chatAccess: true };
  if (await canManageSubscription(code)) return { code, chatAccess: false };
  return null;
}
