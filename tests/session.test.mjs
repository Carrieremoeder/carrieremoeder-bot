import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTabSession, IDLE_MS, WARNING_MS, SESSION_KEY } from '../src/browserSession.js';
import { currentCode, setSession } from '../lib/security.js';
import sessionHandler from '../api/session.js';

function fixture() {
  let time = 1000;
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const options = { storage, now: () => time };
  return { storage, options, advance: ms => { time += ms; }, create: navigationType => createTabSession({ ...options, navigationType }) };
}
test('new tabs cannot inherit a session, including cloned sessionStorage', () => {
  for (const navigation of ['navigate', 'back_forward', undefined]) {
    const f = fixture(); f.create().start('secret');
    assert.equal(f.create(navigation).token(), '');
    assert.equal(f.storage.getItem(SESSION_KEY), undefined);
  }
});
test('refresh keeps a valid session but cannot reset the inactivity clock', () => {
  const f = fixture(); f.create().start('secret');
  f.advance(IDLE_MS - WARNING_MS);
  const refreshed = f.create('reload');
  assert.equal(refreshed.token(), 'secret');
  assert.equal(refreshed.remaining(), WARNING_MS);
  f.advance(WARNING_MS);
  assert.equal(refreshed.token(), '');
  assert.equal(f.create('reload').token(), '');
});
test('real activity extends the deadline; checking and token renewal do not', () => {
  const f = fixture(); const session = f.create(); session.start('a');
  f.advance(10_000); session.touch();
  f.advance(IDLE_MS - 10_000); session.replace('b');
  assert.equal(session.remaining(), 10_000);
  f.advance(10_000);
  assert.equal(session.touch(), false);
  assert.equal(session.token(), '');
});
test('sleep and an input arriving after expiry cause logout, never revive it', () => {
  const f = fixture(); const session = f.create(); const reasons = [];
  session.subscribe(reason => reasons.push(reason)); session.start('a');
  f.advance(IDLE_MS + 5000);
  assert.equal(session.touch(), false);
  assert.deepEqual(reasons, ['idle']);
  session.replace('late-renewal');
  assert.equal(session.token(), '');
});
test('restricted storage falls back to memory and fails closed on a reload', () => {
  const storage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  const session = createTabSession({ storage }); session.start('a');
  assert.equal(session.token(), 'a'); session.clear(); assert.equal(session.token(), '');
  assert.equal(createTabSession({ storage, navigationType: 'reload' }).token(), '');
});
test('server requires signed per-tab authentication and rejects the old shared cookie', () => {
  process.env.BOT_SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
  const headers = {};
  const token = setSession({ setHeader: (key, value) => { headers[key] = value; } }, 'TEST-1234');
  assert.match(headers['Set-Cookie'], /Max-Age=0/);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${token}` } }), 'TEST-1234');
  assert.equal(currentCode({ headers: { cookie: `cm_bot_session=${token}` } }), null);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${token}tampered` } }), null);
  const signed = payload => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return body + '.' + createHmac('sha256', process.env.BOT_SESSION_SECRET).update(body).digest('base64url');
  };
  for (const payload of [
    { version: 2, code: 'TEST-1234', expires: Date.now() - 1 },
    { code: 'TEST-1234', expires: Date.now() + 12 * 60 * 60 * 1000 },
    { version: 2, code: 'TEST-1234', expires: Date.now() + 12 * 60 * 60 * 1000 },
  ]) assert.equal(currentCode({ headers: { authorization: `Bearer ${signed(payload)}` } }), null);
});

