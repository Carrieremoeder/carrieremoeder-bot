import test from 'node:test';
import assert from 'node:assert/strict';
import { mollieReader } from '../lib/mollieReader.js';
const key = 'test_FakeUnitTestCredential';
test('reader refuses live credentials and arbitrary paths before sending requests', () => {
  for (const value of [undefined, '', 'live_example', 'test_bad\n']) assert.throws(() => mollieReader({key: value}));
  const reader = mollieReader({ key, fetcher: () => assert.fail('must not fetch') });
  for (const value of ['https://example.org', 'tr_a/../../x', 'tr_a?x=y', 'tr_a\n']) assert.throws(() => reader.payment(value));
  assert.throws(() => reader.subscription('cst_a', 'sub_a/other'));
});
test('reader fetches only fixed Mollie GET endpoints and blocks redirects', async () => {
  const calls = [];
  const reader = mollieReader({key, fetcher: async (url, options) => {
    calls.push({url, options});
    return {ok:true, json:async()=>({id:url.endsWith('tr_a')?'tr_a':'sub_b',resource:url.endsWith('tr_a')?'payment':'subscription',mode:'test'})};
  }});
  await reader.payment('tr_a'); await reader.subscription('cst_a','sub_b');
  assert.deepEqual(calls.map(x=>x.url), ['https://api.mollie.com/v2/payments/tr_a','https://api.mollie.com/v2/customers/cst_a/subscriptions/sub_b']);
  for (const {options} of calls) {
    assert.equal(options.method,'GET'); assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,`Bearer ${key}`); assert.ok(options.signal);
  }
});
test('reader rejects unexpected identity or mode and keeps provider secrets out of errors', async () => {
  for (const data of [null, {id:'tr_other',resource:'payment',mode:'test'}, {id:'tr_a',resource:'payment',mode:'live'}, {id:'tr_a',resource:'subscription',mode:'test'}]) {
    await assert.rejects(mollieReader({key,fetcher:async()=>({ok:true,json:async()=>data})}).payment('tr_a'),/identity mismatch/);
  }
  for (const fetcher of [async()=>{throw new Error(key)},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw new Error(key)}})]) {
    await assert.rejects(mollieReader({key,fetcher}).payment('tr_a'),error=>!error.message.includes(key));
  }
});

