import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRefund, withinWithdrawalPeriod, confirmWithdrawal, previewWithdrawal } from '../lib/herroeping.js';
import { createHerroepToken, readHerroepToken } from '../lib/security.js';
import { canUseBot, syncStatus } from '../lib/botStatus.js';

process.env.SYSTEME_API_KEY = 't';
process.env.MOLLIE_API_KEY = 'live_test';
process.env.BOT_SESSION_SECRET = 'x'.repeat(40);

test('bedenktijd: 14 kalenderdagen na de dag van aankoop', () => {
  const start = new Date('2026-12-01T10:00:00Z');
  assert.equal(withinWithdrawalPeriod(start, new Date('2026-12-01T20:00:00Z')), true);
  assert.equal(withinWithdrawalPeriod(start, new Date('2026-12-15T22:00:00Z')), true);  // 15 dec 23:00 NL
  assert.equal(withinWithdrawalPeriod(start, new Date('2026-12-15T23:30:00Z')), false); // 16 dec NL
  assert.equal(withinWithdrawalPeriod(null, new Date()), false);
});

test('terugbetaling naar rato van begonnen dagen', () => {
  const start = new Date('2026-12-01T10:00:00Z'); // periode van 31 dagen
  const r = computeRefund(1300, start, new Date('2026-12-05T09:00:00Z'));
  assert.deepEqual(r, { usedDays: 4, periodDays: 31, keepCents: 168, refundCents: 1132 });
  assert.equal(computeRefund(1300, start, new Date('2026-12-01T10:05:00Z')).usedDays, 1);
});

test('herroepingslink is ondertekend en verloopt', () => {
  const t = createHerroepToken(9, 55, Date.now());
  assert.deepEqual(readHerroepToken(t).subscriptionId, '55');
  assert.equal(readHerroepToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(readHerroepToken(t, Date.now() + 8 * 86_400_000), null);
});

function fake({ sub, payment, cancelStatus = 200, refundStatus = 201 }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const m = init.method || 'GET';
    calls.push([m, u.host + u.pathname, init.body ? JSON.parse(init.body) : null]);
    if (u.host === 'api.mollie.com') {
      if (u.pathname === '/v2/payments') return Response.json({ _embedded: { payments: payment ? [payment] : [] }, _links: {} });
      if (/\/refunds$/.test(u.pathname)) return new Response('{}', { status: refundStatus });
    }
    if (u.pathname === '/api/payment/subscriptions') return Response.json({ items: [sub], hasMore: false });
    if (/\/cancel$/.test(u.pathname)) return new Response('{}', { status: cancelStatus });
    if (u.pathname === '/api/contact_fields') return Response.json({ items: [{ slug: 'bot_opzegging' }, { slug: 'bot_status' }] });
    if (u.pathname === '/api/tags') return Response.json({ items: [{ id: 3, name: 'bot-opzegging-handmatig' }], hasMore: false });
    if (u.pathname.startsWith('/api/contacts/')) return new Response('', { status: 200 });
    return new Response('nf', { status: 404 });
  };
  return calls;
}

const start = new Date(Date.now() - 3 * 86_400_000);
const sub = { id: 55, contact: { id: 9 }, status: 'active', createdAt: start.toISOString(), pricePlan: { name: 'Bot abonnement' } };
const payment = { id: 'tr_abc', status: 'paid', createdAt: start.toISOString(), paidAt: start.toISOString(), amount: { value: '13.00', currency: 'EUR' }, amountRefunded: { value: '0.00' }, metadata: { sio_subscription_id: 55 } };
const ref = { contactId: '9', subscriptionId: '55', receivedAt: Date.now() };

test('bevestigen: stopt direct, sluit toegang af en betaalt terug', async () => {
  const calls = fake({ sub, payment });
  const out = await confirmWithdrawal(ref);
  assert.equal(out.ok, true);
  assert.deepEqual(calls.find(c => /\/cancel$/.test(c[1]))[2], { cancel: 'Now' });
  const refund = calls.find(c => /refunds$/.test(c[1]));
  assert.equal(refund[1], 'api.mollie.com/v2/payments/tr_abc/refunds');
  const expected = computeRefund(1300, start, new Date(ref.receivedAt));
  assert.equal(refund[2].amount.value, (expected.refundCents / 100).toFixed(2));
  assert.ok(expected.refundCents > 1000 && expected.refundCents < 1300);
  assert.ok(calls.some(c => c[0] === 'PATCH' && /^herroepen per/.test(c[2].fields[0].value)));
  // Volgorde: eerst stoppen, dan terugbetalen.
  assert.ok(calls.findIndex(c => /\/cancel$/.test(c[1])) < calls.findIndex(c => /refunds$/.test(c[1])));
});

test('al teruggestort: niet nog een keer', async () => {
  const calls = fake({ sub, payment: { ...payment, amountRefunded: { value: '11.74' } } });
  assert.equal((await previewWithdrawal(ref)).state, 'done');
  const out = await confirmWithdrawal(ref);
  assert.equal(out.already, true);
  assert.ok(!calls.some(c => /refunds$/.test(c[1]) || /\/cancel$/.test(c[1])));
});

test('stoppen mislukt: niets terugbetalen, Masha krijgt melding', async () => {
  const calls = fake({ sub, payment, cancelStatus: 500 });
  const out = await confirmWithdrawal(ref);
  assert.equal(out.ok, false);
  assert.ok(!calls.some(c => /refunds$/.test(c[1])));
  assert.ok(calls.some(c => c[1] === 'api.systeme.io/api/contacts/9/tags' && c[2]?.tagId === 3));
});

test('bedenktijd voorbij: geen actie', async () => {
  const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const calls = fake({ sub: { ...sub, createdAt: old }, payment });
  const out = await confirmWithdrawal(ref);
  assert.equal(out.ok, false);
  assert.ok(!calls.some(c => /refunds$/.test(c[1]) || /\/cancel$/.test(c[1])));
});

test('na herroepen geen toegang, ook niet als Systeme nog "actief" meldt', async () => {
  const contact = { id: 9, tags: [{ name: 'Always In Control BOT' }], fields: [{ slug: 'bot_status', value: 'herroepen per 05-12-2026' }] };
  assert.equal(canUseBot(contact), false);
  fake({ sub: { ...sub, createdAt: '2026-12-01T10:00:00Z', status: 'canceled', currentPeriodEnd: '2099-01-01' }, payment });
  const after = await syncStatus(contact);
  assert.equal(canUseBot(after), false);
  // Nieuw abonnement na de herroeping: wel weer toegang.
  fake({ sub: { ...sub, id: 60, createdAt: '2027-02-01T10:00:00Z', status: 'active' }, payment });
  assert.equal(canUseBot(await syncStatus(contact)), true);
});
