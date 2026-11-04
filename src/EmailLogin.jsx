import { useEffect, useRef, useState } from 'react';
import * as K from './designTokens.js';
import { tabSession } from './browserSession.js';

// Inloggen zonder wachtwoord: de klant vult zijn e-mailadres in en ontvangt via Systeme.io een inloglink.
export function readAuthReturn(location) {
  const token = new URLSearchParams(location.search).get('login');
  return token ? { loginToken: token } : {};
}

export default function EmailLogin({ api, onLogin, notice, styles: g }) {
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(false);
  const [authReturn] = useState(() => readAuthReturn(window.location));
  const [step, setStep] = useState(authReturn.loginToken ? 'verifying' : 'email');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const verified = useRef(false);

  useEffect(() => {
    if (!authReturn.loginToken || verified.current) return;
    verified.current = true;
    // De inloglink niet in de browsergeschiedenis laten staan.
    const url = new URL(window.location.href);
    url.searchParams.delete('login');
    window.history.replaceState(null, '', url.pathname + url.search);
    tabSession.clear();
    api('session', { method: 'POST', body: JSON.stringify({ action: 'verify-link', token: authReturn.loginToken }) })
      .then(data => { if (data.token) { tabSession.start(data.token, data.remember === true); onLogin(); } })
      .catch(err => { setStep('email'); setError(err.message || 'Deze inloglink werkt niet meer. Vraag hieronder een nieuwe aan.'); });
  }, [authReturn, api, onLogin]);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError(''); setMessage('');
    setLoading(true);
    try {
      const data = await api('session', { method: 'POST', body: JSON.stringify({ action: 'request-link', email: email.trim().toLowerCase(), remember }) });
      setStep('sent');
      setMessage(data.message || 'Controleer je inbox en spammap voor je inloglink.');
    } catch (err) { setError(err.message || 'Dit lukt momenteel niet. Probeer het opnieuw.'); }
    finally { setLoading(false); }
  }

  const linkStyle = { ...K.tekstCta, textTransform: 'none', letterSpacing: 'normal', fontSize: '13px' };
  const panel = { background: K.kleur.kaartZacht, border: `1px solid ${K.kleur.randVeld}`, padding: '12px 14px', marginBottom: '20px', fontSize: '13px', lineHeight: 1.65, color: K.kleur.tekstZacht };
  return <div style={{ ...g.loginWrap, margin: '40px auto' }}>
    <h1 style={g.loginH}>Always In Control Bot</h1>
    <p style={{ ...g.loginP, marginBottom: '24px' }}>Een lastig bericht van je ex ontvangen? Plak het bericht of vertel wat er speelt. De bot helpt je begrijpen wat er gebeurt, afwegen of je wilt reageren en een rustige, duidelijke reactie formuleren.</p>
    {notice && <p role="status" style={panel}>{notice}</p>}
    {step === 'verifying' && <p role="status" style={panel}>Je wordt ingelogd…</p>}
    {message && <p role="status" style={panel}>{message}</p>}
    {step === 'email' && <form onSubmit={submit}>
      <div style={g.fldGrp}>
        <label htmlFor="login-email" style={g.lbl}>E-mailadres</label>
        <input id="login-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} style={g.inp} value={email} onChange={event => setEmail(event.target.value)} placeholder="jouw@email.nl" disabled={loading} />
      </div>
      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.6, color: K.kleur.tekstZacht, margin: '4px 0 16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={loading} style={{ marginTop: '4px', accentColor: K.kleur.tekst }} />
        <span>Blijf ingelogd op dit apparaat (30 dagen). Niet aanvinken op een computer of telefoon die je deelt met anderen.</span>
      </label>
      {error && <p role="alert" style={g.err}>{error}</p>}
      <button type="submit" style={{ ...g.btnP, width: '100%', marginTop: '4px' }} disabled={loading}>{loading ? 'Even wachten…' : 'Stuur mij een inloglink →'}</button>
      <p style={{ fontSize: '12px', color: K.kleur.tekstMeta, marginTop: '14px', lineHeight: 1.7 }}>Je hebt geen wachtwoord nodig. Je ontvangt een link per e-mail waarmee je direct inlogt. De link is 24 uur geldig. Je gesprekken worden nooit bewaard.</p>
    </form>}
    {step === 'sent' && <button type="button" style={{ ...linkStyle, marginTop: '4px' }} onClick={() => { setStep('email'); setMessage(''); }}>← Ander e-mailadres gebruiken</button>}
    <p style={{ fontSize: '12px', color: K.kleur.tekstMeta, marginTop: '22px', lineHeight: 1.7 }}>Gebruik het e-mailadres waarmee je Always In Control Bot hebt gekocht.</p>
  </div>;
}
