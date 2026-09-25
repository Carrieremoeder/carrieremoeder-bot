import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { setSession } from '../lib/security.js';

test('Claude coach contract and authentication', async t => {
  process.env.BOT_SESSION_SECRET = 'test-secret-'.repeat(4);
  process.env.ANTHROPIC_API_KEY = 'test-only';
  process.env.SUPABASE_URL = 'https://database.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  let cookie;
  setSession({ setHeader: (name, value) => { cookie = value.split(';')[0]; } }, 'TEST-CODE');
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls, upstream;
  async function run(messages, options = {}) {
    calls = [];
    globalThis.fetch = async (url, init) => {
      if (url.startsWith(process.env.SUPABASE_URL)) return new Response(JSON.stringify([{ code: 'TEST-CODE' }]));
      calls.push({ url, ...init, body: JSON.parse(init.body) });
      if (upstream instanceof Error) throw upstream;
      return new Response(JSON.stringify(upstream || { content: [{ type: 'text', text: 'Ik help je.' }] }), { status: options.status || 200 });
    };
    const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; }, end() {} };
    await handler({ method: 'POST', headers: { host: 'bot.example', origin: options.origin || 'https://bot.example', cookie: options.anonymous ? '' : cookie }, body: { messages } }, res);
    return res;
  }
  await t.test('text, history and images reach Claude with server instructions', async () => {
    const res = await run([{ role: 'user', content: 'Hoi' }, { role: 'assistant', content: 'Hallo' }, { role: 'user', content: [{ type: 'image', source: { media_type: 'image/png', data: 'YWJj' } }, { type: 'text', text: 'Help' }] }]);
    assert.equal(res.code, 200);
    assert.equal(res.data.content[0].text, 'Ik help je.');
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
    assert.ok(calls[0].body.system.length > 100);
    assert.equal(calls[0].body.messages[2].content[0].source.type, 'base64');
    assert.equal(calls[0].body.max_tokens, 2200);
  });
  await t.test('unauthenticated and cross-origin requests never reach AI', async () => {
    assert.equal((await run([{ role: 'user', content: 'Hoi' }], { anonymous: true })).code, 401);
    assert.equal(calls.length, 0);
    assert.equal((await run([{ role: 'user', content: 'Hoi' }], { origin: 'https://other.example' })).code, 403);
    assert.equal(calls.length, 0);
  });
  await t.test('invalid content rejected before AI call', async () => {
    for (const content of [[null], [{ type: 'image', source: { media_type: 'text/html', data: 'YWJj' } }], {}]) {
      assert.equal((await run([{ role: 'user', content }])).code, 400);
      assert.equal(calls.length, 0);
    }
  });
  await t.test('upstream errors and empty answers are failures, not saved replies', async () => {
    upstream = { error: { type: 'overloaded_error', message: 'private upstream detail' } };
    const res = await run([{ role: 'user', content: 'Hoi' }], { status: 529 });
    assert.equal(res.code, 502);
    assert.ok(!JSON.stringify(res.data).includes('private'));
    upstream = { content: [] };
    assert.equal((await run([{ role: 'user', content: 'Hoi' }])).code, 502);
    upstream = new Error('private network detail');
    assert.equal((await run([{ role: 'user', content: 'Hoi' }])).code, 500);
  });
});

