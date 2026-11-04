// Koppeling met Systeme.io: daar staan de klanten en hun toegang (tags).
// De Bot bewaart zelf geen klantgegevens en geen wachtwoorden.
const API = 'https://api.systeme.io/api';

export class SystemeError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

function apiKey() {
  const key = process.env.SYSTEME_API_KEY;
  if (!key) throw new SystemeError('Systeme.io-koppeling is nog niet ingesteld.');
  return key;
}

export async function sio(path, { method = 'GET', body, contentType = 'application/json' } = {}) {
  let response;
  try {
    response = await fetch(API + path, {
      method,
      headers: { 'X-API-Key': apiKey(), Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': contentType } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    if (error instanceof SystemeError) throw error;
    throw new SystemeError('Systeme.io is tijdelijk niet bereikbaar.');
  }
  if (!response.ok) {
    const error = new SystemeError(`Systeme.io gaf status ${response.status}`, response.status);
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// Tags die toegang geven, bijvoorbeeld "bot" en "training + bot" (hoofdletters maken niet uit).
export function accessTags() {
  return String(process.env.BOT_ACCESS_TAGS || 'bot,training + bot')
    .split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
}

export function hasAccess(contact) {
  const allowed = accessTags();
  return Array.isArray(contact?.tags) && contact.tags.some(tag => allowed.includes(String(tag?.name || '').trim().toLowerCase()));
}

export async function findContact(email) {
  const data = await sio('/contacts?email=' + encodeURIComponent(email));
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items.find(contact => String(contact?.email || '').trim().toLowerCase() === email) || null;
}

export async function getContact(id) {
  return sio('/contacts/' + encodeURIComponent(id));
}

export function loginFieldSlug() {
  return process.env.BOT_LOGIN_FIELD || 'bot_inloglink';
}

export function currentLoginField(contact) {
  const field = (contact?.fields || []).find(f => (f?.slug || f?.fieldName) === loginFieldSlug());
  return typeof field?.value === 'string' ? field.value : '';
}

async function loginTagId() {
  if (process.env.BOT_LOGIN_TAG_ID) return Number(process.env.BOT_LOGIN_TAG_ID);
  const name = String(process.env.BOT_LOGIN_TAG || 'bot-inloglink').trim().toLowerCase();
  const data = await sio('/tags?query=' + encodeURIComponent(name));
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const tag = items.find(item => String(item?.name || '').trim().toLowerCase() === name);
  if (!tag?.id) throw new SystemeError('De tag voor de inlogmail bestaat nog niet in Systeme.io.');
  return Number(tag.id);
}

// Zet de inloglink in een veld bij de klant en zet de tag (opnieuw) aan.
// Een automatisering in Systeme.io ("tag toegevoegd") stuurt daarna de inlogmail met die link.
export async function sendLoginLink(contact, link) {
  await sio('/contacts/' + encodeURIComponent(contact.id), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: loginFieldSlug(), value: link }] }
  });
  const tagId = await loginTagId();
  try { await sio(`/contacts/${encodeURIComponent(contact.id)}/tags/${tagId}`, { method: 'DELETE' }); }
  catch (error) { if (![404, 422].includes(error.status)) throw error; }
  await sio(`/contacts/${encodeURIComponent(contact.id)}/tags`, { method: 'POST', body: { tagId } });
}
