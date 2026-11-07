// Cloudflare Worker "bot-dagelijkse-check".
// Roept elke dag de controle van geplande opzeggingen aan in de Bot.
// Instellen in Cloudflare (Workers & Pages → Create → Worker):
//   - Code: dit bestand.
//   - Settings → Variables and secrets: secret BOT_CRON_SECRET (zelfde waarde als in het Pages-project).
//   - Settings → Triggers → Cron: "0 7 * * *" (elke dag om 07:00 UTC).
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  // Handmatig testen: open de Worker-URL met ?key=<BOT_CRON_SECRET>.
  async fetch(request, env) {
    const key = new URL(request.url).searchParams.get('key');
    if (!env.BOT_CRON_SECRET || key !== env.BOT_CRON_SECRET) return new Response('Niet toegestaan', { status: 403 });
    return new Response(await run(env), { headers: { 'Content-Type': 'application/json' } });
  }
};

async function run(env) {
  const response = await fetch('https://bot.meestermasha.nl/api/opzeg-check', {
    method: 'POST',
    headers: { 'x-bot-key': env.BOT_CRON_SECRET }
  });
  const text = await response.text();
  console.log('Dagelijkse check:', response.status, text.slice(0, 200));
  return text;
}
