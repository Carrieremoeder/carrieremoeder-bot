import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_VERSION, consentValue, currentConsent, hasAnswered } from '../lib/consent.js';

const contactWith = value => ({ fields: [{ slug: 'bot_toestemming', value }] });

test('consentValue legt keuze, datum en versie vast', () => {
  const now = new Date('2026-12-01T10:00:00Z');
  assert.equal(consentValue(true, now), `ja op 01-12-2026, versie ${CONSENT_VERSION}`);
  assert.equal(consentValue(false, now), `nee op 01-12-2026, versie ${CONSENT_VERSION}`);
});

test('ja en nee gelden allebei als beantwoord voor de huidige versie', () => {
  assert.equal(hasAnswered(contactWith(consentValue(true))), true);
  assert.equal(hasAnswered(contactWith(consentValue(false))), true);
});

test('leeg veld of oude versie betekent: vraag opnieuw stellen', () => {
  assert.equal(hasAnswered({ fields: [] }), false);
  assert.equal(hasAnswered(contactWith('ja op 01-01-2026, versie 2026-01-01')), false);
  assert.equal(currentConsent(null), '');
});
