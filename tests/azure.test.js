import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { providers, CONTENT_FILTER_MESSAGE } from '../api/chat.js';
import { setSession } from '../lib/security.js';

const ok = text => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }), { status: 200 });

test('Azure EU first, OpenAI only as fallback', async t => {
  process.env.BOT_SESSION_SECRET = 'test-secret-'.repeat(4);
  process.env.OPENAI_API_KEY = 'openai-test';
  process.env.AZURE_OPENAI_API_KEY = 'azure-test';
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  delete process.env.BOT_MODEL;
  t.after(() => { delete process.env.AZURE_OPENAI_API_KEY; globalThis.fetch = originalFetch; });
  const originalFetch = globalThis.fetch;
  const token = setSession({ setHeader() {} }, 'TEST-CODE');
  let calls;
  async function run(responses, stream = false) {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    };
    const res = { chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(c); }, status(n) { this.code = n; return this; }, json(d) { this.data = d; return this; }, end() { this.ended = true; } };
    await handler({ method: 'POST', headers: { host: 'bot.example', origin: 'https://bot.example', authorization: `Bearer ${token}` }, body: { messages: [{ role: 'user', content: 'Hoi' }], stream } }, res);
    return res;
  }

  await t.test('provider order and settings', () => {
    const list = providers();
    assert.deepEqual(list.map(p => p.name), ['azure', 'openai']);
    assert.equal(list[0].url, 'https://carrieremoeder-7227-resource.openai.azure.com/openai/v1/responses');
    assert.equal(list[0].headers['api-key'], 'azure-test');
    assert.equal(list[0].model, 'gpt-5.6-luna');
    assert.deepEqual(providers({ OPENAI_API_KEY: 'x' }).map(p => p.name), ['openai']);
  });

  await t.test('normal answer comes from Azure, OpenAI is not called', async () => {
    const res = await run([ok('Vanuit Europa.')]);
    assert.equal(res.code, 200);
    assert.equal(res.data.content[0].text, 'Vanuit Europa.');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /openai\.azure\.com/);
    assert.equal(calls[0].body.store, false);
    assert.equal(calls[0].headers.Authorization, undefined);
  });

  await t.test('Azure outage, busy or network error falls back to OpenAI', async () => {
    for (const failure of [new Response('{}', { status: 503 }), new Response('{}', { status: 429 }), new Error('network')]) {
      const res = await run([failure, ok('Vangnet.')]);
      assert.equal(res.code, 200);
      assert.equal(res.data.content[0].text, 'Vangnet.');
      assert.equal(calls.length, 2);
      assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
    }
  });

  await t.test('content filter never goes to the US fallback and gives a calm message', async () => {
    const res = await run([new Response(JSON.stringify({ error: { code: 'content_filter', message: 'private' } }), { status: 400 })]);
    assert.equal(res.code, 422);
    assert.equal(res.data.error, CONTENT_FILTER_MESSAGE);
    assert.equal(calls.length, 1);
  });

  await t.test('other client errors are not retried', async () => {
    const res = await run([new Response(JSON.stringify({ error: { code: 'invalid_request' } }), { status: 400 })]);
    assert.equal(res.code, 502);
    assert.equal(calls.length, 1);
  });

  await t.test('content filter during streaming shows the calm message', async () => {
    const frame = e => 'data: ' + JSON.stringify(e) + '\n\n';
    const body = frame({ type: 'response.output_text.delta', delta: 'Rust' }) + frame({ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } });
    const res = await run([new Response(body, { status: 200 })], true);
    assert.ok(res.chunks.join('').includes(CONTENT_FILTER_MESSAGE));
    assert.ok(res.ended);
  });
});
