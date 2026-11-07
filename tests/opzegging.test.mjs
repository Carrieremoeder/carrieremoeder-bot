import test from 'node:test';
import assert from 'node:assert/strict';
import { planCancellation, addMonths, iso, processCancellation, runDueCancellations, plannedDueDate } from '../lib/opzegging.js';
import { isActive } from '../lib/botStatus.js';

const D = s => new Date(s + 'T12:00:00Z');

test('maanden optellen houdt rekening met korte maanden', () => {
  assert.equal(iso(addMonths(D('2026-01-31'), 1)), '2026-02-28');
  assert.equal(iso(addMonths(D('2026-12-07'), 12)), '2027-12-07');
});

test('plan: eerste jaar wordt gepland, daarna direct', () => {
  const start = D('2026-12-07');
  const early = planCancellation(start, D('2027-03-01'));
  assert.equal(early.action, 'schedule');
  assert.equal(iso(early.due), '2027-11-08');
  assert.equal(iso(early.end), '2027-12-07');
  assert.equal(planCancellation(start, D('2027-11-10')).action, 'now'); // laatste maand van jaar 1
  assert.equal(planCancellation(start, D('2028-02-01')).action, 'now'); // na jaar 1
  assert.equal(planCancellation(null).action, 'now');
});

test('opgezegd maar betaalde periode loopt nog = toegang', () => {
  const now = D('2027-05-01');
  assert.equal(isActive({ status: 'active' }, now), true);
  assert.equal(isActive({ status: 'canceled', currentPeriodEnd: '2027-05-20T00:00:00Z' }, now), true);
  assert.equal(isActive({ status: 'canceled', currentPeriodEnd: '2027-04-20T00:00:00Z' }, now), false);
  assert.equal(isActive({ status: 'canceled' }, now), false);
  assert.equal(isActive({ status: 'past_due', nextBillingDate: '2027-06-01' }, now), false);
});

function fakeSysteme({ subs, contacts = [] }) {
  const calls = [];
  const tags = [{ id: 1, name: 'Always In Control BOT' }, { id: 3, name: 'bot-opzegging-handmatig' }];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const m = init.method || 'GET';
    calls.push([m, u.pathname, init.body ? JSON.parse(init.body) : null]);
    if (u.pathname === '/api/payment/subscriptions') return Response.json({ items: subs.filter(s => String(s.contact.id) === u.searchParams.get('contact')), hasMore: false });
    if (/\/cancel$/.test(u.pathname)) return Response.json({ id: 1 });
    if (u.pathname === '/api/contact_fields') return Response.json({ items: [{ slug: 'bot_opzegging' }] });
    if (u.pathname === '/api/tags') return Response.json({ items: tags, hasMore: false });
    if (u.pathname === '/api/contacts' && m === 'GET') return Response.json({ items: contacts, hasMore: false });
    if (u.pathname.startsWith('/api/contacts/')) return new Response('', { status: 200 });
    return new Response('nf', { status: 404 });
  };
  return calls;
}

test('opzeggen na jaar 1: direct per einde betaalperiode', async () => {
  process.env.SYSTEME_API_KEY = 't';
  const calls = fakeSysteme({ subs: [{ id: 55, contact: { id: 9 }, status: 'active', createdAt: '2025-01-10T10:00:00Z', pricePlan: { name: 'Bot abonnement 13 p/m' } }] });
  const out = await processCancellation({ id: 9, email: 'a@b.nl' }, D('2026-12-01'));
  assert.deepEqual(out, { ok: true, result: 'opgezegd' });
  const cancel = calls.find(c => c[1] === '/api/payment/subscriptions/55/cancel');
  assert.deepEqual(cancel[2], { cancel: 'WhenBillingPeriodEnds' });
  assert.match(calls.find(c => c[0] === 'PATCH')[2].fields[0].value, /^opgezegd op/);
});

test('opzeggen in jaar 1: gepland, niet direct', async () => {
  const calls = fakeSysteme({ subs: [{ id: 56, contact: { id: 10 }, status: 'active', createdAt: '2026-12-07T10:00:00Z', pricePlan: { name: 'Bot abonnement 13 p/m' } }] });
  const out = await processCancellation({ id: 10 }, D('2027-02-01'));
  assert.equal(out.result, 'gepland');
  assert.ok(!calls.some(c => /\/cancel$/.test(c[1])));
  const patch = calls.find(c => c[0] === 'PATCH');
  assert.match(patch[2].fields[0].value, /opzeggen op 2027-11-08/);
  assert.ok(!calls.some(c => c[1] === '/api/contacts/10/tags'));
});

test('geen abonnement: Masha moet het zelf doen', async () => {
  const calls = fakeSysteme({ subs: [] });
  const out = await processCancellation({ id: 11 }, D('2027-02-01'));
  assert.equal(out.ok, false);
  assert.ok(calls.some(c => c[1] === '/api/contacts/11/tags' && c[2].tagId === 3));
});

test('dagelijkse check zegt op als het moment daar is', async () => {
  const contact = (id, due) => ({ id, tags: [{ name: 'Always In Control BOT' }], fields: [{ slug: 'bot_opzegging', value: `gepland: opzeggen op ${due}, stopt per x` }] });
  assert.equal(iso(plannedDueDate(contact(1, '2027-11-08'))), '2027-11-08');
  const calls = fakeSysteme({
    subs: [{ id: 70, contact: { id: 20 }, status: 'active', createdAt: '2026-12-07', pricePlan: { name: 'Bot abonnement' } },
           { id: 71, contact: { id: 21 }, status: 'active', createdAt: '2027-01-07', pricePlan: { name: 'Bot abonnement' } }],
    contacts: [contact(20, '2027-11-08'), contact(21, '2027-12-08'), { id: 22, tags: [], fields: [] }]
  });
  const summary = await runDueCancellations(D('2027-11-09'));
  assert.deepEqual(summary, { checked: 2, cancelled: 1, waiting: 1, manual: 0 });
  assert.ok(calls.some(c => c[1] === '/api/payment/subscriptions/70/cancel'));
  assert.ok(!calls.some(c => c[1] === '/api/payment/subscriptions/71/cancel'));
});
