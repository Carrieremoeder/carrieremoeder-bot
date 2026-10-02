import { recordRestrictedPurchase } from './restrictedPurchaseStore.js';

// Purchase experiments must never fall back to the live app's database.
const LIVE_PROJECTS = new Set(['ejtfgvlaygrcthjihwoa', 'yvdkzswqfwycpoifxdxd']);

export async function recordTestPurchase(data, { env = process.env, fetcher = fetch } = {}) {
  if (env.BOT_TEST_STORAGE_MODE === 'restricted-postgres') return recordRestrictedPurchase(data, { env });
  if (env.BOT_TEST_STORAGE_MODE && env.BOT_TEST_STORAGE_MODE !== 'separate-project') throw new Error('Unknown test storage mode');
  const project = env.BOT_STAGING_SUPABASE_PROJECT_REF;
  const key = env.BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (env.VERCEL_ENV !== 'preview' || !/^[a-z]{20}$/.test(project || '')
      || LIVE_PROJECTS.has(project) || !key || key === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Isolated purchase storage required');
  }
  const origin = `https://${project}.supabase.co`;
  // Also protect a future production project after a migration.
  for (const configured of [env.SUPABASE_URL, env.BOT_AUTH_URL]) {
    if (!configured) continue;
    let live;
    try { live = new URL(configured).origin; } catch { throw new Error('Invalid database configuration'); }
    if (live === origin) throw new Error('Isolated purchase storage required');
  }
  try {
    const response = await fetcher(`${origin}/rest/v1/rpc/bot_record_purchase`, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok || await response.json() !== true) throw new Error('Storage rejected purchase');
    return true;
  } catch {
    // Never include a database error body, email or credential in diagnostics.
    throw new Error('Purchase storage unavailable');
  }
}
