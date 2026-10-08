# Lokale haalbaarheidsproef
Deze zelfstandige proef gebruikt geen bestaande chat-, sessie- of Supabase-routes. Alleen tekst wordt aangenomen; geen upload, afbeelding of cloud fallback. Standaard staan gesprekken alleen in geheugen. Bewaren op het apparaat is opt-in en niet versleuteld. Dit is geen juridische garantie en geen productieversie.

## Start
Vanuit local-prototype: npm install, npm test, npm run build, npm run dev.
Host alleen de gebouwde dist-map voor telefoontests via HTTPS. Geen api-map meesturen. Geen analytics of error-reporting toevoegen. Geen bestaande service worker registreren. Eerste download vereist internet; de app zelf is nog niet offline installeerbaar.

## Gegevensstromen
HTML/JS komen van de host (IP/verzoekmetadata). WebLLM haalt modelgewichten bij de modelhost en WebAssembly bij de runtimehost (IP/verzoekmetadata). Prompts worden rechtstreeks aan de in-browser engine gegeven, nooit aan een HTTP-chatroute. Geen login/betaalgegevens in deze proef. Een abonnement is nog niet geïmplementeerd.
Het model is een klein Qwen2.5-model om haalbaarheid te onderzoeken, geen equivalent van Claude. Coachinstructies zijn dezelfde als in de bestaande bot. Het contextvenster bevat een begrensd recent deel van het gesprek.

## Vereiste acceptatie vóór klantgebruik
- Test fysiek op recente en oudere iPhone/Android: WebGPU, laadtijd, geheugen, batterij, Nederlands, instructies en coachingkwaliteit.
- Controleer het netwerk vanaf de invoer van een fictieve unieke zin: geen prompt/antwoord in requests, querystrings, logging of analytics. Test ook fouten, opnieuw laden en bewaren.
- Test screenshot plakken/slepen: geweigerd. Test opslaan, herladen, wissen en opslagweigering.
- Test acute veiligheid, praktische urgentie, grenzen en juridische vragen. Geen automatisch advies om bij gevaar te wachten.
- Bepaal hosting, licenties, modeldownload, updates en juridische rol afzonderlijk.
Build/unit-tests bewijzen geen gedrag van een model of telefoon. Bij onvoldoende kwaliteit/ondersteuning stopt de lokale route zonder online fallback.
