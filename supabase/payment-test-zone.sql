-- Test-only zone in the existing bot project. No login, API exposure or app changes.
-- Intentionally fails if the role/schema already exists: inspect rather than overwrite.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create role bot_payment_test_runner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

-- Grants to PUBLIC are inherited even by NOINHERIT roles. Fail rather than
-- changing any existing application permissions to make the audit pass.
do $$
begin
  if exists (
    select 1 from pg_namespace n
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
      and has_schema_privilege('bot_payment_test_runner', n.oid, 'CREATE')
  ) then raise exception 'Test role can create objects in an existing schema'; end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
      and has_schema_privilege('bot_payment_test_runner',n.oid,'USAGE')
      and ((c.relkind in ('r','p','v','m','f') and (
        has_table_privilege('bot_payment_test_runner',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege('bot_payment_test_runner',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
        or (c.relkind='S' and has_sequence_privilege('bot_payment_test_runner',c.oid,'USAGE,SELECT,UPDATE')))
  ) then raise exception 'Test role has existing data privileges'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
      and (n.nspname in ('public','auth','storage') or p.prosecdef)
      and has_schema_privilege('bot_payment_test_runner',n.oid,'USAGE')
      and has_function_privilege('bot_payment_test_runner',p.oid,'EXECUTE')
  ) then raise exception 'Test role can invoke an existing application function'; end if;
end $$;

create schema bot_payment_test;
revoke all on schema bot_payment_test from public, anon, authenticated, service_role;
grant usage on schema bot_payment_test to bot_payment_test_runner;
create table bot_payment_test.purchase_inbox (
  order_item_id text primary key check (order_item_id ~ '^[1-9][0-9]{0,15}$'),
  customer_id text not null check (customer_id ~ '^[1-9][0-9]{0,15}$'),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$'),
  price_plan_id text not null check (price_plan_id ~ '^[1-9][0-9]{0,15}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);
alter table bot_payment_test.purchase_inbox enable row level security;
revoke all on bot_payment_test.purchase_inbox from public, anon, authenticated, service_role;
grant select, insert on bot_payment_test.purchase_inbox to bot_payment_test_runner;
create policy test_reader on bot_payment_test.purchase_inbox for select to bot_payment_test_runner using (true);
create policy test_writer on bot_payment_test.purchase_inbox for insert to bot_payment_test_runner with check (true);

create function bot_payment_test.record_purchase(p_order_item_id text,p_customer_id text,
  p_email text,p_price_plan_id text,p_payload_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare existing bot_payment_test.purchase_inbox%rowtype;
begin
  insert into bot_payment_test.purchase_inbox(order_item_id,customer_id,email,price_plan_id,payload_hash)
    values(p_order_item_id,p_customer_id,p_email,p_price_plan_id,p_payload_hash)
    on conflict(order_item_id) do nothing;
  select * into strict existing from bot_payment_test.purchase_inbox where order_item_id=p_order_item_id;
  if existing.customer_id <> p_customer_id or existing.email <> p_email
    or existing.price_plan_id <> p_price_plan_id or existing.payload_hash <> p_payload_hash then
    raise exception 'Purchase identity conflict';
  end if;
  return true;
end $$;
revoke all on function bot_payment_test.record_purchase(text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function bot_payment_test.record_purchase(text,text,text,text,text) to bot_payment_test_runner;
commit;
