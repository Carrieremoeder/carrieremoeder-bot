import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHmac } from 'node:crypto';
import { createPurchaseHandler } from '../api/systeme-sale.js';
import { systemePayload } from '../lib/purchaseVerification.js';
import { recordRestrictedPurchase, testDatabaseConfig, ISOLATION_SQL } from '../lib/restrictedPurchaseStore.js';

const env = { VERCEL_ENV: 'preview', BOT_TEST_DATABASE_URL: 'postgresql://bot_payment_test_runner:fixture@db.ejtfgvlaygrcthjihwoa.supabase.co:5432/postgres' };
const data = { p_order_item_id:'1',p_customer_id:'2',p_email:'offline@example.invalid',p_price_plan_id:'3',p_payload_hash:'a'.repeat(64) };

test('restricted connection accepts only verified Supabase targets, test identity and strict TLS', () => {
  const config = testDatabaseConfig(env);
  assert.equal(config.ssl.rejectUnauthorized,true);
  assert.equal(config.user,'bot_payment_test_runner');
  assert.equal(config.connectionTimeoutMillis,5000);
  const passwordOnly = testDatabaseConfig({VERCEL_ENV:'preview',BOT_TEST_DATABASE_PASSWORD:'fixture:@ /?#%'});
  assert.equal(passwordOnly.password,'fixture:@ /?#%');
  assert.equal(passwordOnly.host,'aws-1-eu-west-1.pooler.supabase.com');
  assert.throws(()=>testDatabaseConfig({...env,BOT_TEST_DATABASE_PASSWORD:'ambiguous'}));
  const pool = 'postgresql://bot_payment_test_runner.ejtfgvlaygrcthjihwoa:fixture@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';
  assert.equal(testDatabaseConfig({...env,BOT_TEST_DATABASE_URL:pool}).port,6543);
  for (const url of [
    env.BOT_TEST_DATABASE_URL.replace('bot_payment_test_runner:','postgres:'),
    env.BOT_TEST_DATABASE_URL.replace('ejtfgvlaygrcthjihwoa','yvdkzswqfwycpoifxdxd'),
    env.BOT_TEST_DATABASE_URL.replace('db.ejtfgvlaygrcthjihwoa.supabase.co','attacker.invalid'),
    env.BOT_TEST_DATABASE_URL+'?sslmode=disable',env.BOT_TEST_DATABASE_URL+'#ignored',
    env.BOT_TEST_DATABASE_URL.replace(':fixture@','@'),env.BOT_TEST_DATABASE_URL.replace(':5432',':1234'),
    env.BOT_TEST_DATABASE_URL.replace('/postgres','/other'),
    pool.replace('bot_payment_test_runner.ejtfgvlaygrcthjihwoa','postgres.ejtfgvlaygrcthjihwoa'),
  ]) assert.throws(()=>testDatabaseConfig({...env,BOT_TEST_DATABASE_URL:url}));
  assert.throws(()=>testDatabaseConfig({...env,VERCEL_ENV:'production'}));
});

test('restricted store rejects real emails and unexpected fields before connecting', async () => {
  let calls=0;
  for (const invalid of [{...data,p_email:'person@example.com'},{...data,p_order_item_id:"1');drop table codes;--"},
    {...data,p_payload_hash:'bad'},{...data,access_until:'2099-01-01'}]) {
    await assert.rejects(recordRestrictedPurchase(invalid,{env,createClient:()=>{calls++;}}),/unavailable/);
  }
  assert.equal(calls,0);
});

test('transaction failures rollback, close and never disclose driver errors', async () => {
  for (const failure of ['connect','isolation','record','commit']) {
    const queries=[]; let closed=false;
    const client={
      connect:async()=>{if(failure==='connect')throw new Error('PRIVATE password');},
      query:async(sql)=>{
        queries.push(sql);
        if(sql===ISOLATION_SQL)return {rows:[{isolated:failure!=='isolation'}]};
        if(sql.includes('record_purchase')){if(failure==='record')throw new Error('PRIVATE email');return {rows:[{recorded:true}]};}
        if(sql==='commit' && failure==='commit')throw new Error('PRIVATE connection');
        return {rows:[]};
      },end:async()=>{closed=true;},
    };
    await assert.rejects(recordRestrictedPurchase(data,{env,createClient:()=>client}),{message:'Restricted purchase storage unavailable'});
    assert.equal(closed,true);
    if(failure!=='connect')assert.equal(queries.at(-1),'rollback');
    if(failure==='isolation')assert.ok(!queries.some(q=>q.includes('record_purchase')));
  }
});

test('restricted adapter writes through PostgreSQL as test session and refuses later PUBLIC grants', async () => {
  const originalEnv={...process.env};
  const db=new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create table public.codes(code text);');
  await db.exec(await readFile(new URL('../supabase/payment-test-zone.sql',import.meta.url),'utf8'));
  const createClient=()=>({
    connect:()=>db.exec('set session authorization bot_payment_test_runner'),
    query:(sql,values)=>db.query(sql,values),
    end:()=>db.exec('set session authorization postgres'),
  });
  try {
    assert.equal(await recordRestrictedPurchase(data,{env,createClient}),true);
    assert.equal(await recordRestrictedPurchase(data,{env,createClient}),true);
    assert.equal((await db.query('select count(*)::int as n from bot_payment_test.purchase_inbox')).rows[0].n,1);
    await assert.rejects(recordRestrictedPurchase({...data,p_email:'other@example.invalid'},{env,createClient}));
    Object.assign(process.env,{VERCEL_ENV:'preview',BOT_PURCHASE_INTAKE_ENABLED:'true',
      SYSTEME_WEBHOOK_SECRET:'offline-only-signing-secret-at-least-32-characters',
      SYSTEME_BOT_FUNNEL_ID:'1',SYSTEME_BOT_STEP_ID:'2',SYSTEME_BOT_PRICE_PLAN_ID:'3'});
    const body={customer:{id:2,email:'handler@example.invalid',paymentProcessor:'mollie'},
      funnelStep:{id:2,funnel:{id:1}},orderItem:{id:7},pricePlan:{id:3,amount:1300,currency:'EUR'}};
    const signature=createHmac('sha256',process.env.SYSTEME_WEBHOOK_SECRET).update(systemePayload(body)).digest('hex');
    const handler=createPurchaseHandler({store:value=>recordRestrictedPurchase(value,{env,createClient})});
    async function deliver(sig=signature){
      const res={setHeader(){},status(code){this.code=code;return this;},json(){return this;},end(){return this;}};
      await handler({method:'POST',body,headers:{'x-webhook-signature':sig,'x-webhook-event':'SALE_NEW','x-webhook-schema-version':'1'}},res);
      return res.code;
    }
    assert.equal(await deliver('invalid'),401);
    assert.equal(await deliver(),202);assert.equal(await deliver(),202);
    assert.equal((await db.query("select count(*)::int as n from bot_payment_test.purchase_inbox where order_item_id='7'")).rows[0].n,1);
    await db.exec('grant select on public.codes to public');
    await assert.rejects(recordRestrictedPurchase({...data,p_order_item_id:'4'},{env,createClient}));
    assert.equal((await db.query('select count(*)::int as n from bot_payment_test.purchase_inbox')).rows[0].n,2);
    assert.equal(await deliver(),503);
  } finally {
    await db.close();
    for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
    Object.assign(process.env,originalEnv);
  }
});
