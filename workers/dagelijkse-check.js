// Cloudflare Worker "bot-dagelijkse-check".
// Roept elke dag de controle van geplande opzeggingen aan in de Bot.
// Instellen in Cloudflare (Workers & Pages → Create → Worker):
//   - Code: dit bestand.
//   - Settings → Triggers → Cron: "0 7 * * *" (elke dag om 07:00 UTC).
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run());
  },
  // Handmatig testen: open de Worker-URL in de browser.
  async fetch() {
    return new Response(await run(), { headers: { 'Content-Type': 'application/json' } });
  }
};

async function run() {
  const response = await fetch('https://bot.meestermasha.nl/api/opzeg-check', {
    method: 'POST'
  });
  const text = await response.text();
  console.log('Dagelijkse check:', response.status, text.slice(0, 200));
  return text;
}
