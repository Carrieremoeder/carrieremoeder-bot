// Herroepen binnen 14 dagen.
//
// POST zonder "t": seintje van Systeme.io (workflow "Stuur webhook") als iemand het herroepingsformulier invult.
//   Adres in de workflow: https://bot.meestermasha.nl/api/herroepen
//   Het seintje wordt niet vertrouwd: de Bot zoekt contact en abonnement zelf op en mailt de klant een
//   persoonlijke bevestigingslink (via de inlogmail).
// GET ?t=…: de pagina achter die link. Laat zien wat er gebeurt en hoeveel de klant terugkrijgt.
// POST met "t": de klant klikt op "Bevestigen". Abonnement stopt, toegang stopt, Mollie betaalt terug.
import { findContact, getContact, setLinkField } from '../lib/systeme.js';
import { extractContactRef, bodyShape } from './sync.js';
import { createHerroepToken, readHerroepToken, sameOrigin } from '../lib/security.js';
import { confirmWithdrawal, euro, findWithdrawableSubscription, markPending, previewWithdrawal, reportManual, setReceivedMoment } from '../lib/herroeping.js';
import { nl } from '../lib/opzegging.js';

function publicUrl(req) {
  const configured = process.env.BOT_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://' + req.headers.host;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CONTACT = 'Vragen? Mail naar <a href="mailto:info@meestermasha.nl">info@meestermasha.nl</a>.';

function page(res, title, bodyHtml, status = 200) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.end(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Always In Control Bot</title>
<style>
body{margin:0;background:#FBF7F0;color:#2B211B;font:16px/1.7 Georgia,'Times New Roman',serif}
main{max-width:560px;margin:0 auto;padding:40px 24px 64px}
img{height:56px;display:block;margin:0 0 32px}
h1{font-weight:400;font-size:32px;line-height:1.2;margin:0 0 18px}
p{margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#4A3C33}
.box{background:#fff;border:1px solid #E5DACB;padding:16px 18px;margin:18px 0 22px}
.box p{margin:0 0 6px}.box p:last-child{margin:0}
button{background:#2B211B;color:#fff;border:0;padding:14px 22px;font:600 14px Arial,Helvetica,sans-serif;letter-spacing:.04em;cursor:pointer;width:100%}
button:disabled{opacity:.6}
small{display:block;margin-top:22px;font:13px/1.6 Arial,Helvetica,sans-serif;color:#7A6B60}
a{color:#2B211B}
</style></head><body><main><img src="/meester-masha-logo.png" alt="Meester Masha"><h1>${esc(title)}</h1>${bodyHtml}<small>${CONTACT}</small></main></body></html>`);
}

async function handleWebhook(req, res) {
  console.log('Bot herroeping seintje:', { type: req.headers?.['content-type'] || '', shape: JSON.stringify(bodyShape(req.body)).slice(0, 800) });
  const { id, email } = extractContactRef(req.body || {});
  try {
    let contact = null;
    if (id) { try { contact = await getContact(id); } catch (error) { if (error.status !== 404) throw error; } }
    if (!contact && email) contact = await findContact(email);
    if (!contact) { await reportManual(null, 'geen contact gevonden'); return res.status(200).json({ ok: false }); }
    // Eerst het moment van ontvangst vastleggen: de wettelijke bevestiging noemt datum en tijd.
    try { await setReceivedMoment(contact.id, new Date()); } catch (error) { console.error('Bot herroeping: moment niet vastgelegd', { status: error?.status || 0 }); }
    const found = await findWithdrawableSubscription(contact);
    if (!found.ok) {
      // De bevestigingsmail toont dan een link naar een pagina die zegt dat Masha het zelf afhandelt.
      await setLinkField(contact, `${publicUrl(req)}/api/herroepen?t=handmatig`);
      await reportManual(contact.id, found.reason);
      console.log('Bot herroeping:', { ok: false, reason: found.reason });
      return res.status(200).json({ ok: false });
    }
    const receivedAt = Date.now();
    const token = createHerroepToken(contact.id, found.subscription.id, receivedAt);
    await setLinkField(contact, `${publicUrl(req)}/api/herroepen?t=${token}`);
    await markPending(contact.id, found.subscription.id, receivedAt);
    console.log('Bot herroeping: bevestigingslink klaargezet');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Bot herroeping:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    try { if (id) await reportManual(id, 'technische fout bij verwerken'); } catch {}
    return res.status(200).json({ ok: false });
  }
}

const INVALID = '<p>Deze link werkt niet (meer). Je herroeping is wel ontvangen; we handelen hem zelf voor je af.</p>';

const MANUAL = '<p>Je herroeping is ontvangen. We kunnen hem niet automatisch afronden, dus we handelen hem zelf voor je af. Je hoort binnen 14 dagen van ons. Je hoeft verder niets te doen.</p>';

async function showPreview(req, res, token) {
  if (token === 'handmatig') return page(res, 'We regelen het voor je', MANUAL);
  const ref = readHerroepToken(token);
  if (!ref) return page(res, 'Link verlopen', INVALID, 400);
  const p = await previewWithdrawal(ref);
  if (p.state === 'done') return page(res, 'Je herroeping is verwerkt', '<p>Je abonnement is gestopt en de terugbetaling is al in gang gezet. Je ontvangt het geld meestal binnen 2 werkdagen.</p>');
  if (p.state !== 'ready') {
    await reportManual(ref.contactId, p.state === 'too-late' ? 'bedenktijd voorbij' : p.state === 'no-payment' ? 'betaling niet gevonden in Mollie' : 'abonnement niet gevonden');
    return page(res, 'We regelen het voor je', '<p>We kunnen je herroeping niet automatisch afronden. Geen zorgen: je herroeping is ontvangen en we handelen hem zelf voor je af. Je hoort binnen 14 dagen van ons.</p>');
  }
  return page(res, 'Bevestig je herroeping', `
<p>Je hebt aangegeven dat je de Always In Control Bot wilt herroepen. Als je hieronder bevestigt, gebeurt dit direct:</p>
<div class="box">
<p>Je abonnement stopt en je hebt geen toegang meer tot de Bot.</p>
<p>Je betaalde ${esc(euro(p.paidCents))} op ${esc(nl(new Date(p.payment.paidAt || p.payment.createdAt)))}.</p>
<p>Voor ${p.usedDays} ${p.usedDays === 1 ? 'dag' : 'dagen'} toegang betaal je ${esc(euro(p.keepCents))}.</p>
<p><strong>Je krijgt ${esc(euro(p.refundCents))} terug</strong> op de rekening waarmee je betaalde.</p>
</div>
<p>Download eerst de gesprekken die je wilt bewaren. Wij slaan gesprekken niet op.</p>
<form method="post" action="/api/herroepen" onsubmit="this.querySelector('button').disabled=true">
<input type="hidden" name="t" value="${esc(token)}">
<button type="submit">Ja, stop mijn abonnement en betaal terug</button>
</form>`);
}

async function confirm(req, res, token) {
  // "no-referrer" liet browsers Origin: null sturen; daarom ook Sec-Fetch-Site accepteren.
  // De echte beveiliging is de ondertekende link (t) in het formulier.
  const fromOwnPage = sameOrigin(req) || req.headers?.['sec-fetch-site'] === 'same-origin';
  if (!fromOwnPage) return page(res, 'Niet gelukt', '<p>Open de link uit je e-mail opnieuw en probeer het nog een keer.</p>', 403);
  const ref = readHerroepToken(token);
  if (!ref) return page(res, 'Link verlopen', INVALID, 400);
  const result = await confirmWithdrawal(ref);
  if (result.ok && result.already) return page(res, 'Je herroeping is verwerkt', '<p>Je abonnement is gestopt en de terugbetaling is al in gang gezet.</p>');
  if (result.ok) return page(res, 'Je herroeping is verwerkt', `<p>Je abonnement is gestopt.${result.refundCents > 0 ? ` We hebben ${esc(euro(result.refundCents))} teruggestort. Je ontvangt het geld meestal binnen 2 werkdagen.` : ''}</p><p>Dank je wel dat je de Bot hebt geprobeerd. Veel sterkte en rust gewenst.</p>`);
  return page(res, 'We regelen het voor je', '<p>We konden je herroeping niet helemaal automatisch afronden. Je herroeping is ontvangen en we handelen de rest zelf voor je af. Je hoort binnen 14 dagen van ons.</p>');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const token = new URL(req.url, 'https://x').searchParams.get('t');
      return await showPreview(req, res, token);
    }
    if (req.method !== 'POST') return res.status(405).end();
    if (typeof req.body?.t === 'string') return await confirm(req, res, req.body.t);
    return await handleWebhook(req, res);
  } catch (error) {
    console.error('Bot herroeping pagina:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return page(res, 'Even geduld', '<p>Er ging iets mis. Probeer het over een paar minuten opnieuw met de link uit je e-mail. Lukt het dan nog niet? Je herroeping is ontvangen; we handelen hem zelf voor je af.</p>', 503);
  }
}
