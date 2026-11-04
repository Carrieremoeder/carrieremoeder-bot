import { clearSession, createLoginToken, issuedAtOfLink, readLoginToken, requireCode, sameOrigin, setSession } from '../lib/security.js';
import { currentLoginField, ensureLoginField, ensureLoginTag, findContact, getContact, hasAccess, normaliseEmail, sendLoginLink } from '../lib/systeme.js';

const RESEND_COOLDOWN_MS = 60 * 1000;
const SENT_MESSAGE = 'Als dit e-mailadres toegang heeft tot de Bot, ontvang je binnen een paar minuten een inloglink. Controleer ook je spammap. Geen mail ontvangen? Gebruik het e-mailadres waarmee je de Bot hebt gekocht.';

function publicUrl(req) {
  const configured = process.env.BOT_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://' + req.headers.host;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const code = await requireCode(req, res);
      return code && res.status(200).json({ loggedIn: true });
    }
    if (req.method === 'DELETE') { if (!sameOrigin(req)) return res.status(403).end(); clearSession(res); return res.status(204).end(); }
    if (req.method !== 'POST') return res.status(405).end();
    if (!sameOrigin(req)) return res.status(403).end();
    const action = req.body?.action;

    if (action === 'renew') {
      const code = await requireCode(req, res);
      return code && res.status(200).json({ loggedIn: true, token: setSession(res, code) });
    }

    // Stap 1: inloglink aanvragen. Altijd hetzelfde antwoord, zodat niemand kan uitzoeken wie klant is.
    if (action === 'request-link') {
      const email = normaliseEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: 'Vul een geldig e-mailadres in.' });
      // Zorgt dat het veld en de tag in Systeme.io bestaan (eenmalig), zodat de automatisering ze kan gebruiken.
      await ensureLoginField();
      await ensureLoginTag();
      const contact = await findContact(email);
      if (contact && hasAccess(contact)) {
        const recentlySent = Date.now() - issuedAtOfLink(currentLoginField(contact)) < RESEND_COOLDOWN_MS;
        if (!recentlySent) await sendLoginLink(contact, `${publicUrl(req)}/?login=${createLoginToken(contact.id)}`);
      }
      return res.status(200).json({ sent: true, message: SENT_MESSAGE });
    }

    // Stap 2: de klant klikt op de link in de mail.
    if (action === 'verify-link') {
      const login = readLoginToken(String(req.body?.token || ''));
      if (!login) return res.status(401).json({ error: 'Deze inloglink is verlopen of ongeldig. Vraag hieronder een nieuwe aan.' });
      let contact = null;
      try { contact = await getContact(login.contactId); } catch (error) { if (error.status !== 404) throw error; }
      if (!hasAccess(contact)) return res.status(403).json({ error: 'We vinden geen actieve toegang tot de Bot bij dit account.' });
      return res.status(200).json({ loggedIn: true, token: setSession(res, 'SIO-' + login.contactId) });
    }

    return res.status(400).json({ error: 'Ongeldige aanvraag.' });
  } catch (error) {
    console.error('Bot session:', { type: error?.name || 'error', status: error?.status || 0 });
    return res.status(503).json({ error: 'Inloggen lukt momenteel niet. Probeer het over een paar minuten opnieuw.' });
  }
}
