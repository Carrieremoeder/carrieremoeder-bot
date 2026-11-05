import test from 'node:test';
import assert from 'node:assert/strict';
import { statusFromSubscriptions, canUseBot, syncStatus } from '../lib/botStatus.js';
import { extractContactRef } from '../api/sync.js';

const tag = { name: 'Always In Control BOT' };

test('status uit abonnementen', () => {
  assert.equal(statusFromSubscriptions([]), '');
  assert.match(statusFromSubscriptions([{ status: 'active', createdAt: '2026-12-01T10:00:00Z' }]), /^abonnee sinds 01-12-2026$/);
  assert.match(statusFromSubscriptions([{ status: 'canceled', canceledAt: '2027-03-12T10:00:00Z' }]), /^gestopt per 12-03-2027$/);
  assert.match(statusFromSubscriptions([{ status: 'past_due', updatedAt: '2027-01-05T10:00:00Z' }]), /^gestopt per/);
});

test('toegang: tag blijft, status beslist', () => {
  assert.equal(canUseBot({ tags: [tag], fields: [] }), true);
  assert.equal(canUseBot({ tags: [tag], fields: [{ slug: 'bot_status', value: 'abonnee sinds 01-12-2026' }] }), true);
  assert.equal(canUseBot({ tags: [tag], fields: [{ slug: 'bot_status', value: 'gestopt per 12-03-2027' }] }), false);
  assert.equal(canUseBot({ tags: [], fields: [] }), false);
});

test('webhook: contact vinden in verschillende formaten', () => {
  assert.deepEqual(extractContactRef({ data: { contact: { id: 42, email: 'A@b.nl' } } }), { id: '42', email: 'a@b.nl' });
  assert.deepEqual(extractContactRef({ customer: { email: 'x@y.nl' } }), { id: null, email: 'x@y.nl' });
  assert.deepEqual(extractContactRef({ contact_id: '7' }), { id: '7', email: null });
  assert.deepEqual(extractContactRef({ foo: 1 }), { id: null, email: null });
});

test('syncStatus schrijft gestopt, laat lifetime met rust', async () => {
  process.env.SYSTEME_API_KEY = 'test';
  const calls = [];
  let subs = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push([init.method || 'GET', u.pathname]);
    if (u.pathname === '/api/payment/subscriptions') return Response.json({ items: subs, hasMore: false });
    if (u.pathname === '/api/contact_fields') return Response.json({ items: [{ slug: 'bot_status' }] });
    if (u.pathname.startsWith('/api/contacts/')) return new Response('', { status: 200 });
    return new Response('nf', { status: 404 });
  };
  const lifetime = { id: 1, email: 'l@x.nl', tags: [tag], fields: [] };
  await syncStatus(lifetime);
  assert.ok(!calls.some(c => c[0] === 'PATCH'));
  subs = [{ id: 9, contact: { id: 2 }, status: 'canceled', canceledAt: '2027-03-12T10:00:00Z', pricePlan: { name: 'Bot abonnement 13 p/m' } },
          { id: 8, contact: { id: 2 }, status: 'canceled', pricePlan: { name: 'Dossieropbouw' } }];
  const sub = { id: 2, email: 's@x.nl', tags: [tag], fields: [{ slug: 'bot_status', value: 'abonnee sinds 01-12-2026' }] };
  const updated = await syncStatus(sub);
  assert.ok(calls.some(c => c[0] === 'PATCH' && c[1] === '/api/contacts/2'));
  assert.equal(canUseBot(updated), false);
  // dossier-abonnement alleen telt niet als bot-abonnement
  subs = [{ id: 8, contact: { id: 3 }, status: 'canceled', pricePlan: { name: 'Dossieropbouw' } }];
  calls.length = 0;
  const other = await syncStatus({ id: 3, tags: [tag], fields: [] });
  assert.ok(!calls.some(c => c[0] === 'PATCH'));
  assert.equal(canUseBot(other), true);
});
