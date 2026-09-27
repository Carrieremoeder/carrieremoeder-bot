-- DRAFT, staging database only. Does not alter codes or grant bot access.
begin;
create table public.bot_purchase_inbox (
  order_item_id text primary key check (order_item_id ~ '^[1-9][0-9]{0,15}$'),
  customer_id text not null,
  email text not null,
  price_plan_id text not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);
alter table public.bot_purchase_inbox enable row level security;
revoke all on public.bot_purchase_inbox from public, anon, authenticated;
grant select on public.bot_purchase_inbox to service_role;
create function public.bot_record_purchase(p_order_item_id text,p_customer_id text,
  p_email text,p_price_plan_id text,p_payload_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare existing public.bot_purchase_inbox%rowtype;
begin
  insert into public.bot_purchase_inbox(order_item_id,customer_id,email,price_plan_id,payload_hash)
    values(p_order_item_id,p_customer_id,p_email,p_price_plan_id,p_payload_hash)
    on conflict(order_item_id) do nothing;
  select * into strict existing from public.bot_purchase_inbox where order_item_id = p_order_item_id;
  -- A repeated event is harmless; never reassign a saved purchase to another email.
  if existing.customer_id <> p_customer_id or existing.email <> p_email
    or existing.price_plan_id <> p_price_plan_id or existing.payload_hash <> p_payload_hash then
    raise exception 'Purchase identity conflict';
  end if;
  return true;
end; $$;
revoke all on function public.bot_record_purchase(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bot_record_purchase(text,text,text,text,text) to service_role;
commit;

