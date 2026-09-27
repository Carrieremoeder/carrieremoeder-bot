import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/subscription.js';
import { setSession } from '../lib/security.js';
import { BOT_PLAN } from '../lib/subscriptionPolicy.js';

const base = { id: '11111111-2222-4333-8444-555555555555', code: 'OWNER-CODE', plan_version: BOT_PLAN.version, starts_on: '2026-01-01', paid_until: '2026-02-01', cancel_requested_on: null, ends_on: null, provider_sync: 'ready' };
function res() { return { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return this; }, end() { return this; } }; }
function setup() {
  process.env.BOT_SUBSCRIPTIONS_ENABLED = 'true';
  process.env.BOT_SESSION_SECRET = 'subscription-test-session-secret-more-than-32';
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  return setSession(res(), 'OWNER-CODE');
}
async function request(token, method = 'POST', body = { action: 'cancel' }, origin = 'https://bot.example') {
  const output = res();
  await handler({ method, body, headers: { authorization: `Bearer ${token}`, host: 'bot.example', origin } }, output);
  return output;
}
const reply = data => ({ ok: true, text: async () => JSON.stringify(data) });
test('disabled endpoint, unauthenticated and cross-origin cancellation never access storage', async () => {
  const token = setup(); const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected database access'); };
  try {
    process.env.BOT_SUBSCRIPTIONS_ENABLED = 'false';
    assert.equal((await request(token)).statusCode, 503);
    process.env.BOT_SUBSCRIPTIONS_ENABLED = 'true';
    assert.equal((await request('invalid')).statusCode, 401);
    assert.equal((await request(token, 'POST', { action: 'cancel' }, 'https://evil.example')).statusCode, 403);
  } finally { globalThis.fetch = original; }
});
test('cancel uses authenticated identity, server date and conditional persistence; does not claim incasso has stopped', async () => {
  const token = setup(); const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return reply([options.method === 'PATCH' ? { ...base, ...JSON.parse(options.body) } : base]);
  };
  try {
    const output = await request(token, 'POST', { action: 'cancel', code: 'VICTIM', endsOn: '2020-01-01' });
    assert.equal(output.statusCode, 200); assert.equal(output.data.processing, true);
    assert.equal(output.data.endsOn >= '2027-01-01', true);
    assert.ok(calls.every(call => call.url.includes('code=eq.OWNER-CODE')));
    assert.match(calls[1].url, /cancel_requested_on=is.null/);
    assert.equal(JSON.stringify(output.data).includes('OWNER-CODE'), false);
    assert.match(output.data.message, /apart bevestigd/);
  } finally { globalThis.fetch = original; }
});
test('concurrent cancellation returns winning persisted date', async () => {
  const token = setup(); const original = globalThis.fetch; let count = 0;
  globalThis.fetch = async () => reply(++count === 1 ? [base] : count === 2 ? [] : [{ ...base, cancel_requested_on: '2026-01-02', ends_on: '2027-01-01', provider_sync: 'pending' }]);
  try {
    const output = await request(token); assert.equal(output.statusCode, 200);
    assert.equal(output.data.cancelRequestedOn, '2026-01-02'); assert.equal(output.data.endsOn, '2027-01-01');
  } finally { globalThis.fetch = original; }
});
test('missing, ambiguous and unsupported contracts never schedule provider actions', async () => {
  const token = setup(); const original = globalThis.fetch;
  try {
    for (const [rows, status] of [[[],404], [[base,base],409], [[{...base,plan_version:'legacy'}],409]]) {
      globalThis.fetch = async (_url, options) => { assert.equal(options.method, 'GET'); return reply(rows); };
      assert.equal((await request(token)).statusCode, status);
    }
  } finally { globalThis.fetch = original; }
});
test('database outage returns failure, never a false cancellation confirmation', async () => {
  const token = setup(); const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('private database error'); };
  try { const output = await request(token); assert.equal(output.statusCode, 503); assert.equal(JSON.stringify(output).includes('private database'), false); }
  finally { globalThis.fetch = original; }
});

