import { useEffect, useRef, useState } from 'react';
import * as K from './designTokens.js';

const date = value => value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Nog niet beschikbaar';

// The server feature gate stays authoritative. Disabled or absent contracts do
// not add a non-working management entry to existing customers' accounts.
export default function Subscription({ api, required = false }) {
  const [subscription, setSubscription] = useState(null);
  const [open, setOpen] = useState(required);
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setError('');
    api('subscription').then(data => { if (!cancelled) setSubscription(data); }).catch(err => { if (!cancelled) setError(err.message || 'Ophalen is niet gelukt.'); });
    return () => { cancelled = true; mounted.current = false; };
  }, [api, attempt]);

  async function cancel() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      const data = await api('subscription', { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
      if (mounted.current) { setSubscription(data); setConfirm(false); }
    } catch (err) {
      if (mounted.current) setError(err.message || 'Je opzegging kon niet worden bevestigd. Probeer het opnieuw.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!subscription) return required ? <div>
    {error ? <><p role="alert">{error}</p><button style={K.secundaireKnop} onClick={() => setAttempt(value => value + 1)}>Opnieuw proberen</button></> : <p role="status">Abonnement ophalen…</p>}
  </div> : null;
  return <section aria-label="Mijn abonnement" style={{ borderBottom: `1px solid ${K.kleur.randStructuur}`, padding: '12px 20px', maxHeight: '55dvh', overflowY: 'auto', flexShrink: 0 }}>
    <button type="button" style={K.secundaireKnop} aria-expanded={open} aria-controls="subscription-details" onClick={() => setOpen(value => !value)}>Mijn abonnement</button>
    {open && <div id="subscription-details" style={{ maxWidth: '640px', lineHeight: 1.7 }}>
      <h2 style={{ ...K.serifKop('28px'), marginBottom: '8px' }}>Jouw botabonnement</h2>
      <p>{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: subscription.currency }).format(subscription.monthlyAmountCents / 100)} per maand inclusief btw.</p>
      <dl>
        <dt>Startdatum</dt><dd>{date(subscription.startsOn)}</dd>
        <dt>Einde eerste abonnementsjaar</dt><dd>{date(subscription.minimumTermEndsOn)}</dd>
        <dt>Betaalde toegang tot</dt><dd>{date(subscription.paidUntil)}</dd>
      </dl>
      {subscription.cancelRequestedOn ? <div role="status">
        <p>Je opzegging is geregistreerd op {date(subscription.cancelRequestedOn)}. Je abonnement eindigt op {date(subscription.endsOn)}.</p>
        <p>De verwerking van de incasso wordt apart bevestigd.</p>
      </div> : <>
        <p>Je kunt nu alvast opzeggen. Tijdens het eerste jaar eindigt je abonnement aan het einde van dat jaar. Daarna geldt een opzegtermijn van één maand.</p>
        {!confirm ? <button type="button" style={K.secundaireKnop} onClick={() => setConfirm(true)}>Abonnement opzeggen</button> : <div>
          <p>Wil je je opzegging doorgeven? Na het opslaan tonen we de geregistreerde einddatum. De incasso wordt apart verwerkt.</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" style={K.actieKnop} disabled={busy} onClick={cancel}>{busy ? 'Opzegging opslaan…' : 'Ja, opzegging doorgeven'}</button>
            <button type="button" style={K.secundaireKnop} disabled={busy} onClick={() => { setConfirm(false); setError(''); }}>Abonnement behouden</button>
          </div>
        </div>}
      </>}
      {error && <p role="alert" style={{ color: K.kleur.gevaar }}>{error}</p>}
    </div>}
  </section>;
}
