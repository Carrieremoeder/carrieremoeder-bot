# Hosting, inloggen en privacy

## Hosting: Cloudflare Pages

- Build command: `npm run build` · Build output directory: `dist`
- Serverroutes: `functions/api/[[route]].js` (koppeling naar `api/chat.js` en `api/session.js`).
- `wrangler.toml` bevat de niet-geheime instellingen onder `[vars]`. Gewone tekstvariabelen uit het dashboard worden door Cloudflare genegeerd zolang er een `wrangler.toml` is.

## Geheime sleutels (Cloudflare → Settings → Variables and secrets, type Secret)

- `OPENAI_API_KEY`: API-sleutel van OpenAI.
- `SYSTEME_API_KEY`: API-sleutel van Systeme.io (Profiel → Public API keys).
- `BOT_SESSION_SECRET`: minimaal 32 willekeurige tekens. Wijzigen logt iedereen uit en maakt openstaande inloglinks ongeldig.

## Inloggen via Systeme.io (zonder wachtwoorden)

1. De klant vult zijn e-mailadres in.
2. De Bot zoekt het contact op in Systeme.io en controleert of het een toegangstag heeft (`BOT_ACCESS_TAGS`, standaard `Always In Control BOT` en `Always In Control Bot + Training`).
3. Zo ja: de Bot zet een ondertekende inloglink (24 uur geldig; bevat ook de keuze "blijf ingelogd") in het contactveld `bot_inloglink` en zet de tag `bot-inloglink` opnieuw op het contact.
4. Een automatisering in Systeme.io (trigger: tag `bot-inloglink` toegevoegd) mailt de link.
5. De klant klikt op de link; de Bot controleert de tag opnieuw en start een sessie van 30 minuten.

Er worden nergens wachtwoorden aangemaakt of opgeslagen. Het antwoord bij het aanvragen is altijd hetzelfde, zodat niet te achterhalen is wie klant is. Binnen een minuut opnieuw aanvragen stuurt geen tweede mail.

Toegang intrekken: haal de toegangstag weg in Systeme.io. Een al lopende sessie verloopt daarna binnen 30 minuten zonder activiteit.

Nieuwe toegangstag (bijvoorbeeld voor het abonnement): voeg de naam toe aan `BOT_ACCESS_TAGS` in `wrangler.toml`.

## Privacy-opzet (dataminimalisatie)

- Gespreksinhoud wordt nergens opgeslagen. Gebruikers kunnen een gesprek zelf downloaden en later weer inladen; dat gebeurt alleen in de browser.
- OpenAI: elke aanroep met `store: false`. Sluit de verwerkersovereenkomst (DPA) van OpenAI af.
- Geen inhoud in logs: alleen statuscode en fouttype.
- Alleen tekst, geen afbeeldingen.
- De Bot heeft geen eigen database. Klantgegevens staan alleen in Systeme.io. Verwerkers: Cloudflare (hosting), OpenAI (AI), Systeme.io (klanten en inlogmail).

## Testen na uitrol

Inloglink aanvragen met een klant-e-mailadres (mail komt binnen, link werkt), met een e-mailadres zonder tag (geen mail), verlopen link (na 24 uur), "blijf ingelogd" (30 dagen, vervalt direct als de toegangstag weg is), uitloggen, gesprek voeren, downloaden en weer inladen, mobiel.

Lokale tests: `node --test tests/*.test.js tests/*.test.mjs`.

## Abonnement en status

- Iedereen met een toegangstag houdt die tag. Het contactveld **Bot status** bepaalt of de Bot gebruikt mag worden: leeg (lifetime) of "abonnee sinds …" = toegang, "gestopt per …" = geen toegang.
- Workflow in Systeme.io ("Nieuwe verkoop", "Verkoop geannuleerd", "Betaling van abonnement mislukt") stuurt een webhook naar `https://bot.meestermasha.nl/api/sync`.
- De Bot vertrouwt de webhook niet: hij zoekt het contact en de abonnementen zelf op in Systeme.io en zet daarna het veld. Bij inloggen en bij "blijf ingelogd" wordt de status van abonnees opnieuw opgehaald.

## Automatisch opzeggen

- Opzegformulier (meestermasha.nl/opzeggen-bot) → workflow in Systeme.io ("Ingeschreven via funnelformulier", Opzeggen Bot) → webhook naar `https://bot.meestermasha.nl/api/opzeggen?key=<BOT_CRON_SECRET>`.
- De Bot zoekt het abonnement zelf op:
  - na het eerste jaar: direct opzeggen per einde van de lopende betaalperiode (`WhenBillingPeriodEnds`);
  - in het eerste jaar: contactveld **Bot opzegging** = "gepland: opzeggen op JJJJ-MM-DD …" en tag `bot-opzegging-gepland`. De dagelijkse controle zegt op zodra de laatste maand van het eerste jaar begint (dag na de twaalfde betaling), zodat het abonnement precies na twaalf maanden stopt.
- Tags voor mails aan Masha (automatiseringen in Systeme.io): `bot-opzegging-verwerkt` (ter info) en `bot-opzegging-handmatig` (zelf regelen; reden staat in het veld Bot opzegging).
- Dagelijkse controle: Cloudflare Worker `bot-dagelijkse-check` (code in `workers/dagelijkse-check.js`, cron `0 7 * * *`) roept `POST /api/opzeg-check` aan met header `x-bot-key`.
- Secret `BOT_CRON_SECRET` (minimaal 24 tekens) in het Pages-project én in de Worker.
- Herroepen blijft handwerk (terugbetalen via Mollie).
- Opgezegd maar betaalde periode loopt nog: de klant houdt toegang tot het einde van die periode.
