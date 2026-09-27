import { currentCode, db, sameOrigin } from '../lib/security.js';
import { BOT_PLAN, amsterdamDate, cancellationRequest, minimumTermEnd } from '../lib/subscriptionPolicy.js';

const fields = 'id,code,plan_version,starts_on,paid_until,cancel_requested_on,ends_on,provider_sync';
function summary(row) {
  return {
    monthlyAmountCents: BOT_PLAN.monthlyAmountCents, currency: BOT_PLAN.currency,
    startsOn: row.starts_on, minimumTermEndsOn: minimumTermEnd(row.starts_on),
    paidUntil: row.paid_until, cancelRequestedOn: row.cancel_requested_on,
    endsOn: row.ends_on, processing: row.provider_sync === 'pending',
  };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Do not expose this workflow until the provider worker and recovery login
  // for non-paying accounts have both been verified end to end.
  if (process.env.BOT_SUBSCRIPTIONS_ENABLED !== 'true') return res.status(503).json({ error: 'Abonnementenbeheer is nog niet beschikbaar.' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).end();
  try {
    const code = currentCode(req);
    if (!code) return res.status(401).json({ error: 'Log opnieuw in.' });
    // Do not require paid chat access in order to view/cancel a contract.
    // Only the server-issued identity is used, never a code from the body.
    const query = `?code=eq.${encodeURIComponent(code)}&closed_at=is.null&select=${fields}&limit=2`;
    let rows = await db('bot_contracts', { query });
    if (!rows?.length) return res.status(404).json({ error: 'Geen abonnement gevonden voor dit account.' });
    if (rows.length !== 1 || rows[0].plan_version !== BOT_PLAN.version) return res.status(409).json({ error: 'Dit abonnement moet worden nagekeken. Neem contact op met Carrièremoeder.' });
    let row = rows[0];
    if (req.method === 'GET') return res.status(200).json(summary(row));
    if (req.body?.action !== 'cancel') return res.status(400).json({ error: 'Onbekende actie.' });
    const request = cancellationRequest({ planVersion: row.plan_version, startsOn: row.starts_on, cancelRequestedOn: row.cancel_requested_on, endsOn: row.ends_on }, amsterdamDate(Date.now()));
    if (!row.cancel_requested_on) {
      const updated = await db('bot_contracts', {
        method: 'PATCH',
        query: `?id=eq.${encodeURIComponent(row.id)}&code=eq.${encodeURIComponent(code)}&cancel_requested_on=is.null&closed_at=is.null`,
        data: { cancel_requested_on: request.requestedOn, ends_on: request.endsOn, provider_sync: 'pending' },
      });
      // A concurrent request may have won. Return its persisted date instead
      // of moving the termination date or scheduling another provider action.
      if (updated?.length === 1) row = updated[0];
      else {
        rows = await db('bot_contracts', { query });
        if (rows?.length !== 1 || !rows[0].cancel_requested_on) throw new Error('Cancellation not persisted');
        row = rows[0];
      }
    }
    return res.status(200).json({ ...summary(row), message: 'Je opzegging is geregistreerd. De verwerking van de incasso wordt apart bevestigd.' });
  } catch {
    return res.status(503).json({ error: 'Opslaan of ophalen is niet gelukt. Probeer het opnieuw of neem contact op met Carrièremoeder.' });
  }
}

