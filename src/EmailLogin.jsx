import { useEffect, useState } from 'react';
import * as K from './designTokens.js';
import { tabSession } from './browserSession.js';

export function readAuthReturn(location) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  if (hash.has('error') || hash.has('error_code') || query.has('error')) return { error: true };
  if (hash.get('type') === 'recovery' && hash.get('access_token')) return { recoveryToken: hash.get('access_token') };
  if (query.get('token_hash') && query.get('type') === 'recovery') return { tokenHash: query.get('token_hash'), recovery: true };
  if (query.get('token_hash') && ['email', 'signup', 'invite'].includes(query.get('type'))) return { tokenHash: query.get('token_hash'), confirm: true };
  if (hash.has('access_token')) return { confirmed: true };
  return {};
}

export default function EmailLogin({ api, onLogin, notice, styles: g }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [authReturn] = useState(() => readAuthReturn(window.location));
  const [step, setStep] = useState(() => authReturn.recoveryToken || authReturn.recovery ? 'reset' : authReturn.confirm ? 'confirm' : 'login');
  const [error, setError] = useState(authReturn.error ? 'Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe link aan.' : '');
  const [message, setMessage] = useState(authReturn.confirmed ? 'Je e-mailadres is bevestigd. Je kunt nu inloggen.' : '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!Object.keys(authReturn).length) return;
    // Keep recovery credentials out of browser history and subsequent URLs.
    const url = new URL(window.location.href);
    url.hash = '';
    for (const key of ['token_hash', 'type', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.pathname + url.search);
    tabSession.clear();
  }, [authReturn]);

  function go(next) { setStep(next); setError(''); setMessage(''); setPassword(''); setConfirm(''); }
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError(''); setMessage('');
    if ((step === 'signup' || step === 'reset') && password !== confirm) { setError('De wachtwoorden komen niet overeen.'); return; }
    setLoading(true);
    try {
      const action = { login: 'email-login', signup: 'email-signup', forgot: 'email-recover', reset: 'email-reset', confirm: 'email-confirm' }[step];
      const data = await api('session', { method: 'POST', body: JSON.stringify({ action, email: email.trim().toLowerCase(), password,
        ...(step === 'reset' || step === 'confirm' ? { recoveryToken: authReturn.recoveryToken, tokenHash: authReturn.tokenHash } : {}) }) });
      setPassword(''); setConfirm('');
      if (data.token) { tabSession.start(data.token); onLogin(); return; }
      if (step === 'reset' || step === 'confirm') {
        authReturn.recoveryToken = undefined; authReturn.tokenHash = undefined;
        setStep('login'); setMessage(step === 'reset' ? 'Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.' : 'Je e-mailadres is bevestigd. Je kunt nu inloggen.');
      } else {
        setStep('sent');
        setMessage(step === 'signup' ? 'Controleer je inbox en spammap. Als je account nog bevestigd moet worden, ontvang je een bevestigingsmail. Heb je al een account? Log in of kies Wachtwoord vergeten.' : 'Als er een account met dit e-mailadres bestaat, ontvang je een link om je wachtwoord opnieuw in te stellen. Controleer ook je spammap.');
      }
    } catch (err) { setError(err.message || 'Dit lukt momenteel niet. Probeer het opnieuw.'); }
    finally { setLoading(false); }
  }

  const linkStyle = { ...K.tekstCta, textTransform: 'none', letterSpacing: 'normal', fontSize: '13px' };
  const panel = { background: K.kleur.kaartZacht, border: `1px solid ${K.kleur.randVeld}`, padding: '12px 14px', marginBottom: '20px', fontSize: '13px', lineHeight: 1.65, color: K.kleur.tekstZacht };
  return <div style={{ ...g.loginWrap, margin: '40px auto' }}>
    <h1 style={g.loginH}>Always In Control Bot</h1>
    <p style={{ ...g.loginP, marginBottom: '24px' }}>Een lastig bericht van je ex ontvangen? Plak het bericht, voeg een screenshot toe of vertel wat er speelt. De bot helpt je begrijpen wat er gebeurt, afwegen of je wilt reageren en een rustige, duidelijke reactie formuleren.</p>
    {notice && <p role="status" style={panel}>{notice}</p>}
    {message && <p role="status" style={panel}>{message}</p>}
    {step === 'signup' && <p style={panel}>Gebruik hetzelfde e-mailadres waarmee je Always In Control Bot hebt gekocht. Kies een persoonlijk wachtwoord en bevestig je e-mailadres. Een account aanmaken sluit geen abonnement af.</p>}
    {step === 'signup' && <p style={{ fontSize: '12px', lineHeight: 1.6, color: K.kleur.tekstMeta }}>Heb je al een account voor de dossierapp? Dan kun je met dat e-mailadres en wachtwoord inloggen.</p>}
    {step === 'forgot' && <><h2 style={{ ...K.serifKop('26px'), margin: '0 0 10px' }}>Wachtwoord vergeten?</h2><p style={panel}>Vul je e-mailadres in. Je ontvangt een link waarmee je een nieuw wachtwoord kunt kiezen.</p></>}
    {step === 'reset' && <h2 style={{ ...K.serifKop('26px'), margin: '0 0 20px' }}>Nieuw wachtwoord instellen</h2>}
    {(step === 'forgot' || step === 'reset') && <p style={{ fontSize: '12px', lineHeight: 1.6, color: K.kleur.tekstMeta }}>Je wijzigt het wachtwoord van je Carrièremoeder-account. Gebruik je ook de dossierapp? Dan geldt het nieuwe wachtwoord daar ook.</p>}
    {step !== 'sent' && <form onSubmit={submit}>
      {step !== 'reset' && step !== 'confirm' && <div style={g.fldGrp}>
        <label htmlFor="login-email" style={g.lbl}>E-mailadres</label>
        <input id="login-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} style={g.inp} value={email} onChange={event => setEmail(event.target.value)} placeholder="jouw@email.nl" disabled={loading} />
      </div>}
      {step !== 'forgot' && step !== 'confirm' && <div style={g.fldGrp}>
        <label htmlFor="login-password" style={g.lbl}>{step === 'reset' ? 'Nieuw wachtwoord' : 'Wachtwoord'}</label>
        <input id="login-password" name="password" type="password" autoComplete={step === 'login' ? 'current-password' : 'new-password'} required minLength={step === 'login' ? undefined : 8} maxLength={128} style={g.inp} value={password} onChange={event => setPassword(event.target.value)} placeholder={step === 'login' ? 'Jouw wachtwoord' : 'Minimaal 8 tekens'} disabled={loading} />
      </div>}
      {(step === 'signup' || step === 'reset') && <div style={g.fldGrp}>
        <label htmlFor="login-confirm" style={g.lbl}>Herhaal wachtwoord</label>
        <input id="login-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} style={g.inp} value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Herhaal je wachtwoord" disabled={loading} />
      </div>}
      {error && <p role="alert" style={g.err}>{error}</p>}
      <button type="submit" style={{ ...g.btnP, width: '100%', marginTop: '4px' }} disabled={loading}>{loading ? 'Even wachten…' : { login: 'Inloggen →', signup: 'Account aanmaken →', forgot: 'Verstuur herstellink →', reset: 'Wachtwoord opslaan →', confirm: 'E-mailadres bevestigen →' }[step]}</button>
    </form>}
    {step === 'login' ? <>
      <button type="button" style={{ ...linkStyle, marginTop: '12px' }} onClick={() => go('forgot')} disabled={loading}>Wachtwoord vergeten?</button>
      <div style={{ borderTop: `1px solid ${K.kleur.rand}`, marginTop: '18px', paddingTop: '12px', textAlign: 'center', fontSize: '13px', color: K.kleur.tekstMeta }}>
        Nog geen account?{' '}<button type="button" style={linkStyle} onClick={() => go('signup')} disabled={loading}>Account aanmaken</button>
      </div>
    </> : <button type="button" style={{ ...linkStyle, marginTop: '14px' }} onClick={() => go('login')} disabled={loading}>← Terug naar inloggen</button>}
    <p style={{ fontSize: '12px', color: K.kleur.tekstMeta, marginTop: '22px', lineHeight: 1.7 }}>Heb je Always In Control Bot gekocht? Gebruik dan hetzelfde e-mailadres waarmee je je abonnement hebt afgesloten.</p>
  </div>;
}

