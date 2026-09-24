import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeConversations } from '../lib/conversationStorage.js';
import handler from '../api/conversations.js';
import { setSession } from '../lib/security.js';

const conversation = messages => [{ id: 1, title: 'Test', date: '24-9-2026', messages }];
test('screenshots and metadata are removed without changing input', () => {
  const input = conversation([{ role: 'user', content: [{ type: 'image', source: { data: 'x'.repeat(400000) } }, { type: 'text', text: 'Hallo' }], display: { text: 'Hallo', image: 'PRIVATE' }, secret: 'PRIVATE' }, { role: 'assistant', content: 'Antwoord', display: { image: 'PRIVATE' } }]);
  input[0].preview = 'PRIVATE';
  const output = sanitizeConversations(input);
  assert.ok(JSON.stringify(output).length < 300000);
  assert.ok(!JSON.stringify(output).includes('PRIVATE'));
  assert.deepEqual(output[0].messages, [{ role: 'user', content: 'Hallo', display: 'Hallo' }, { role: 'assistant', content: 'Antwoord', display: 'Antwoord' }]);
  assert.equal(input[0].preview, 'PRIVATE');
});
test('image-only messages retain a placeholder and all text parts survive', () => {
  assert.equal(sanitizeConversations(conversation([{ role: 'user', content: [{ type: 'image' }] }]))[0].messages[0].content, '[afbeelding]');
  assert.equal(sanitizeConversations(conversation([{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }]))[0].messages[0].content, 'a\nb');
});
test('malformed input is rejected', () => {
  for (const input of [null, [null], conversation([null]), conversation([{ role: 'system', content: 'x' }]), [{ id: 1, title: 't', date: 'd', messages: {} }]]) assert.throws(() => sanitizeConversations(input), TypeError);
  assert.deepEqual(sanitizeConversations([]), []);
});
test('storage route uses session code, strips fields, rejects malformed input without writing', async () => {
  const previous = globalThis.fetch;
  const env = { ...process.env };
  process.env.BOT_SESSION_SECRET = 'test-only-secret'.repeat(4);
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  let token;
  setSession({ setHeader: (_, value) => { token = value.split(';')[0]; } }, 'TEST-ACCOUNT');
  const writes = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === 'GET') return new Response(JSON.stringify([{ code: 'TEST-ACCOUNT', wachtwoord: 'unused' }]));
    writes.push(JSON.parse(options.body));
    return new Response('[]');
  };
  const run = async body => {
    const res = { setHeader() {}, status(s) { this.code = s; return this; }, json(data) { this.data = data; return this; }, end() {} };
    await handler({ method: 'PUT', headers: { host: 'test.invalid', origin: 'https://test.invalid', cookie: token }, body }, res);
    return res;
  };
  try {
    const result = await run({ code: 'OTHER-ACCOUNT', conversations: conversation([{ role: 'user', content: 'hello', display: { image: 'PRIVATE' } }]) });
    assert.equal(result.code, 200);
    assert.equal(writes[0].code, 'TEST-ACCOUNT');
    assert.ok(!JSON.stringify(writes).includes('PRIVATE'));
    assert.equal((await run({ conversations: [null] })).code, 400);
    assert.equal(writes.length, 1);
    assert.equal((await run({ conversations: conversation([{ role: 'user', content: 'x'.repeat(300001) }]) })).code, 413);
    assert.equal(writes.length, 1);
  } finally {
    globalThis.fetch = previous;
    for (const key of ['BOT_SESSION_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
});
