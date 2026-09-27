import { createHmac, timingSafeEqual } from 'node:crypto';
import { normaliseEmail } from './emailAuth.js';
import { amsterdamDate, billingPeriod, BOT_PLAN } from './subscriptionPolicy.js';

// Systeme signs normalized JSON, including escaped slashes and UTF-16 units.
// https://developer.systeme.io/docs/webhooks
export function systemePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid purchase payload');
  return JSON.stringify(body).replace(/\//g, '\\/').replace(/[\u007f-\uffff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function verifySystemeSignature(body, signature, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Purchase signature configuration missing');
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(systemePayload(body)).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function positiveId(value) {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]{0,15}$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('Invalid purchase identifier');
  return text;
}

// Only call after authenticating the sale notification. These configured IDs
// must be verified from a purchase of the actual plan before enabling intake.
export function saleIdentity(body, expected) {
  for (const name of ['funnelId', 'stepId', 'pricePlanId']) positiveId(expected?.[name]);
  if (positiveId(body?.funnelStep?.funnel?.id) !== String(expected.funnelId)
    || positiveId(body?.funnelStep?.id) !== String(expected.stepId)
    || positiveId(body?.pricePlan?.id) !== String(expected.pricePlanId)) return null;
  if (body.customer?.paymentProcessor !== 'mollie' || body.pricePlan.amount !== 1300
    || body.pricePlan.currency?.toUpperCase() !== 'EUR' || body.coupon != null) throw new Error('Unsupported purchase terms');
  return {
    orderItemId: positiveId(body.orderItem?.id),
    customerId: positiveId(body.customer?.id),
    email: normaliseEmail(body.customer?.email),
    pricePlanId: positiveId(body.pricePlan.id),
    planVersion: BOT_PLAN.version,
  };
}

// Caller supplies a server-fetched payment, NEVER a webhook's asserted status.
// Returns a first-period candidate; it does not write codes or create a contract.
// Provider subscription mapping and accepted terms remain separate requirements.
export function firstPaidPeriod(sale, payment) {
  if (!sale || sale.planVersion !== BOT_PLAN.version) throw new Error('Unknown purchase');
  if (payment?.resource !== 'payment' || payment.mode !== 'test'
    || !/^tr_[A-Za-z0-9]+$/.test(payment.id || '')
    || !/^cst_[A-Za-z0-9]+$/.test(payment.customerId || '')
    || positiveId(payment.metadata?.sio_order_item_id) !== positiveId(sale.orderItemId)) throw new Error('Payment does not match purchase');
  if (payment.status !== 'paid') return null;
  if (payment.sequenceType !== 'first' || payment.amount?.currency !== 'EUR'
    || payment.amount.value !== '13.00') throw new Error('Unsupported first payment');
  for (const amount of [payment.amountRefunded, payment.amountChargedBack]) {
    if (!amount || amount.currency !== 'EUR' || amount.value !== '0.00') throw new Error('Payment reversals require review');
  }
  if (typeof payment.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(payment.paidAt)
    || !Number.isFinite(Date.parse(payment.paidAt))) throw new Error('Missing payment date');
  const period = billingPeriod(amsterdamDate(payment.paidAt), 0);
  return { paymentId: payment.id, mollieCustomerId: payment.customerId,
    orderItemId: sale.orderItemId, email: sale.email, startsOn: period.start,
    paidUntil: period.end, mode: 'test' };
}

