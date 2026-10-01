import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/payment-test-zone.sql', import.meta.url), 'utf8');
async function fixture(extra = '') {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table public.codes(code text); insert into public.codes values ('DO-NOT-CHANGE');
    create table public.chat(body text); create table auth.users(id text);
    create table storage.objects(id text); ${extra}`);
  return db;
}
test('PostgreSQL enforces test-only writes, duplicate identity and denied production access', async t => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const attrs = (await db.query(`select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
      from pg_roles where rolname='bot_payment_test_runner'`)).rows[0];
    assert.ok(Object.values(attrs).every(value => value === false));
    await db.exec('set role bot_payment_test_runner');
    const record = (email = 'offline@example.invalid', hash = 'a'.repeat(64)) =>
      db.query('select bot_payment_test.record_purchase($1,$2,$3,$4,$5) as recorded', ['5','4',email,'3',hash]);
    await t.test('same purchase is stored once', async () => {
      assert.equal((await record()).rows[0].recorded, true);
      assert.equal((await record()).rows[0].recorded, true);
      assert.equal((await db.query('select count(*)::int as n from bot_payment_test.purchase_inbox')).rows[0].n, 1);
    });
    await t.test('conflicting identity cannot replace evidence', async () => {
      await assert.rejects(record('other@example.invalid'), /identity conflict/);
      await assert.rejects(record('offline@example.invalid', 'b'.repeat(64)), /identity conflict/);
      assert.equal((await db.query('select email from bot_payment_test.purchase_inbox')).rows[0].email,'offline@example.invalid');
    });
    await t.test('real email addresses and invalid identifiers are rejected', async () => {
      await assert.rejects(record('person@example.com'), /check constraint/);
      await assert.rejects(db.query('select bot_payment_test.record_purchase($1,$2,$3,$4,$5)',
        ['bad','4','offline@example.invalid','3','a'.repeat(64)]), /check constraint/);
    });
    await t.test('customer data, changing evidence and creating functions are denied', async () => {
      for (const sql of [
        'select * from public.codes', "insert into public.codes values ('BAD')",
        'select * from public.chat', 'select * from auth.users', 'select * from storage.objects',
        "update bot_payment_test.purchase_inbox set email='other@example.invalid'", 'delete from bot_payment_test.purchase_inbox',
        'truncate bot_payment_test.purchase_inbox', 'create table bot_payment_test.extra(id int)',
        'create table public.extra(id int)',
      ]) await assert.rejects(db.exec(sql), /permission denied/);
    });
    await db.exec('reset role');
    await t.test('hosted verification script passes and rolls back its fixtures', async () => {
      const sql = await readFile(new URL('../supabase/verify-payment-test-zone.sql', import.meta.url), 'utf8');
      const result = await db.exec(sql);
      const row = result.at(-1).rows[0];
      assert.match(row.test_result, /^PASS:/);
      assert.equal(row.test_role_can_login, false);
      assert.equal(Number(row.remaining_test_rows), 0);
    });
    await t.test('anonymous, authenticated and service roles have no test-zone grants', async () => {
      for (const role of ['anon','authenticated','service_role']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.exec('select * from bot_payment_test.purchase_inbox'), /permission denied/);
        await assert.rejects(record(), /permission denied/);
        await db.exec('reset role');
      }
    });
    assert.deepEqual((await db.query('select * from public.codes')).rows,[{code:'DO-NOT-CHANGE'}]);
  } finally { await db.close(); }
});

test('preflight aborts inherited PUBLIC privileges without changing existing grants', async () => {
  for (const extra of [
    'grant select on public.codes to public;',
    'grant select(code) on public.codes to public;',
    'grant create on schema public to public;',
    'create function public.leak() returns text language sql security definer as $$ select code from public.codes limit 1 $$;',
  ]) {
    const db = await fixture(extra);
    try {
      await assert.rejects(db.exec(migration), /Test role/);
      await db.exec('rollback');
      assert.equal((await db.query("select count(*)::int as n from pg_roles where rolname='bot_payment_test_runner'")).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int as n from pg_namespace where nspname='bot_payment_test'")).rows[0].n, 0);
      assert.deepEqual((await db.query('select * from public.codes')).rows,[{code:'DO-NOT-CHANGE'}]);
    } finally { await db.close(); }
  }
});
