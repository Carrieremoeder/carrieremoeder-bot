import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../api/systeme-sale.js';
import { systemePayload } from '../lib/purchaseVerification.js';
test('intake authenticates, scopes the product, stores minimal evidence and never writes access', async()=>{
  const saved={...process.env}; const originalFetch=globalThis.fetch;
  Object.assign(process.env,{BOT_PURCHASE_INTAKE_ENABLED:'true',VERCEL_ENV:'preview',
    SYSTEME_WEBHOOK_SECRET:'test-signature-secret-at-least-32-characters',SYSTEME_BOT_FUNNEL_ID:'1',
    SYSTEME_BOT_STEP_ID:'2',SYSTEME_BOT_PRICE_PLAN_ID:'3',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',
    BOT_STAGING_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst',BOT_STAGING_SUPABASE_SERVICE_ROLE_KEY:'staging-fixture'});
  const body={customer:{id:4,email:'test@example.com',clientIp:'PRIVATE',paymentProcessor:'mollie'},
    funnelStep:{id:2,funnel:{id:1}},orderItem:{id:5},pricePlan:{id:3,amount:1300,currency:'eur'}};
  const signature=createHmac('sha256',process.env.SYSTEME_WEBHOOK_SECRET).update(systemePayload(body)).digest('hex');
  const request={method:'POST',body,headers:{'x-webhook-signature':signature,'x-webhook-event':'SALE_NEW','x-webhook-schema-version':'1'}};
  let calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>true}};
  async function invoke(req=request){const res={setHeader(){},status(n){this.code=n;return this},json(value){this.body=value;return this},end(){return this}};await handler(req,res);return res;}
  try {
    process.env.VERCEL_ENV='production';assert.equal((await invoke()).code,503);process.env.VERCEL_ENV='preview';
    assert.equal((await invoke({...request,headers:{...request.headers,'x-webhook-signature':'bad'}})).code,401);
    assert.equal(calls.length,0);
    delete process.env.BOT_STAGING_SUPABASE_PROJECT_REF;
    assert.equal((await invoke()).code,503);assert.equal(calls.length,0);
    process.env.BOT_STAGING_SUPABASE_PROJECT_REF='ejtfgvlaygrcthjihwoa';
    assert.equal((await invoke()).code,503);assert.equal(calls.length,0);
    process.env.BOT_STAGING_SUPABASE_PROJECT_REF='abcdefghijklmnopqrst';
    assert.equal((await invoke()).code,202);
    assert.equal(calls[0].url,'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/bot_record_purchase');
    assert.equal(calls[0].options.headers.apikey,'staging-fixture');
    assert.equal(calls[0].options.body.includes('PRIVATE'),false);
    assert.equal(calls[0].options.body.includes('access_until'),false);
    process.env.SYSTEME_BOT_PRICE_PLAN_ID='99';assert.equal((await invoke()).code,204);assert.equal(calls.length,1);
    process.env.SYSTEME_BOT_PRICE_PLAN_ID='3';
    globalThis.fetch=async()=>({ok:false,status:500});assert.equal((await invoke()).code,503);
  } finally {globalThis.fetch=originalFetch;for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key];Object.assign(process.env,saved);}
});


