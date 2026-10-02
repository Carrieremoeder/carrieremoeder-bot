-- DRAFT: apply only after the provider worker and purchase mapping are ready.
begin;
create table if not exists public.bot_contracts (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.codes(code),
  plan_version text not null check (plan_version = 'bot-13-monthly-12-month-minimum-v1'),
  starts_on date not null,
  paid_until date,
  cancel_requested_on date,
  ends_on date,
  provider_sync text not null default 'ready' check (provider_sync in ('ready','pending','confirmed','failed')),
  mollie_customer_id text not null,
  mollie_subscription_id text not null unique,
  systeme_order_item_id bigint not null unique,
  accepted_terms_version text not null,
  accepted_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((cancel_requested_on is null) = (ends_on is null)),
  check (cancel_requested_on is null or cancel_requested_on >= starts_on),
  check (ends_on is null or ends_on >= cancel_requested_on)
);
create unique index if not exists bot_contracts_one_open_per_code
  on public.bot_contracts(code) where closed_at is null;
alter table public.bot_contracts enable row level security;
revoke all on public.bot_contracts from anon, authenticated;
grant select, insert, update on public.bot_contracts to service_role;
commit;