test('login via Systeme.io: link only for tagged contacts, no passwords, sessions without database', async t => {
  process.env.BOT_SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
  process.env.SYSTEME_API_KEY = 'test-only';
  process.env.BOT_PUBLIC_URL = 'https://bot.example';
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const contacts = {
    'klant@example.com': { id: 101, email: 'klant@example.com', tags: [{ id: 1, name: 'Training + Bot' }], fields: [] },
    'geen@example.com': { id: 202, email: 'geen@example.com', tags: [{ id: 9, name: 'nieuwsbrief' }], fields: [] },
  };
  let calls = [];
  let tagExists = false, fieldExists = false;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const u = new URL(url);
    if (u.pathname === '/api/contacts' && u.searchParams.get('email')) {
      const c = contacts[u.searchParams.get('email')];
      return Response.json({ items: c ? [c] : [] });
    }
    if (u.pathname === '/api/tags' && (init.method || 'GET') === 'GET') return Response.json({ items: tagExists ? [{ id: 54, name: 'iets anders' }, { id: 55, name: 'bot-inloglink' }] : [{ id: 54, name: 'iets anders' }], hasMore: false });
    if (u.pathname === '/api/tags' && init.method === 'POST') { tagExists = true; return Response.json({ id: 55, name: 'bot-inloglink' }); }
    if (u.pathname === '/api/contact_fields' && (init.method || 'GET') === 'GET') return Response.json({ items: fieldExists ? [{ slug: 'bot_inloglink' }] : [] });
    if (u.pathname === '/api/contact_fields' && init.method === 'POST') { fieldExists = true; return Response.json({ slug: 'bot_inloglink' }); }
    const m = /^\/api\/contacts\/(\d+)$/.exec(u.pathname);
    if (m && (init.method || 'GET') === 'GET') { const c = Object.values(contacts).find(x => String(x.id) === m[1]); return c ? Response.json(c) : new Response('', { status: 404 }); }
    if (m && init.method === 'PATCH') return Response.json({});
    if (/\/tags\/\d+$/.test(u.pathname) && init.method === 'DELETE') return new Response('', { status: 404 });
    if (/\/tags$/.test(u.pathname) && init.method === 'POST') return new Response(null, { status: 204 });
    return new Response('', { status: 500 });
  };
  async function call(body, method = 'POST', authorization = '') {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(d) { this.data = d; return this; }, end() { return this; } };
    await sessionHandler({ method, headers: { host: 'bot.example', origin: 'https://bot.example', authorization }, body }, res);
    return res;
  }
  // Klant met juiste tag: link wordt in Systeme.io gezet en tag opnieuw toegevoegd.
  calls = [];
  let res = await call({ action: 'request-link', email: ' Klant@Example.com ' });
  assert.equal(res.code, 200);
  const patch = calls.find(c => c.method === 'PATCH');
  assert.ok(patch, 'login link is written to the contact field');
  assert.equal(patch.headers['Content-Type'], 'application/merge-patch+json');
  assert.equal(patch.headers['X-API-Key'], 'test-only');
  const link = patch.body.fields[0].value;
  assert.equal(patch.body.fields[0].slug, 'bot_inloglink');
  assert.match(link, /^https:\/\/bot\.example\/\?login=/);
  assert.ok(calls.some(c => c.method === 'POST' && c.url.endsWith('/contacts/101/tags') && c.body.tagId === 55));
  assert.ok(!JSON.stringify(calls).toLowerCase().includes('password'));
  assert.ok(calls.some(c => c.method === 'POST' && c.url.endsWith('/api/contact_fields') && c.body.slug === 'bot_inloglink'), 'field is created when missing');
  assert.ok(calls.some(c => c.method === 'POST' && c.url.endsWith('/api/tags') && c.body.name === 'bot-inloglink'), 'tag is created when missing');
  // Zonder tag of onbekend: zelfde antwoord, maar geen mail.
  for (const email of ['geen@example.com', 'onbekend@example.com']) {
    calls = [];
    const other = await call({ action: 'request-link', email });
    assert.equal(other.code, 200);
    assert.equal(other.data.message, res.data.message);
    assert.ok(!calls.some(c => c.method === 'PATCH' || c.url.includes('/contacts/')), 'no login link for contacts without access');
  }
  // Binnen een minuut opnieuw aanvragen stuurt geen tweede mail.
  contacts['klant@example.com'].fields = [{ slug: 'bot_inloglink', value: link }];
  calls = [];
  await call({ action: 'request-link', email: 'klant@example.com' });
  assert.ok(!calls.some(c => c.method === 'PATCH'));
  // Link inwisselen voor een sessie.
  const token = new URL(link).searchParams.get('login');
  res = await call({ action: 'verify-link', token });
  assert.equal(res.code, 200);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${res.data.token}` } }), 'SIO-101');
  // Vervalste of verlopen link werkt niet.
  assert.equal((await call({ action: 'verify-link', token: token + 'x' })).code, 401);
  // Tag weggehaald: geen toegang meer.
  contacts['klant@example.com'].tags = [];
  assert.equal((await call({ action: 'verify-link', token })).code, 403);
  // Sessie controleren en vernieuwen zonder database.
  assert.equal((await call(undefined, 'GET', `Bearer ${res.data.token}`)).code, 200);
  assert.equal((await call(undefined, 'GET')).code, 401);
  const renewed = await call({ action: 'renew' }, 'POST', `Bearer ${res.data.token}`);
  assert.equal(currentCode({ headers: { authorization: `Bearer ${renewed.data.token}` } }), 'SIO-101');
  // Oude manieren van inloggen bestaan niet meer.
  assert.equal((await call({ action: 'login', code: 'TEST-1234', password: 'geheim123' })).code, 400);
});
