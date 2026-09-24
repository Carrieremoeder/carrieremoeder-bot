# Pilot: veilige toegang vóór gebruik

Dit is een **bestaand prototype** en vervangt de GPT nog niet. De nieuwe webapp is gepubliceerd op https://bot.carrieremoeder.com (overdracht 24 september 2026); dit is nog geen vrijgave voor klanten. De actuele deployment en AI-werking moeten opnieuw worden gecontroleerd.

1. Stel op Vercel server-side in: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_MODEL` (standaard `gpt-6-sol`), `BOT_SESSION_SECRET` (minimaal 32 willekeurige tekens). Zet geen service-role-key in de frontend.
2. Controleer Supabase-tabellen `codes` (`code`, `actief`, `wachtwoord`) en `chat` (`code`, `data`, `updated_at`). Maak een back-up vóór wijzigingen. Gebruik voldoende willekeurige eenmalige toegangscodes; de eerste gebruiker die een code heeft kan anders een wachtwoord instellen.
3. Sluit publieke toegang via de Supabase anon-sleutel tot `codes` en `chat` af. Controleer RLS en policies in Supabase. **Doe dit alleen samen met de nieuwe serverroutes**; anders werkt het oude prototype niet meer. De SQL-migratie hangt af van de bestaande policies en is daarom bewust niet blind uitgevoerd.
4. Test: ongeldige code; eerste wachtwoord; bestaande wachtwoorden (worden na succesvolle login gehasht); chat zonder cookie geeft 401; andere code kan geen gesprek ophalen; verlopen sessie; gesprek opslaan en verwijderen; screenshot upload; mobiel. Neem een rate limit op bij de edge of API vóór brede uitrol, vooral voor inloggen en AI-gebruik.
5. De prototypecode bewaart gesprekken in Supabase; nieuwe screenshots worden alleen voor de AI-aanroep verzonden en worden bij opslaan omgezet naar een tekstverwijzing. Oude prototypegesprekken kunnen nog base64-afbeeldingen bevatten; inventariseer en ruim die op. Stel een bewaartermijn, verwijderfunctie en back-upbeleid vast vóór klantenmigratie. Zet geen productielink in betaalmails tot dit is geregeld.

## Controle opslagroute — 24 september 2026

Gesprekken worden vóór verzending naar de opslagroute én op de server tot expliciete tekstvelden teruggebracht. Afbeeldingen, previews en onbekende metadata worden niet als aparte velden opgeslagen. De grens van 300.000 tekens blijft gelden voor de opslagaanvraag. Dit verandert niets aan de limieten voor het AI-verzoek zelf. Bestaande databasegegevens worden niet automatisch opgeschoond; inventariseer die apart na een back-up.

Gerichte regressietests: `node --test tests/conversationStorage.test.js`. Die testen gebruiken fictieve gegevens en een nagebootste database; zij bewijzen niet dat de live Supabase-policies juist zijn.

Nog open: live accountisolatie met twee testaccounts, rate limiting, verlopen toegang, wachtwoordherstel, gelijktijdige wijzigingen, privacy/retentie en inhoudelijke AI-tests. Volgens de overdracht blokkeerde ontbrekend API-tegoed de AI; saldo en organisatie zijn tijdens deze codewijziging niet gecontroleerd.

## Live controle Supabase — 24 september 2026

In de ingelogde beheeromgeving van project `carrieremoeder-bot` is op Database > Policies vastgesteld dat RLS voor zowel `public.chat` als `public.codes` ingeschakeld is (knop 'Disable RLS') en dat beide tabellen geen policies hebben. De interface vermeldt dat de Data API daarom geen rijen teruggeeft voor toegang waarop RLS van toepassing is. Er zijn geen instellingen gewijzigd en geen klantgesprekken geopend.

Dit controleert de tabelpolicies, niet alle mogelijke toegangspaden: service-role-toegang omzeilt RLS en moet server-side blijven. Rechtstreekse anon-aanvragen, functies/views, grants en accountisolatie met twee testaccounts zijn nog niet getest. Het projectoverzicht vermeldde 'No backups'; herstelbaarheid moet afzonderlijk worden gecontroleerd voordat gegevens worden gewijzigd. De overzichtsstatus was 'Unhealthy', terwijl recente aanvragen een succespercentage van 100% hadden; de oorzaak van die status is nog niet vastgesteld.
