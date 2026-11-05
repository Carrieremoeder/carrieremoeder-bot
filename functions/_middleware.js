// De bot woont op bot.meestermasha.nl. Wie nog het oude adres gebruikt
// (bot.carrieremoeder.com), wordt automatisch doorgestuurd, inclusief inloglinks.
const OLD_HOSTS = new Set(['bot.carrieremoeder.com']);
const NEW_ORIGIN = 'https://bot.meestermasha.nl';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD_HOSTS.has(url.hostname)) {
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
  }
  return next();
}
