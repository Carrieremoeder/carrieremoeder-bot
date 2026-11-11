# Hosting, inloggen en privacy

## Hosting: Cloudflare Pages

- Build command: `npm run build` · Build output directory: `dist`
- Serverroutes: `functions/api/[[route]].js` (koppeling naar `api/chat.js` en `api/session.js`).
- `wrangler.toml` bevat de niet-geheime instellingen onder `[vars]`. Gewone tekstvariabelen uit het dashboard worden door Cloudflare genegeerd zolang er een `wrangler.toml` is.

## Geheime sleutels (Cloudflare → Settings → Variables and secrets, type Secret)

- `AZURE_OPENAI_API_KEY`: sleutel van Microsoft Azure OpenAI (Foundry → project carrieremoeder-7227 → Start → API-sleutel). Is deze ingesteld, dan loopt de AI-verwerking via de EU Data Zone (resource in Zweden, implementatie `gpt-5.6-luna`, type Data Zone Standard).
- `OPENAI_API_KEY`: API-sleutel van OpenAI. Wordt alleen gebruikt als vangnet bij een storing, time-out of drukte bij Azure, of als er (nog) geen Azure-sleutel is. Bij een weigering door het inhoudsfilter van Azure gaat het bericht níet naar OpenAI; de gebruiker krijgt dan een rustige melding met 112 en Veilig Thuis.
- Optioneel: `AZURE_OPENAI_ENDPOINT` (standaard `https://carrieremoeder-7227-resource.openai.azure.com/openai/v1`) en `AZURE_OPENAI_DEPLOYMENT` (standaard `gpt-5.6-luna`).
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

- Opzegformulier (meestermasha.nl/opzeggen-bot) → workflow in Systeme.io ("Ingeschreven via funnelformulier", Opzeggen Bot) → webhook naar `https://bot.meestermasha.nl/api/opzeggen`.
- De Bot zoekt het abonnement zelf op:
  - na het eerste jaar: direct opzeggen per einde van de lopende betaalperiode (`WhenBillingPeriodEnds`);
  - in het eerste jaar: contactveld **Bot opzegging** = "gepland: opzeggen op JJJJ-MM-DD …". De dagelijkse controle loopt alle contacten met een toegangstag langs en zegt op zodra de laatste maand van het eerste jaar begint (dag na de twaalfde betaling), zodat het abonnement precies na twaalf maanden stopt. Geen extra tag: het Startup-plan heeft maar 10 tags.
- Lukt het niet: tag `bot-opzegging-handmatig` (automatisering in Systeme.io mailt Masha; de reden staat in het veld Bot opzegging). Elke opzegging geeft Masha daarnaast de bestaande meldingsmail.
- Dagelijkse controle: Cloudflare Worker `bot-dagelijkse-check` (code in `workers/dagelijkse-check.js`, cron `0 7 * * *`) roept `POST /api/opzeg-check` aan.
- Geen geheime sleutel: het opzegformulier is openbaar (een sleutel voegt niets toe) en de dagelijkse controle zegt alleen op wat al gepland staat.

## Automatisch herroepen (binnen 14 dagen)

- Herroepingsformulier op meestermasha.nl/herroepen-bot → Systeme.io stuurt direct de wettelijke bevestiging én (workflow "Stuur webhook") een seintje naar `https://bot.meestermasha.nl/api/herroepen`.
- De Bot zoekt zelf het abonnement op. Minder dan 14 dagen oud → de klant krijgt via de bestaande inlogmail (veld `bot_inloglink` + tag `bot-inloglink`) een persoonlijke, ondertekende link (7 dagen geldig). Zo kan niemand andermans abonnement stopzetten.
- Klikt de klant niet, dan verwerkt de dagelijkse controle (/api/opzeg-check) de herroeping na 3 dagen zelf (veld Bot opzegging: "herroeping ontvangen … automatisch verwerken vanaf …"). Het bedrag wordt berekend tot het moment van het formulier.
- Veld `bot_herroeping` bevat de uitkomst in woorden voor de klant; de workflow stuurt 4 dagen na het formulier de afrondingsmail met {bot_herroeping}.
- De link opent een bevestigingspagina met het terug te betalen bedrag. Na "Bevestigen": abonnement direct stoppen in Systeme.io, veld Bot status = "herroepen per …" (geen toegang meer), terugbetaling via Mollie naar rato van de begonnen dagen.
- De Mollie-betaling wordt gevonden via de metadata `sio_subscription_id` die Systeme.io meegeeft. Een betaling die al (deels) is teruggestort, wordt nooit nog eens teruggestort; nooit meer dan betaald.
- Geheim in Cloudflare: `MOLLIE_API_KEY` (live-sleutel uit Mollie → Developers → API-sleutels). Zonder sleutel: melding aan Masha, zij betaalt zelf terug.
- Lukt iets niet (bedenktijd voorbij, betaling niet gevonden, stoppen of terugbetalen mislukt): veld Bot opzegging krijgt "handmatig regelen (herroeping: …)" en de tag `bot-opzegging-handmatig` mailt Masha.
- Opgezegd maar betaalde periode loopt nog: de klant houdt toegang tot het einde van die periode.
