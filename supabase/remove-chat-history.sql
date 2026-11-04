-- Eenmalig uitvoeren in het BOT-project (Supabase → SQL Editor), na de uitrol van de versie
-- die geen gesprekken meer opslaat. Wist alle eerder opgeslagen gesprekken definitief.
-- De tabel `codes` (toegang en accounts) blijft ongewijzigd.
begin;
delete from public.chat;
commit;
