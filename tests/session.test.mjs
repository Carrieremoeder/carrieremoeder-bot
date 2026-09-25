import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTabSession, IDLE_MS, WARNING_MS, SESSION_KEY } from '../src/browserSession.js';
import { currentCode, setSession } from '../lib/security.js';
import { hashPassword } from '../lib/security.js';
import sessionHandler from '../api/session.js';

function fixture() {
  let time = 1000;
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const options = { storage, now: () => time };
  return { storage, options, advance: ms => { time += ms; }, create: navigationType => createTabSession({ ...options, navigationType }) };
}
test('new tabs cannot inherit a session, including cloned sessionStorage', () => {
  for (const navigation of ['navigate', 'back_forward', undefined]) {
    const f = fixture(); f.create().start('secret');
    assert.equal(f.create(navigation).token(), '');
    assert.equal(f.storage.getItem(SESSION_KEY), undefined);
  }
});
test('refresh keeps a valid session but cannot reset the inactivity clock', () => {
  const f = fixture(); f.create().start('secret');
  f.advance(IDLE_MS - WARNING_MS);
  const refreshed = f.create('reload');
  assert.equal(refreshed.token(), 'secret');
  assert.equal(refreshed.remaining(), WARNING_MS);
  f.advance(WARNING_MS);
  assert.equal(refreshed.token(), '');
  assert.equal(f.create('reload').token(), '');
});
test('real activity extends the deadline; checking and token renewal do not', () => {
  const f = fixture(); const session = f.create(); session.start('a');
  f.advance(10_000); session.touch();
  f.advance(IDLE_MS - 10_000); session.replace('b');
  assert.equal(session.remaining(), 10_000);
  f.advance(10_000);
  assert.equal(session.touch(), false);
  assert.equal(session.token(), '');
});
test('sleep and an input arriving after expiry cause logout, never revive it', () => {
  const f = fixture(); const session = f.create(); const reasons = [];
  session.subscribe(reason => reasons.push(reason)); session.start('a');
  f.advance(IDLE_MS + 5000);
  assert.equal(session.touch(), false);
  assert.deepEqual(reasons, ['idle']);
  session.replace('late-renewal');
  assert.equal(session.token(), '');
});
test('restricted storage falls back to memory and fails closed on a reload', () => {
  const storage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  const session = createTabSession({ storage }); session.start('a');
  assert.equal(session.token(), 'a'); session.clear(); assert.equal(session.token(), '');
  assert.equal(createTabSession({ storage, navigationType: 'reload' }).token(), '');
});
test('server requires signed per-tab authentication and rejects the old shared cookie', () => {
  process.env.BOT_SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
  const headers = {};
  const token = setSession({ setHeader: (key, value) => { headers[key] = value; } }, 'TEST-1234');
  assert.match(headers['Set-Cookie'], /Max-Age=0/);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${token}` } }), 'TEST-1234');
  assert.equal(currentCode({ headers: { cookie: `cm_bot_session=${token}` } }), null);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${token}tampered` } }), null);
  const signed = payload => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return body + '.' + createHmac('sha256', process.env.BOT_SESSION_SECRET).update(body).digest('base64url');
  };
  for (const payload of [
    { version: 2, code: 'TEST-1234', expires: Date.now() - 1 },
    { code: 'TEST-1234', expires: Date.now() + 12 * 60 * 60 * 1000 },
    { version: 2, code: 'TEST-1234', expires: Date.now() + 12 * 60 * 60 * 1000 },
  ]) assert.equal(currentCode({ headers: { authorization: `Bearer ${signed(payload)}` } }), null);
});

test('login, session validation and activity renewal require valid credentials and an active account', async () => {
  process.env.BOT_SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  const originalFetch = globalThis.fetch;
  let active = true;
  const record = { code: 'TEST-1234', wachtwoord: hashPassword('test-password') };
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify(active ? [record] : []) });
  async function call(method, body, token, origin = 'https://bot.example') {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.statusCode = s; return this; }, json(data) { this.data = data; return this; }, end() { return this; } };
    await sessionHandler({ method, body, headers: { host: 'bot.example', origin, ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res);
    return res;
  }
  try {
    assert.equal((await call('GET')).statusCode, 401);
    assert.equal((await call('POST', { action: 'renew' })).statusCode, 401);
    assert.equal((await call('POST', { action: 'login', code: 'TEST-1234', password: 'wrong-password' })).statusCode, 401);
    const login = await call('POST', { action: 'login', code: 'TEST-1234', password: 'test-password' });
    assert.equal(login.statusCode, 200); assert.ok(login.data.token);
    assert.equal((await call('GET', undefined, login.data.token)).statusCode, 200);
    const renewal = await call('POST', { action: 'renew' }, login.data.token);
    assert.equal(renewal.statusCode, 200); assert.ok(renewal.data.token);
    assert.equal((await call('POST', { action: 'renew' }, renewal.data.token, 'https://other.example')).statusCode, 403);
    active = false;
    assert.equal((await call('POST', { action: 'renew' }, renewal.data.token)).statusCode, 401);
  } finally { globalThis.fetch = originalFetch; }
});

