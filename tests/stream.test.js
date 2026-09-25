import test from 'node:test';
import assert from 'node:assert/strict';
import { readCoachReply } from '../lib/coachStream.js';

const encode = event => 'data: ' + JSON.stringify(event) + '\r\n\r\n';
function response(events) {
  const bytes = new TextEncoder().encode(events.map(encode).join(''));
  return new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
}
test('renders incremental text across single-byte UTF-8 chunks', async () => {
  const updates = [];
  assert.equal(await readCoachReply(response([{ type: 'text', text: 'Rustig ' }, { type: 'text', text: 'hé 😊' }, { type: 'done' }]), t => updates.push(t)), 'Rustig hé 😊');
  assert.deepEqual(updates, ['Rustig ', 'Rustig hé 😊']);
});
test('partial, error and empty streams cannot become saved replies', async () => {
  for (const events of [[{ type: 'text', text: 'Onvolledig' }], [{ type: 'text', text: 'Onvolledig' }, { type: 'error' }], [{ type: 'done' }]]) {
    await assert.rejects(readCoachReply(response(events), () => {}));
  }
});
test('first text is visible before upstream finishes', async () => {
  let controller;
  const response = new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { 'content-type': 'text/event-stream' } });
  let sawText;
  const firstText = new Promise(resolve => { sawText = resolve; });
  const completed = readCoachReply(response, sawText);
  controller.enqueue(new TextEncoder().encode(encode({ type: 'text', text: 'Begin' })));
  assert.equal(await firstText, 'Begin');
  controller.enqueue(new TextEncoder().encode(encode({ type: 'done' })));
  controller.close();
  assert.equal(await completed, 'Begin');
});
test('older JSON replies and HTTP errors remain compatible', async () => {
  assert.equal(await readCoachReply(Response.json({ content: [{ text: 'Hallo' }] }), () => {}), 'Hallo');
  await assert.rejects(readCoachReply(Response.json({ error: 'Log opnieuw in.' }, { status: 401 }), () => {}), /Log opnieuw/);
});

