# Veilige toegang en privacy

## Instellingen op Vercel (server-side)

- `OPENAI_API_KEY` — de API-sleutel van OpenAI (platform.openai.com → API keys).
- `BOT_MODEL` — optioneel. Standaard `gpt-5.6-sol`. Alleen invullen als je een ander OpenAI-model wilt.
- `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` — voor de toegangscontrole (tabel `codes`).
- `BOT_SESSION_SECRET` — minimaal 32 willekeurige tekens.

Zet nooit een service-role-key of API-sleutel in de frontend. `ANTHROPIC_API_KEY` en `BOT_CLAUDE_MODEL` worden niet meer gebruikt en mogen weg.

## Privacy-opzet (dataminimalisatie)

- **Gespreksinhoud wordt nergens opgeslagen.** Gesprekken bestaan alleen in het geopende tabblad en verdwijnen bij uitloggen, automatisch uitloggen of sluiten van het tabblad. Er is geen server-route meer om gesprekken op te slaan.
- **Geen bewaring bij OpenAI voor latere opvraging:** elke aanroep gebruikt `store: false`. Gegevens via de API worden door OpenAI standaard niet gebruikt voor training. Sluit de verwerkersovereenkomst (DPA) van OpenAI af en controleer de actuele bewaartermijnen voor misbruikmonitoring in het OpenAI-dashboard.
- **Geen inhoud in logs:** bij fouten logt de server alleen een statuscode en fouttype, nooit tekst of afbeeldingen.
- **Wat je wél verwerkt:** e-mailadres, toegangscode, wachtwoord-hash en toegangsdatum (tabel `codes` en de gedeelde account-provider).
- Screenshots gaan alleen mee met de AI-aanroep en worden niet opgeslagen.

## Eenmalig: oude gesprekken wissen

De vorige versie bewaarde gesprekken in de Supabase-tabel `chat`. Voer na de uitrol `supabase/remove-chat-history.sql` uit in de SQL Editor van het **bot**-project. Controleer daarna ook je Supabase-back-ups (die verlopen vanzelf volgens je Supabase-plan).

## Testen na uitrol

Ongeldige code; inloggen met e-mail; chat zonder login geeft 401; gesprek voeren met tekst en met een screenshot; uitloggen en opnieuw inloggen (gesprekken zijn dan weg); mobiel. Overweeg vóór brede uitrol een limiet op het aantal aanvragen (rate limit) voor inloggen en AI-gebruik.

Lokale tests: `node --test tests/*.test.js tests/*.test.mjs`.
