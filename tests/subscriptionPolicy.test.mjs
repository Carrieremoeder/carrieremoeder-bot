import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_PLAN, addCalendarMonths, amsterdamDate, minimumTermEnd, cancellationEnd, cancellationRequest, billingPeriod, hasPaidAccess } from '../lib/subscriptionPolicy.js';

test('twelve monthly instalments total 156 euros; early cancellation preserves the year', () => {
  assert.equal(BOT_PLAN.monthlyAmountCents * BOT_PLAN.minimumMonths, 15600);
  assert.equal(minimumTermEnd('2026-09-27'), '2027-09-27');
  assert.equal(cancellationEnd('2026-09-27', '2026-09-27'), '2027-09-27');
  assert.equal(cancellationEnd('2026-09-27', '2027-09-26'), '2027-09-27');
});
test('after the first year notice ends one month from receipt, independent of invoice date', () => {
  assert.equal(cancellationEnd('2026-09-27', '2027-09-27'), '2027-10-27');
  assert.equal(cancellationEnd('2026-09-27', '2027-10-04'), '2027-11-04');
});
test('calendar arithmetic handles short months and leap years without drifting', () => {
  assert.equal(minimumTermEnd('2024-02-29'), '2025-02-28');
  assert.deepEqual(billingPeriod('2027-01-31', 1), { start: '2027-02-28', end: '2027-03-31' });
  assert.equal(addCalendarMonths('2027-12-31', 2), '2028-02-29');
});
test('Dutch contract day respects timezone and summer time', () => {
  assert.equal(amsterdamDate('2026-09-26T22:30:00Z'), '2026-09-27');
  assert.equal(amsterdamDate('2026-12-26T22:30:00Z'), '2026-12-26');
});
test('repeated cancellation keeps the original end date and unknown plans are rejected', () => {
  const contract = { planVersion: BOT_PLAN.version, startsOn: '2026-09-27' };
  const first = cancellationRequest(contract, '2026-10-01');
  assert.deepEqual(first, { requestedOn: '2026-10-01', endsOn: '2027-09-27' });
  assert.deepEqual(cancellationRequest({ ...contract, cancelRequestedOn: first.requestedOn, endsOn: first.endsOn }, '2027-11-01'), first);
  assert.throws(() => cancellationRequest({ ...contract, planVersion: 'legacy-lifetime' }, '2026-10-01'));
});
test('a twelve-month obligation alone never grants twelve months of unpaid access', () => {
  assert.equal(hasPaidAccess({ paidUntil: null, endsOn: '2027-09-27' }, '2026-10-01'), false);
  assert.equal(hasPaidAccess({ paidUntil: '2026-10-27', endsOn: '2027-09-27' }, '2026-10-26'), true);
  assert.equal(hasPaidAccess({ paidUntil: '2026-10-27', endsOn: '2027-09-27' }, '2026-10-27'), false);
  assert.equal(hasPaidAccess({ paidUntil: '2027-11-27', endsOn: '2027-11-04' }, '2027-11-04'), false);
  assert.equal(hasPaidAccess({ paidUntil: '2027-11-27', revoked: true }, '2026-10-01'), false);
});
test('invalid dates and impossible requests fail closed', () => {
  for (const date of ['2026-02-30', '2026-13-01', '', null, '2026-1-01']) assert.throws(() => minimumTermEnd(date));
  assert.throws(() => cancellationEnd('2026-09-27', '2026-09-26'));
  assert.throws(() => billingPeriod('2026-09-27', -1));
  assert.throws(() => billingPeriod('2026-09-27', 0.5));
});

