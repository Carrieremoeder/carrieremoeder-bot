-- Dagteller per gebruiker voor het sterke AI-model (alleen aantallen, geen gespreksinhoud).
-- Additief: raakt bestaande tabellen niet. Uitvoeren in het BOT-project (SQL Editor).
begin;

create table if not exists public.bot_usage (
  code text not null,
  day date not null,
  count integer not null default 0,
  primary key (code, day)
);

-- Alleen de server (service role) mag hierbij; geen policies = geen toegang voor anon/ingelogde gebruikers.
alter table public.bot_usage enable row level security;

-- Verhoogt de teller voor vandaag (Nederlandse tijd) en geeft het nieuwe aantal terug.
-- Ruimt tellers ouder dan 2 dagen op, zodat er niets langer bewaard blijft dan nodig.
create or replace function public.bot_increment_usage(p_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/Amsterdam')::date;
  new_count integer;
begin
  insert into public.bot_usage (code, day, count)
  values (p_code, today, 1)
  on conflict (code, day) do update set count = public.bot_usage.count + 1
  returning count into new_count;

  delete from public.bot_usage where day < today - 2;

  return new_count;
end;
$$;

revoke all on function public.bot_increment_usage(text) from public, anon, authenticated;
grant execute on function public.bot_increment_usage(text) to service_role;

commit;
