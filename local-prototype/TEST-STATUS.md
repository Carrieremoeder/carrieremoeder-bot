# Teststatus 8 oktober 2026

Geslaagd: productiebuild; zes automatische tests voor uitsluitend tekst, ongeldig opgeslagen materiaal, opt-in opslag/wissen, maximale opslag en begrensde context. Applicatiecode bevat geen HTTP-chat-, account-, analytics- of loggingroute. Dit is een broncodecontrole, geen meting van het netwerkgedrag van WebLLM.

Een fout gevonden en hersteld: bewaren kon meer dan 100 berichten accepteren terwijl teruglezen maximaal 100 accepteert. Beide gebruiken nu dezelfde grens.

Niet uitgevoerd: browser- en fysieke telefoontests, werkende modelinferentie, coachingkwaliteit, netwerkcontrole tijdens inferentie. De testomgeving heeft geen Chromium; installatie leverde ongeldige downloadarchieven. De browsercheck is voorbereid maar niet geslaagd verklaard.

## Zelf proberen zodra er een aparte HTTPS-testpagina is

1. Open op je telefoon, bij voorkeur op wifi. Tik op Lokale AI laden. Noteer telefoon/browser, laadtijd en eventuele fout.
2. Gebruik als fictief voorbeeld: “Mijn ex schrijft: Jij maakt overal een probleem van. Vrijdag haal ik de kinderen niet op. Wat antwoord ik?” Controleer rustig Nederlands, aandacht voor emoties en een bruikbare korte reactie.
3. Plak/sleep een screenshot: moet worden geweigerd. Tekst moet wel kunnen.
4. Zet bewaren aan, sluit/heropen, controleer teruglezen. Wis het gesprek en heropen opnieuw: het moet verdwenen zijn.
5. Een technisch onderzoek moet controleren dat berichten/antwoorden niet in netwerkverzoeken verschijnen, ook bij fouten. Nog geen echte persoonsgegevens gebruiken.

De GitHub-PR is code, nog geen testpagina. De bestaande Vercel-app blijft de oorspronkelijke cloudbot. Voor de proef moet uitsluitend local-prototype/dist op een afzonderlijke HTTPS-host worden gezet.
