-- Additive migration: existing codes and conversations retain their identifiers.
begin;
alter table public.codes add column if not exists auth_user_id uuid;
create unique index if not exists bot_codes_auth_user_id_unique
  on public.codes(auth_user_id) where auth_user_id is not null;
create index if not exists bot_codes_email_lower_idx on public.codes(lower(email));
commit;

