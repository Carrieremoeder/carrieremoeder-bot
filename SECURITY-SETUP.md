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
3. Zo ja: de Bot zet een ondertekende inloglink (15 minuten geldig) in het contactveld `bot_inloglink` en zet de tag `bot-inloglink` opnieuw op het contact.
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

Inloglink aanvragen met een klant-e-mailadres (mail komt binnen, link werkt), met een e-mailadres zonder tag (geen mail), verlopen link (na 15 minuten), uitloggen, gesprek voeren, downloaden en weer inladen, mobiel.

Lokale tests: `node --test tests/*.test.js tests/*.test.mjs`.
