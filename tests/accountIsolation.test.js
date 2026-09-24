import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/conversations.js';
import { setSession } from '../lib/security.js';

test('two accounts remain isolated across reads, writes, deletion and invalid sessions', async () => {
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  const keys = ['BOT_SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.BOT_SESSION_SECRET = 'isolated-test-only-secret-32-characters';
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const active = new Set(['TEST-ALPHA', 'TEST-BETA']);
  const rows = new Map();
  let writes = 0;
  const cookieFor = code => {
    let cookie;
    setSession({ setHeader(_, value) { cookie = value.split(';')[0]; } }, code);
    return cookie;
  };
  const alpha = cookieFor('TEST-ALPHA'), beta = cookieFor('TEST-BETA');
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    const code = url.searchParams.get('code')?.replace(/^eq\./, '');
    if (url.pathname.endsWith('/codes')) {
      assert.equal(url.searchParams.get('actief'), 'eq.true');
      return new Response(JSON.stringify(active.has(code) ? [{ code }] : []));
    }
    assert.equal(url.pathname, '/rest/v1/chat');
    if (options.method === 'GET') {
      assert.ok(code, 'database read must be scoped to a code');
      return new Response(JSON.stringify(rows.has(code) ? [{ data: rows.get(code) }] : []));
    }
    assert.equal(options.method, 'POST');
    const payload = JSON.parse(options.body);
    rows.set(payload.code, payload.data);
    writes++;
    return new Response('[]');
  };
  const request = async (method, cookie, body, origin = 'https://test.invalid') => {
    const res = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
    await handler({ method, headers: { cookie, host: 'test.invalid', origin }, body, query: { code: 'TEST-BETA' } }, res);
    return res;
  };
  const history = text => [{ id: 1, title: text, date: 'test', messages: [{ role: 'user', content: text }] }];
  try {
    assert.equal((await request('PUT', alpha, { code: 'TEST-BETA', conversations: history('ALPHA ONLY') })).statusCode, 200);
    assert.equal((await request('PUT', beta, { code: 'TEST-ALPHA', conversations: history('BETA ONLY') })).statusCode, 200);
    assert.equal((await request('GET', alpha)).body.conversations[0].title, 'ALPHA ONLY');
    assert.equal((await request('GET', beta)).body.conversations[0].title, 'BETA ONLY');
    assert.equal((await request('DELETE', alpha, { code: 'TEST-BETA' })).statusCode, 200);
    assert.deepEqual((await request('GET', alpha)).body.conversations, []);
    assert.equal((await request('GET', beta)).body.conversations[0].title, 'BETA ONLY');
    const before = writes;
    assert.equal((await request('PUT', beta, { conversations: [] }, 'https://foreign.invalid')).statusCode, 403);
    assert.equal((await request('GET', undefined)).statusCode, 401);
    const token = beta.split('=')[1];
    const [body, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    claims.code = 'TEST-ALPHA';
    const forged = 'cm_bot_session=' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.' + signature;
    assert.equal((await request('GET', forged)).statusCode, 401);
    Date.now = () => previousNow() + 13 * 60 * 60 * 1000;
    assert.equal((await request('GET', beta)).statusCode, 401);
    Date.now = previousNow;
    active.delete('TEST-BETA');
    assert.equal((await request('DELETE', beta)).statusCode, 401);
    assert.equal(writes, before);
    assert.equal(rows.get('TEST-BETA')[0].title, 'BETA ONLY');
  } finally {
    Date.now = previousNow;
    globalThis.fetch = previousFetch;
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
});
