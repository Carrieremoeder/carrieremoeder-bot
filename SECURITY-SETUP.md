# Pilot: veilige toegang vóór gebruik

Dit is een **bestaand prototype** en vervangt de GPT nog niet. Er is geen productie-uitrol gedaan.

1. Stel op Vercel server-side in: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_CLAUDE_MODEL` (standaard `claude-sonnet-4-6`), `BOT_SESSION_SECRET` (minimaal 32 willekeurige tekens). Zet geen service-role-key in de frontend.
2. Controleer Supabase-tabellen `codes` (`code`, `actief`, `wachtwoord`) en `chat` (`code`, `data`, `updated_at`). Maak een back-up vóór wijzigingen. Gebruik voldoende willekeurige eenmalige toegangscodes; de eerste gebruiker die een code heeft kan anders een wachtwoord instellen.
3. Sluit publieke toegang via de Supabase anon-sleutel tot `codes` en `chat` af. Controleer RLS en policies in Supabase. **Doe dit alleen samen met de nieuwe serverroutes**; anders werkt het oude prototype niet meer. De SQL-migratie hangt af van de bestaande policies en is daarom bewust niet blind uitgevoerd.
4. Test: ongeldige code; eerste wachtwoord; bestaande wachtwoorden (worden na succesvolle login gehasht); chat zonder cookie geeft 401; andere code kan geen gesprek ophalen; verlopen sessie; gesprek opslaan en verwijderen; screenshot upload; mobiel. Neem een rate limit op bij de edge of API vóór brede uitrol, vooral voor inloggen en AI-gebruik.
5. De prototypecode bewaart gesprekken in Supabase; nieuwe screenshots worden alleen voor de AI-aanroep verzonden en worden bij opslaan omgezet naar een tekstverwijzing. Oude prototypegesprekken kunnen nog base64-afbeeldingen bevatten; inventariseer en ruim die op. Stel een bewaartermijn, verwijderfunctie en back-upbeleid vast vóór klantenmigratie. Zet geen productielink in betaalmails tot dit is geregeld.

De coach gebruikt Anthropic Messages. Een bestaande `BOT_MODEL` voor OpenAI wordt bewust genegeerd. Controleer de Claude-aansluiting met een neutraal testbericht na uitrol. Lokale contracttests: `node --test tests/claude.test.js`.
