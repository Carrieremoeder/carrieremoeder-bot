import { clearSession, createLoginToken, currentSession, issuedAtOfLink, readLoginToken, sameOrigin, setSession } from '../lib/security.js';
import { currentLoginField, ensureLoginField, ensureLoginTag, findContact, getContact, normaliseEmail, sendLoginLink } from '../lib/systeme.js';
import { canUseBot, currentStatus, syncStatus } from '../lib/botStatus.js';

// Bij abonnees de status eerst vers ophalen uit Systeme.io (lifetime klanten hebben geen status).
async function freshAccess(contact) {
  if (!contact) return false;
  if (/^abonnee/i.test(currentStatus(contact))) {
    try { contact = await syncStatus(contact); } catch (error) { console.error('Bot status:', { status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 200) }); }
  }
  return canUseBot(contact);
}

const RESEND_COOLDOWN_MS = 60 * 1000;
const SENT_MESSAGE = 'Als dit e-mailadres toegang heeft tot de Bot, ontvang je binnen een paar minuten een inloglink. Controleer ook je spammap. Geen mail ontvangen? Gebruik het e-mailadres waarmee je de Bot hebt gekocht.';

function publicUrl(req) {
  const configured = process.env.BOT_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://' + req.headers.host;
}

// Wie lang ingelogd blijft, wordt bij elk bezoek opnieuw gecontroleerd in Systeme.io:
// is de toegangstag weg (bijvoorbeeld na een terugbetaling), dan vervalt de toegang direct.
async function activeSession(req) {
  const session = currentSession(req);
  if (!session) return null;
  if (!session.remember) return session;
  const id = /^SIO-(\d{1,20})$/.exec(session.code)?.[1];
  if (!id) return null;
  let contact = null;
  try { contact = await getContact(id); } catch (error) { if (error.status !== 404) throw error; }
  return (await freshAccess(contact)) ? session : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const session = await activeSession(req);
      if (!session) return res.status(401).json({ error: 'Log opnieuw in.' });
      return res.status(200).json({ loggedIn: true });
    }
    if (req.method === 'DELETE') { if (!sameOrigin(req)) return res.status(403).end(); clearSession(res); return res.status(204).end(); }
    if (req.method !== 'POST') return res.status(405).end();
    if (!sameOrigin(req)) return res.status(403).end();
    const action = req.body?.action;

    if (action === 'renew') {
      const session = await activeSession(req);
      if (!session) return res.status(401).json({ error: 'Log opnieuw in.' });
      return res.status(200).json({ loggedIn: true, token: setSession(res, session.code, session.remember) });
    }

    // Stap 1: inloglink aanvragen. Altijd hetzelfde antwoord, zodat niemand kan uitzoeken wie klant is.
    if (action === 'request-link') {
      const email = normaliseEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: 'Vul een geldig e-mailadres in.' });
      // Zorgt dat het veld en de tag in Systeme.io bestaan (eenmalig), zodat de automatisering ze kan gebruiken.
      await ensureLoginField();
      await ensureLoginTag();
      const contact = await findContact(email);
      if (contact && await freshAccess(contact)) {
        const recentlySent = Date.now() - issuedAtOfLink(currentLoginField(contact)) < RESEND_COOLDOWN_MS;
        if (!recentlySent) await sendLoginLink(contact, `${publicUrl(req)}/?login=${createLoginToken(contact.id, Date.now(), req.body?.remember === true)}`);
      }
      return res.status(200).json({ sent: true, message: SENT_MESSAGE });
    }

    // Stap 2: de klant klikt op de link in de mail.
    if (action === 'verify-link') {
      const login = readLoginToken(String(req.body?.token || ''));
      if (!login) return res.status(401).json({ error: 'Deze inloglink is verlopen of ongeldig. Vraag hieronder een nieuwe aan.' });
      let contact = null;
      try { contact = await getContact(login.contactId); } catch (error) { if (error.status !== 404) throw error; }
      if (!(await freshAccess(contact))) return res.status(403).json({ error: 'We vinden geen actieve toegang tot de Bot bij dit account.' });
      return res.status(200).json({ loggedIn: true, token: setSession(res, 'SIO-' + login.contactId, login.remember), remember: login.remember });
    }

    return res.status(400).json({ error: 'Ongeldige aanvraag.' });
  } catch (error) {
    console.error('Bot session:', { type: error?.name || 'error', status: error?.status || 0, detail: String(error?.detail || error?.message || '').slice(0, 300) });
    return res.status(503).json({ error: 'Inloggen lukt momenteel niet. Probeer het over een paar minuten opnieuw.' });
  }
}
