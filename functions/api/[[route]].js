// Cloudflare Pages Functions: laat de bestaande serverroutes in /api draaien op Cloudflare.
// Vertaalt een Cloudflare-verzoek naar het req/res-formaat dat de routes gebruiken.
import chat from '../../api/chat.js';
import session from '../../api/session.js';
import sync from '../../api/sync.js';

const routes = { chat, session, sync };

function makeReq(request, body) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  if (!headers.host) headers.host = url.host;
  return { method: request.method, url: url.pathname + url.search, headers, body };
}

function makeRes() {
  let status = 200;
  const headers = new Headers();
  let resolve;
  const ready = new Promise(r => { resolve = r; });
  let stream = null;
  let writer = null;
  const encoder = new TextEncoder();
  let sent = false;
  function send(bodyInit) {
    if (sent) return;
    sent = true;
    resolve(new Response(bodyInit, { status, headers }));
  }
  function openStream() {
    if (!stream) {
      stream = new TransformStream();
      writer = stream.writable.getWriter();
      send(stream.readable);
    }
  }
  const res = {
    status(code) { status = code; return res; },
    setHeader(name, value) {
      if (name.toLowerCase() === 'set-cookie') headers.append(name, value);
      else headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      return res;
    },
    json(data) {
      if (!headers.has('content-type')) headers.set('Content-Type', 'application/json; charset=utf-8');
      send(JSON.stringify(data));
      return res;
    },
    flushHeaders() { openStream(); },
    write(chunk) { openStream(); writer.write(typeof chunk === 'string' ? encoder.encode(chunk) : chunk).catch(() => {}); return true; },
    end(chunk) {
      if (stream) {
        if (chunk) res.write(chunk);
        writer.close().catch(() => {});
      } else send(chunk ?? null);
      return res;
    }
  };
  return { res, ready, finish: () => { if (stream) writer.close().catch(() => {}); else send(null); } };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  // Maak de Cloudflare-instellingen (OPENAI_API_KEY enz.) beschikbaar voor de bestaande code.
  for (const [key, value] of Object.entries(env)) if (typeof value === 'string') process.env[key] = value;

  const name = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '');
  const handler = routes[name];
  if (!handler) return new Response(JSON.stringify({ error: 'Niet gevonden' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const text = await request.text();
    if (text) {
      try { body = JSON.parse(text); } catch {
        // Webhooks kunnen ook als formulier binnenkomen.
        if (name === 'sync') body = Object.fromEntries(new URLSearchParams(text));
        else return new Response(JSON.stringify({ error: 'Ongeldige aanvraag' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  const { res, ready, finish } = makeRes();
  const running = Promise.resolve()
    .then(() => handler(makeReq(request, body), res))
    .catch(() => { res.status(500).json({ error: 'Er ging iets mis.' }); })
    .finally(finish);
  context.waitUntil(running);
  return ready;
}
