import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../api/systeme-sale.js';
import { mollieReader } from '../lib/mollieReader.js';
import { systemePayload, saleIdentity, firstPaidPeriod } from '../lib/purchaseVerification.js';

// Offline contract test: real application components, simulated provider/storage.
// No real customer records, network calls, collection or entitlement writes.
test('offline purchase flow authenticates intake, deduplicates evidence and rechecks payment state', async t => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const expected = { funnelId: '1', stepId: '2', pricePlanId: '3' };
  Object.assign(process.env, {
    VERCEL_ENV: 'preview', BOT_PURCHASE_INTAKE_ENABLED: 'true',
    BOT_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY: 'offline-fixture-only',
    SYSTEME_WEBHOOK_SECRET: 'offline-only-signing-secret-at-least-32-characters',
    SYSTEME_BOT_FUNNEL_ID: '1', SYSTEME_BOT_STEP_ID: '2', SYSTEME_BOT_PRICE_PLAN_ID: '3',
    SUPABASE_URL: 'https://ejtfgvlaygrcthjihwoa.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unused-production-placeholder',
  });
  delete process.env.BOT_AUTH_URL;
  const body = {
    customer: { id: 4, email: 'offline@example.invalid', paymentProcessor: 'mollie' },
    funnelStep: { id: 2, funnel: { id: 1 } }, orderItem: { id: 5 },
    pricePlan: { id: 3, amount: 1300, currency: 'EUR' },
  };
  const signature = createHmac('sha256', process.env.SYSTEME_WEBHOOK_SECRET).update(systemePayload(body)).digest('hex');
  const payment = {
    resource: 'payment', id: 'tr_offline', mode: 'test', customerId: 'cst_offline',
    metadata: { sio_order_item_id: 5 }, status: 'open', sequenceType: 'first',
    amount: { currency: 'EUR', value: '13.00' },
    amountRefunded: { currency: 'EUR', value: '0.00' },
    amountChargedBack: { currency: 'EUR', value: '0.00' },
    paidAt: '2026-01-31T12:00:00Z',
  };
  const inbox = new Map();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url === 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/bot_record_purchase') {
      const evidence = JSON.parse(options.body);
      const existing = inbox.get(evidence.p_order_item_id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(evidence)) return { ok: false };
      inbox.set(evidence.p_order_item_id, evidence);
      return { ok: true, json: async () => true };
    }
    if (url === 'https://api.mollie.com/v2/payments/tr_offline') {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer test_offline');
      return { ok: true, json: async () => structuredClone(payment) };
    }
    throw new Error('Unexpected external request');
  };
  const reader = mollieReader({ key: 'test_offline' });
  async function intake(sig = signature, payload = body) {
    const res = { setHeader() {}, status(n) { this.code = n; return this; }, json() { return this; }, end() { return this; } };
    await handler({ method: 'POST', body: payload, headers: {
      'x-webhook-signature': sig, 'x-webhook-event': 'SALE_NEW', 'x-webhook-schema-version': '1',
    } }, res);
    return res.code;
  }
  const inspect = async () => firstPaidPeriod(saleIdentity(body, expected), await reader.payment('tr_offline'));
  try {
    await t.test('tampered sale never reaches storage', async () => {
      assert.equal(await intake(signature, { ...body, orderItem: { id: 99 } }), 401);
      assert.equal(calls.length, 0);
    });
    await t.test('duplicate signed deliveries store one purchase and no access fields', async () => {
      assert.equal(await intake(), 202); assert.equal(await intake(), 202);
      assert.equal(inbox.size, 1);
      assert.deepEqual(Object.keys(inbox.get('5')).sort(),
        ['p_order_item_id', 'p_customer_id', 'p_email', 'p_price_plan_id', 'p_payload_hash'].sort());
    });
    await t.test('open payment gives no paid period; paid payment gives only its first month', async () => {
      assert.equal(await inspect(), null);
      payment.status = 'paid';
      const first = await inspect();
      assert.equal(first.startsOn, '2026-01-31'); assert.equal(first.paidUntil, '2026-02-28');
      assert.deepEqual(await inspect(), first);
    });
    await t.test('refund and chargeback are fetched again and stop automatic approval', async () => {
      payment.amountRefunded.value = '13.00';
      await assert.rejects(inspect(), /reversals/);
      payment.amountRefunded.value = '0.00'; payment.amountChargedBack.value = '13.00';
      await assert.rejects(inspect(), /reversals/);
      payment.amountChargedBack.value = '0.00';
    });
    await t.test('wrong order and live-mode responses are refused', async () => {
      payment.metadata.sio_order_item_id = 99;
      await assert.rejects(inspect(), /match/);
      payment.metadata.sio_order_item_id = 5; payment.mode = 'live';
      await assert.rejects(inspect(), /identity mismatch/);
    });
    assert.ok(calls.every(call => call.url.endsWith('/rpc/bot_record_purchase') || call.method === 'GET'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
