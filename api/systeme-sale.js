import { createHash } from 'node:crypto';
import { recordTestPurchase } from '../lib/purchaseStore.js';
import { saleIdentity, systemePayload, verifySystemeSignature } from '../lib/purchaseVerification.js';

// Staging intake only. Persist minimal order evidence; never grant access here.
export function createPurchaseHandler({ store = recordTestPurchase } = {}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.BOT_PURCHASE_INTAKE_ENABLED !== 'true' || process.env.VERCEL_ENV !== 'preview') return res.status(503).json({error:'Not enabled'});
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body) || '') > 65536) return res.status(413).end();
    if (!verifySystemeSignature(body, req.headers['x-webhook-signature'], process.env.SYSTEME_WEBHOOK_SECRET)) return res.status(401).end();
    // Headers are not covered by the body HMAC: they are routing hints, not
    // entitlement evidence. Intake cannot mark a purchase paid or canceled.
    if (req.headers['x-webhook-event'] !== 'SALE_NEW') return res.status(204).end();
    if (req.headers['x-webhook-schema-version'] !== '1') return res.status(400).end();
    const sale = saleIdentity(body, {
      funnelId: process.env.SYSTEME_BOT_FUNNEL_ID,
      stepId: process.env.SYSTEME_BOT_STEP_ID,
      pricePlanId: process.env.SYSTEME_BOT_PRICE_PLAN_ID,
    });
    if (!sale) return res.status(204).end();
    const result = await store({
      p_order_item_id: sale.orderItemId, p_customer_id: sale.customerId,
      p_email: sale.email, p_price_plan_id: sale.pricePlanId,
      p_payload_hash: createHash('sha256').update(systemePayload(body)).digest('hex'),
    });
    if (result !== true) throw new Error('Purchase not persisted');
    return res.status(202).json({received:true});
  } catch {
    // No emails, provider data or secret values in the response or logs.
    return res.status(503).json({error:'Purchase could not be recorded'});
  }
}
}

export default createPurchaseHandler();


