import test from 'node:test';
import assert from 'node:assert/strict';
import session from '../api/session.js';
import subscription from '../api/subscription.js';
import { currentCode, requireCode, setSession } from '../lib/security.js';
import { BOT_PLAN } from '../lib/subscriptionPolicy.js';

const user = { id: 'verified-account', email: 'owner@example.invalid', email_confirmed_at: '2026-01-01' };
const account = { code: 'OWNER-CODE', auth_user_id: user.id, actief: true, access_until: '2020-01-01' };
const contract = { id: 'contract-one', code: account.code, plan_version: BOT_PLAN.version, starts_on: '2026-01-01', paid_until: '2026-02-01', cancel_requested_on: null, ends_on: null };
function response() { return { statusCode: 200, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.data = value; return this; }, end() { return this; } }; }
function req(token, method = 'GET', body) { return { method, body, headers: { host: 'bot.example', origin: 'https://bot.example', authorization: `Bearer ${token}` } }; }
const reply = data => ({ ok: true, json: async () => data, text: async () => JSON.stringify(data) });

test('expired verified owner can manage and cancel; management credentials never grant or renew chat access', async () => {
  const saved = { ...process.env }; const original = globalThis.fetch;
  Object.assign(process.env, { BOT_SUBSCRIPTIONS_ENABLED: 'true', BOT_SESSION_SECRET: 'test-secret-with-more-than-32-characters', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-key', BOT_AUTH_URL: 'https://auth.example', BOT_AUTH_PUBLIC_KEY: 'test-public' });
  let active = false;
  let contracts = [contract];
  globalThis.fetch = async (url, options) => {
    if (url.includes('/auth/v1/')) return reply({ user });
    if (url.includes('/codes')) return reply([{ ...account, access_until: active ? null : account.access_until }]);
    if (url.includes('/bot_contracts')) {
      if (options.method === 'PATCH') contracts = [{ ...contracts[0], ...JSON.parse(options.body) }];
      return reply(contracts);
    }
    throw Error('Unexpected network request');
  };
  try {
    const login = response();
    await session(req('', 'POST', { action: 'email-login', email: user.email, password: 'example-password' }), login);
    assert.equal(login.statusCode, 200); assert.equal(login.data.chatAccess, false);
    const token = login.data.token;
    assert.equal(currentCode(req(token)), null);
    assert.equal(currentCode(req(token), { allowManagement: true }), account.code);
    const denied = response();
    assert.equal(await requireCode(req(token), denied), null); assert.equal(denied.statusCode, 401);
    const status = response(); await subscription(req(token), status);
    assert.equal(status.statusCode, 200);
    const cancel = response(); await subscription(req(token, 'POST', { action: 'cancel', code: 'OTHER-CODE' }), cancel);
    assert.equal(cancel.statusCode, 200); assert.ok(cancel.data.cancelRequestedOn);
    active = true;
    const renewal = response(); await session(req(token, 'POST', { action: 'renew' }), renewal);
    assert.equal(renewal.data.chatAccess, false);
    assert.equal(currentCode(req(renewal.data.token)), null);
    const reload = response(); await session(req(renewal.data.token), reload);
    assert.equal(reload.data.chatAccess, false);
    contracts = [];
    const closed = response(); await session(req(token, 'POST', { action: 'renew' }), closed);
    assert.equal(closed.statusCode, 401);
    contracts = [contract]; process.env.BOT_SUBSCRIPTIONS_ENABLED = 'false';
    const disabled = response(); await session(req(token), disabled);
    assert.equal(disabled.statusCode, 401);
  } finally { globalThis.fetch = original; process.env = saved; }
});

test('expired login requires one existing identity binding and one contract; feature gate stays closed', async () => {
  const saved = { ...process.env }; const original = globalThis.fetch;
  Object.assign(process.env, { BOT_SUBSCRIPTIONS_ENABLED: 'true', BOT_SESSION_SECRET: 'test-secret-with-more-than-32-characters', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
  try {
    for (const [bound, contracts, enabled] of [[[], [contract], 'true'], [[account, account], [contract], 'true'], [[account], [], 'true'], [[account], [contract, contract], 'true'], [[account], [contract], 'false']]) {
      process.env.BOT_SUBSCRIPTIONS_ENABLED = enabled;
      globalThis.fetch = async (url, options) => {
        assert.notEqual(options.method, 'PATCH');
        if (url.includes('/auth/v1/')) return reply({ user });
        if (url.includes('/bot_contracts')) return reply(contracts);
        return reply(url.includes('auth_user_id=eq.') ? bound : [account]);
      };
      const result = response(); await session(req('', 'POST', { action: 'email-login', email: user.email, password: 'example-password' }), result);
      assert.equal(result.statusCode, 403); assert.equal(result.data.token, undefined);
    }
    const token = setSession(response(), account.code, 'management');
    assert.equal(currentCode(req(token + 'tampered'), { allowManagement: true }), null);
  } finally { globalThis.fetch = original; process.env = saved; }
});
