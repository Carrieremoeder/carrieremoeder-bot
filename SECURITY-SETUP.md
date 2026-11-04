# Hosting, veilige toegang en privacy

## Hosting: Cloudflare Pages

De app draait op Cloudflare Pages (gratis abonnement; zakelijk gebruik is toegestaan).

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- De serverroutes staan in `functions/api/[[route]].js` (koppeling naar `api/chat.js` en `api/session.js`).
- `wrangler.toml` zet de Node-compatibiliteit aan (`nodejs_compat`), nodig voor de wachtwoord-hashing.

## Instellingen in Cloudflare (Settings → Variables and Secrets)

Zet deze als **Secret** (versleuteld):

- `OPENAI_API_KEY`: de API-sleutel van OpenAI (platform.openai.com → API keys).
- `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`: voor de toegangscontrole (tabel `codes`) in het bot-project.
- `BOT_SESSION_SECRET`: minimaal 32 willekeurige tekens.

Optioneel:

- `BOT_MODEL`: standaard `gpt-5.6-sol`.
- `OPENAI_BASE_URL`: bijvoorbeeld `https://eu.api.openai.com` voor EU-dataresidentie, alleen als je OpenAI-project dat ondersteunt.

Zet nooit een service-role-key of API-sleutel in de frontend.

## Privacy-opzet (dataminimalisatie)

- **Gespreksinhoud wordt nergens opgeslagen.** Gesprekken bestaan alleen in het geopende tabblad en verdwijnen bij uitloggen, automatisch uitloggen of sluiten van het tabblad. Er is geen server-route meer om gesprekken op te slaan.
- **OpenAI bewaart het antwoord niet voor latere opvraging:** elke aanroep gebruikt `store: false`. Gegevens via de API worden door OpenAI standaard niet gebruikt voor training. Sluit de verwerkersovereenkomst (DPA) van OpenAI af en controleer de actuele bewaartermijnen voor misbruikmonitoring in het OpenAI-dashboard.
- **Geen inhoud in logs:** bij fouten logt de server alleen een statuscode en fouttype, nooit tekst of afbeeldingen.
- **Wat je wél verwerkt:** e-mailadres, toegangscode, wachtwoord-hash en toegangsdatum (tabel `codes` en de gedeelde account-provider).
- Afbeeldingen (screenshots) worden niet geaccepteerd: alleen tekst, zodat klanten zelf namen en details kunnen weghalen.
- Cloudflare is verwerker voor de hosting. Neem Cloudflare op in je verwerkersoverzicht.

## Eenmalig: oude gesprekken wissen

De vorige versie bewaarde gesprekken in de Supabase-tabel `chat`. Voer na de uitrol `supabase/remove-chat-history.sql` uit in de SQL Editor van het **bot**-project.

## Testen na uitrol

Test deze punten:

- inloggen met een ongeldige code;
- inloggen met e-mail;
- chatten zonder login (geeft 401);
- een gesprek met tekst;
- uitloggen en opnieuw inloggen (de gesprekken zijn dan weg);
- gebruik op mobiel.

Overweeg vóór brede uitrol een limiet op het aantal aanvragen (rate limit) voor inloggen en AI-gebruik.

Lokale tests: `node --test tests/*.test.js tests/*.test.mjs`.
