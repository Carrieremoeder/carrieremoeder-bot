import * as K from './designTokens.js';

// Vaste links naar opzeggen, herroepen en de voorwaarden. Staan ook op het inlogscherm,
// zodat herroepen en opzeggen zonder inloggen te vinden zijn (wettelijk verplicht).
export const LINKS = [
  { href: 'https://www.meestermasha.nl/herroepen-bot', label: 'Herroepen (binnen 14 dagen)' },
  { href: 'https://www.meestermasha.nl/opzeggen-bot', label: 'Abonnement opzeggen' },
  { href: 'https://www.meestermasha.nl/gebruiksvoorwaarden-bot', label: 'Gebruiksvoorwaarden' },
  { href: 'https://www.meestermasha.nl/privacybeleid', label: 'Privacyverklaring' }
];

export default function AccountLinks({ style }) {
  const link = { color: K.kleur.tekstMeta, textDecoration: 'underline', textUnderlineOffset: '3px' };
  return <nav aria-label="Abonnement en voorwaarden" style={{ fontSize: '11px', lineHeight: 1.9, color: K.kleur.tekstMeta, ...style }}>
    {LINKS.map((l, i) => <span key={l.href}>
      {i > 0 && <span aria-hidden="true"> · </span>}
      <a href={l.href} target="_blank" rel="noopener" style={link}>{l.label}</a>
    </span>)}
  </nav>;
}
