import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/session.js';
import { accessAllowed, botAccountForUser, normaliseEmail } from '../lib/emailAuth.js';

const user = { id: '11111111-2222-4333-8444-555555555555', email: 'test_name@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
function setup() {
  process.env.SUPABASE_URL = 'https://bot-db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.BOT_AUTH_URL = 'https://accounts.example';
  process.env.BOT_AUTH_PUBLIC_KEY = 'test-public-key';
  process.env.BOT_SESSION_SECRET = 'test-session-secret-more-than-32-characters';
}
function response(data, status = 200) { return { ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }; }
async function request(body, origin = 'https://bot.example') {
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.data = value; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { origin, host: 'bot.example' }, body }, res);
  return res;
}
test('normalisation and entitlement expiry fail closed', () => {
  assert.equal(normaliseEmail(' Test_Name@Example.com '), 'test_name@example.com');
  assert.throws(() => normaliseEmail('not-an-email'));
  assert.equal(accessAllowed({ actief: false }), false);
  assert.equal(accessAllowed({ actief: true, access_until: 'bad-date' }), false);
  assert.equal(accessAllowed({ actief: true, access_until: '2020-01-01' }), false);
  assert.equal(accessAllowed({ actief: true, access_type: 'lifetime' }), true);
});
test('email login verifies the account, binds the existing chat code and never returns provider credentials', async () => {
  setup(); const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/token')) return response({ user, access_token: 'provider-secret', refresh_token: 'refresh-secret' });
    if (options.method === 'PATCH') return response([{ code: 'EXISTING-CODE', email: user.email, auth_user_id: user.id, actief: true }]);
    if (url.includes('auth_user_id=eq.')) return response([]);
    return response([{ code: 'EXISTING-CODE', email: user.email, actief: true }]);
  };
  try {
    const res = await request({ action: 'email-login', email: 'TEST_NAME@example.com', password: 'test-password' });
    assert.equal(res.statusCode, 200); assert.ok(res.data.token);
    const payload = JSON.parse(Buffer.from(res.data.token.split('.')[0], 'base64url'));
    assert.equal(payload.code, 'EXISTING-CODE');
    assert.equal(JSON.stringify(res.data).includes('provider-secret'), false);
    assert.equal(calls[0].options.headers.apikey, 'test-public-key');
    const lookup = calls.find(call => call.url.includes('email=ilike'));
    assert.match(decodeURIComponent(lookup.url), /email=ilike.test\\_name@example.com/);
    const binding = calls.find(call => call.options.method === 'PATCH');
    assert.deepEqual(JSON.parse(binding.options.body), { auth_user_id: user.id });
  } finally { globalThis.fetch = original; }
});
test('unconfirmed email, unpaid accounts, duplicates and expired access cannot open chats', async () => {
  setup(); const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw Error('must not fetch for an unconfirmed identity'); };
    await assert.rejects(botAccountForUser({ ...user, email_confirmed_at: null }), /Bevestig/);
    for (const rows of [[], [{ code: 'ONE', email: user.email, actief: false }], [{ code: 'ONE', email: user.email, actief: true, access_until: '2020-01-01' }], [{ code: 'ONE', email: user.email, actief: true }, { code: 'TWO', email: user.email, actief: true }]]) {
      globalThis.fetch = async url => response(url.includes('auth_user_id=eq.') ? [] : rows);
      await assert.rejects(botAccountForUser(user), error => error.status === 403);
    }
  } finally { globalThis.fetch = original; }
});
test('a prior stable account binding wins over an email change', async () => {
  setup(); const original = globalThis.fetch; let count = 0;
  globalThis.fetch = async () => { count++; return response([{ code: 'BOUND-CODE', actief: true, auth_user_id: user.id, email: 'old@example.com' }]); };
  try { assert.equal((await botAccountForUser(user)).code, 'BOUND-CODE'); assert.equal(count, 1); }
  finally { globalThis.fetch = original; }
});
test('signup and recovery use the fixed bot return URL and do not grant paid access', async () => {
  setup(); const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response({ user, access_token: 'not-a-bot-session' }); };
  try {
    for (const action of ['email-signup', 'email-recover']) {
      const res = await request({ action, email: user.email, password: 'test-password', redirectTo: 'https://attacker.example' });
      assert.equal(res.statusCode, 200); assert.deepEqual(res.data, { sent: true });
    }
    assert.equal(calls.length, 2);
    for (const call of calls) assert.equal(new URL(call.url).searchParams.get('redirect_to'), 'https://bot.carrieremoeder.com/');
  } finally { globalThis.fetch = original; }
});
test('reset verifies the recovery session and uses only its identity when changing a password', async () => {
  setup(); const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response(user); };
  try {
    const res = await request({ action: 'email-reset', recoveryToken: 'user-recovery-token', email: 'someone-else@example.com', password: 'new-password' });
    assert.equal(res.statusCode, 200); assert.deepEqual(res.data, { updated: true });
    assert.deepEqual(calls.map(call => call.options.method), ['GET', 'PUT']);
    for (const call of calls) assert.equal(call.options.headers.Authorization, 'Bearer user-recovery-token');
    assert.deepEqual(JSON.parse(calls[1].options.body), { password: 'new-password' });
    calls.length = 0;
    assert.equal((await request({ action: 'email-reset', password: 'new-password' })).statusCode, 401);
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = original; }
});
test('account failures, throttling and cross-origin requests do not leak tokens or account details', async () => {
  setup(); const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ code: 'invalid_credentials', message: 'private details' }, 400);
    const res = await request({ action: 'email-login', email: user.email, password: 'wrong' });
    assert.equal(res.statusCode, 401); assert.equal(res.data.error.includes('private details'), false);
    globalThis.fetch = async () => response({ code: 'over_email_send_rate_limit' }, 429);
    assert.equal((await request({ action: 'email-recover', email: user.email })).statusCode, 429);
    globalThis.fetch = async () => { throw Error('cross-origin must not reach provider'); };
    assert.equal((await request({ action: 'email-login', email: user.email, password: 'anything' }, 'https://attacker.example')).statusCode, 403);
  } finally { globalThis.fetch = original; }
});

