import { Client } from 'pg';
import { supabaseTestCa } from './supabaseTestCa.js';

const PROJECT = 'ejtfgvlaygrcthjihwoa';
const ROLE = 'bot_payment_test_runner';
const FAILURE = 'Restricted purchase storage unavailable';

export function testDatabaseConfig(env) {
  if (env.VERCEL_ENV !== 'preview') throw new Error(FAILURE);
  if (env.BOT_TEST_DATABASE_PASSWORD && env.BOT_TEST_DATABASE_URL) throw new Error(FAILURE);
  // A password-only setting avoids asking the owner to encode a connection URI.
  const connection = env.BOT_TEST_DATABASE_PASSWORD
    ? `postgresql://${ROLE}.${PROJECT}:${encodeURIComponent(env.BOT_TEST_DATABASE_PASSWORD)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`
    : env.BOT_TEST_DATABASE_URL;
  let url;
  try { url = new URL(connection); } catch { throw new Error(FAILURE); }
  const direct = url.hostname === `db.${PROJECT}.supabase.co`;
  const pooled = url.hostname === 'aws-1-eu-west-1.pooler.supabase.com';
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooled)
      || user !== (direct ? ROLE : `${ROLE}.${PROJECT}`) || !password
      || url.pathname !== '/postgres' || url.search || url.hash
      || !['5432', '6543'].includes(url.port || '5432') || (direct && url.port && url.port !== '5432')) {
    throw new Error(FAILURE);
  }
  return {
    host: url.hostname, port: Number(url.port || 5432), user, password, database: 'postgres',
    ssl: { rejectUnauthorized: true, ca: env.BOT_TEST_DATABASE_CA || supabaseTestCa },
    connectionTimeoutMillis: 5000, query_timeout: 10000,
    application_name: 'bot-payment-test',
  };
}

// Recheck effective privileges on every connection: later PUBLIC grants must not
// silently give this test connection access to customers or privileged functions.
export const ISOLATION_SQL = `select
  current_user = 'bot_payment_test_runner' and session_user = 'bot_payment_test_runner'
  and not exists(select 1 from pg_roles where rolname=current_user and
    (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls))
  and not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname=current_user)
  and not exists(select 1 from pg_namespace n where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema' and has_schema_privilege(current_user,n.oid,'CREATE'))
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not like 'pg_%' and n.nspname not in ('information_schema','bot_payment_test')
    and has_schema_privilege(current_user,n.oid,'USAGE') and (
      (c.relkind in ('r','p','v','m','f') and (
        has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      or (c.relkind='S' and has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))))
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not like 'pg_%' and n.nspname not in ('information_schema','bot_payment_test')
    and (n.nspname in ('public','auth','storage') or p.prosecdef)
    and has_schema_privilege(current_user,n.oid,'USAGE') and has_function_privilege(current_user,p.oid,'EXECUTE'))
  as isolated`;

export async function recordRestrictedPurchase(data, { env = process.env, createClient = options => new Client(options) } = {}) {
  let client;
  let connected = false;
  try {
    const config = testDatabaseConfig(env);
    const fields = ['p_order_item_id','p_customer_id','p_email','p_price_plan_id','p_payload_hash'];
    if (!data || Object.keys(data).length !== fields.length || fields.some(key => typeof data[key] !== 'string')
        || !/^[^@\s]+@[^@\s]+\.invalid$/.test(data.p_email)
        || !/^[a-f0-9]{64}$/.test(data.p_payload_hash)
        || ['p_order_item_id','p_customer_id','p_price_plan_id'].some(key => !/^[1-9][0-9]{0,15}$/.test(data[key]))) throw new Error(FAILURE);
    client = createClient(config);
    await client.connect(); connected = true;
    await client.query('begin');
    await client.query("set local statement_timeout = '8s'");
    await client.query("set local lock_timeout = '3s'");
    const check = await client.query(ISOLATION_SQL);
    if (check.rows?.length !== 1 || check.rows[0].isolated !== true) throw new Error(FAILURE);
    const result = await client.query('select bot_payment_test.record_purchase($1,$2,$3,$4,$5) as recorded', fields.map(key => data[key]));
    if (result.rows?.length !== 1 || result.rows[0].recorded !== true) throw new Error(FAILURE);
    await client.query('commit');
    return true;
  } catch {
    if (connected) { try { await client.query('rollback'); } catch {} }
    throw new Error(FAILURE);
  } finally {
    if (client) { try { await client.end(); } catch {} }
  }
}
