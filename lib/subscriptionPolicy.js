// Contract dates are civil dates in Europe/Amsterdam, not 30-day durations.
// This module does not charge customers or grant access.
export const BOT_PLAN = Object.freeze({
  version: 'bot-13-monthly-12-month-minimum-v1',
  currency: 'EUR', monthlyAmountCents: 1300, minimumMonths: 12,
  minimumTotalCents: 15600,
});

function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid civil date');
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid civil date');
  return date;
}

export function addCalendarMonths(value, months) {
  const date = civilDate(value);
  if (!Number.isSafeInteger(months) || months < 0 || months > 1200) throw new Error('Invalid month count');
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function amsterdamDate(instant) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function minimumTermEnd(startDate) {
  return addCalendarMonths(startDate, BOT_PLAN.minimumMonths);
}

// Early notice ends the contract on the first anniversary. Once that date
// has arrived, notice runs for one calendar month from receipt, not from the
// next invoice date. Statutory withdrawal/termination is a separate flow.
export function cancellationEnd(startDate, requestedDate) {
  civilDate(requestedDate);
  const minimumEnd = minimumTermEnd(startDate);
  if (requestedDate < startDate) throw new Error('Cancellation predates contract');
  return requestedDate < minimumEnd ? minimumEnd : addCalendarMonths(requestedDate, 1);
}

// Always calculate from the original anchor, so Jan 31 -> Feb 28 -> Mar 31.
export function billingPeriod(startDate, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 1199) throw new Error('Invalid billing index');
  return { start: addCalendarMonths(startDate, index), end: addCalendarMonths(startDate, index + 1) };
}

export function cancellationRequest(contract, requestedDate) {
  if (contract.planVersion !== BOT_PLAN.version) throw new Error('Unsupported contract plan');
  // Repeated clicks must never push an existing cancellation further out.
  if (contract.cancelRequestedOn || contract.endsOn) {
    if (!contract.cancelRequestedOn || !contract.endsOn) throw new Error('Incomplete cancellation record');
    civilDate(contract.cancelRequestedOn); civilDate(contract.endsOn);
    return { requestedOn: contract.cancelRequestedOn, endsOn: contract.endsOn };
  }
  return { requestedOn: requestedDate, endsOn: cancellationEnd(contract.startsOn, requestedDate) };
}

export function hasPaidAccess({ paidUntil, endsOn, revoked = false }, onDate) {
  civilDate(onDate);
  if (revoked || !paidUntil) return false;
  civilDate(paidUntil);
  if (endsOn) civilDate(endsOn);
  return onDate < paidUntil && (!endsOn || onDate < endsOn);
}

