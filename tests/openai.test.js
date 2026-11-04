import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { setSession } from '../lib/security.js';

test('OpenAI coach contract and authentication', async t => {
  process.env.BOT_SESSION_SECRET = 'test-secret-'.repeat(4);
  process.env.OPENAI_API_KEY = 'test-only';
  delete process.env.BOT_MODEL;
  const token = setSession({ setHeader() {} }, 'TEST-CODE');
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls, upstream;
  async function run(messages, options = {}) {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, ...init, body: JSON.parse(init.body) });
      if (upstream instanceof Error) throw upstream;
      return new Response(typeof upstream === 'string' ? upstream : JSON.stringify(upstream || { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ik help je.' }] }] }), { status: options.status || 200 });
    };
    const res = { chunks: [], setHeader() {}, write(chunk) { this.chunks.push(chunk); }, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; }, end() { this.ended = true; } };
    await handler({ method: 'POST', headers: { host: 'bot.example', origin: options.origin || 'https://bot.example', authorization: options.anonymous ? '' : `Bearer ${token}` }, body: { messages, stream: options.stream } }, res);
    return res;
  }
  await t.test('text and history reach OpenAI with server instructions, without storage', async () => {
    const res = await run([{ role: 'user', content: 'Hoi' }, { role: 'assistant', content: 'Hallo' }, { role: 'user', content: [{ type: 'text', text: 'Help' }] }]);
    assert.equal(res.code, 200);
    assert.equal(res.data.content[0].text, 'Ik help je.');
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(calls[0].headers.Authorization, 'Bearer test-only');
    assert.equal(calls[0].body.model, 'gpt-5.6-luna');
    assert.equal(calls[0].body.store, false);
    assert.equal(calls[0].body.reasoning.effort, 'low');
    assert.equal(calls[0].body.max_output_tokens, 3000);
    assert.ok(calls[0].body.instructions.length > 100);
    assert.equal(calls[0].body.input[1].content, 'Hallo');
    assert.equal(calls[0].body.input[2].content[0].type, 'input_text');
  });
  await t.test('unauthenticated and cross-origin requests never reach AI', async () => {
    assert.equal((await run([{ role: 'user', content: 'Hoi' }], { anonymous: true })).code, 401);
    assert.equal(calls.length, 0);
    assert.equal((await run([{ role: 'user', content: 'Hoi' }], { origin: 'https://other.example' })).code, 403);
    assert.equal(calls.length, 0);
  });
  await t.test('invalid content rejected before AI call', async () => {
    for (const content of [[null], [{ type: 'image', source: { media_type: 'image/png', data: 'YWJj' } }], [{ type: 'image', source: { media_type: 'text/html', data: 'YWJj' } }], {}]) {
      assert.equal((await run([{ role: 'user', content }])).code, 400);
      assert.equal(calls.length, 0);
    }
  });
  await t.test('stream forwards text only, requires completion and hides upstream errors', async () => {
    const frame = e => 'data: ' + JSON.stringify(e) + '\n\n';
    const delta = { type: 'response.output_text.delta', delta: 'Rustig aan.' };
    upstream = frame({ type: 'response.created' }) + frame(delta) + frame({ type: 'response.completed' });
    let res = await run([{ role: 'user', content: 'Hoi' }], { stream: true });
    assert.equal(calls[0].body.stream, true);
    assert.equal(res.chunks.join(''), frame({ type: 'text', text: 'Rustig aan.' }) + frame({ type: 'done' }));
    assert.ok(res.ended);
    for (const ending of ['', frame({ type: 'error', error: { message: 'private detail' } })]) {
      upstream = frame(delta) + ending;
      res = await run([{ role: 'user', content: 'Hoi' }], { stream: true });
      assert.ok(res.chunks.join('').includes('"type":"error"'));
      assert.ok(!res.chunks.join('').includes('private detail'));
      assert.ok(!res.chunks.join('').includes('"type":"done"'));
    }
  });
  await t.test('upstream errors and empty answers are failures, not saved replies', async () => {
    upstream = { error: { type: 'server_error', message: 'private upstream detail' } };
    const res = await run([{ role: 'user', content: 'Hoi' }], { status: 500 });
    assert.equal(res.code, 502);
    assert.ok(!JSON.stringify(res.data).includes('private'));
    upstream = { status: 'completed', output: [] };
    assert.equal((await run([{ role: 'user', content: 'Hoi' }])).code, 502);
    upstream = new Error('private network detail');
    assert.equal((await run([{ role: 'user', content: 'Hoi' }])).code, 500);
  });
});

