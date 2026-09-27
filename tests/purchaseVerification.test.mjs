import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { systemePayload, verifySystemeSignature, saleIdentity, firstPaidPeriod } from '../lib/purchaseVerification.js';
const config = { funnelId: 7643956, stepId: 25595872, pricePlanId: 123 }; // fixture only
const body = () => ({ customer:{id:1,email:' Test@Example.com ',paymentProcessor:'mollie'},
  funnelStep:{id:25595872,funnel:{id:7643956}},orderItem:{id:789},
  pricePlan:{id:123,amount:1300,currency:'eur'},coupon:null });
const payment = () => ({resource:'payment',mode:'test',id:'tr_test',customerId:'cst_test',
  metadata:{sio_order_item_id:789},status:'paid',sequenceType:'first',amount:{currency:'EUR',value:'13.00'},
  amountRefunded:{currency:'EUR',value:'0.00'},amountChargedBack:{currency:'EUR',value:'0.00'},paidAt:'2026-01-31T12:00:00Z'});
test('Systeme signature matches independently written normalized Unicode and slash fixture',()=>{
  const payload = {sourceURL:'https://example.com',name:'René'};
  const normalized = '{"sourceURL":"https:\\/\\/example.com","name":"Ren\\u00e9"}';
  assert.equal(systemePayload(payload),normalized);
  const secret='unit-test-signing-secret-32-characters';
  const signature=createHmac('sha256',secret).update(normalized).digest('hex');
  assert.equal(verifySystemeSignature(payload,signature,secret),true);
  assert.equal(verifySystemeSignature({...payload,name:'Other'},signature,secret),false);
  assert.equal(verifySystemeSignature(payload,'bogus',secret),false);
  assert.throws(()=>verifySystemeSignature(payload,signature,''));
});
test('only configured funnel, step and plan can create a purchase identity',()=>{
  assert.equal(saleIdentity(body(),config).email,'test@example.com');
  for(const field of ['funnelId','stepId','pricePlanId']) assert.equal(saleIdentity(body(),{...config,[field]:999}),null);
  assert.throws(()=>saleIdentity(body(),{}));
  for(const change of [b=>b.customer.paymentProcessor='stripe',b=>b.pricePlan.amount=1,b=>b.coupon={code:'discount'}]) {
    const b=body();change(b);assert.throws(()=>saleIdentity(b,config));
  }
});
test('first period is anchored to provider paidAt and repeated delivery never extends it',()=>{
  const sale=saleIdentity(body(),config);
  const result=firstPaidPeriod(sale,payment());
  assert.equal(result.startsOn,'2026-01-31');assert.equal(result.paidUntil,'2026-02-28');
  assert.deepEqual(firstPaidPeriod(sale,payment()),result);
  for(const status of ['pending','open','failed','expired','canceled','authorized']) assert.equal(firstPaidPeriod(sale,{...payment(),status}),null);
});
test('unmatched purchases, live payments, refunds, chargebacks and unknown payment shapes fail closed',()=>{
  const sale=saleIdentity(body(),config);
  for(const change of [p=>p.mode='live',p=>p.metadata.sio_order_item_id=790,p=>p.customerId=null,
    p=>p.amount.value='12.00',p=>p.sequenceType='recurring',p=>p.paidAt=null,
    p=>p.amountRefunded.value='1.00',p=>p.amountChargedBack.value='13.00',p=>delete p.amountRefunded]) {
    const p=payment();change(p);assert.throws(()=>firstPaidPeriod(sale,p));
  }
});

