import test from 'node:test';
import assert from 'node:assert/strict';
import { recordTestPurchase } from '../lib/purchaseStore.js';

const configured = {
  VERCEL_ENV: 'preview',
  BOT_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY: 'staging-fixture',
  SUPABASE_URL: 'https://ejtfgvlaygrcthjihwoa.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'production-fixture',
};

test('purchase storage refuses production, missing configuration and both live projects before network access', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Should not connect'); };
  for (const override of [
    { VERCEL_ENV: 'production' }, { VERCEL_ENV: undefined },
    { BOT_STAGING_SUPABASE_PROJECT_REF: undefined },
    { BOT_STAGING_SUPABASE_PROJECT_REF: 'ejtfgvlaygrcthjihwoa' },
    { BOT_STAGING_SUPABASE_PROJECT_REF: 'yvdkzswqfwycpoifxdxd' },
    { BOT_STAGING_SUPABASE_PROJECT_REF: 'example.com/path' },
    { BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY: undefined },
    { BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY: 'production-fixture' },
    { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/' },
    { BOT_AUTH_URL: 'https://abcdefghijklmnopqrst.supabase.co/' },
    { SUPABASE_URL: 'invalid' },
  ]) await assert.rejects(recordTestPurchase({}, { env: { ...configured, ...override }, fetcher }));
  assert.equal(calls, 0);
});

test('purchase storage uses only the staging credential and exact inbox RPC, and refuses redirects', async () => {
  const evidence = { p_order_item_id: '5', p_email: 'test@example.invalid' };
  const result = await recordTestPurchase(evidence, { env: configured, fetcher: async (url, options) => {
    assert.equal(url, 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/bot_record_purchase');
    assert.equal(options.headers.Authorization, 'Bearer staging-fixture');
    assert.equal(options.headers.apikey, 'staging-fixture');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), evidence);
    return { ok: true, json: async () => true };
  }});
  assert.equal(result, true);
});

test('storage failures are sanitized and only literal true confirms persistence', async () => {
  for (const fetcher of [
    async () => { throw new Error('PRIVATE credential'); },
    async () => ({ ok: false, json: async () => 'PRIVATE' }),
    async () => ({ ok: true, json: async () => { throw new Error('PRIVATE'); } }),
    ...[false, null, {}, 'true'].map(value => async () => ({ ok: true, json: async () => value })),
  ]) await assert.rejects(recordTestPurchase({}, { env: configured, fetcher }), { message: 'Purchase storage unavailable' });
});
