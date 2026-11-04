// Koppeling met Systeme.io: daar staan de klanten en hun toegang (tags).
// De Bot bewaart zelf geen klantgegevens en geen wachtwoorden.
const API = 'https://api.systeme.io/api';

export class SystemeError extends Error {
  constructor(message, status = 503, detail = '') { super(message); this.name = 'SystemeError'; this.status = status; this.detail = detail; }
}

function apiKey() {
  const key = process.env.SYSTEME_API_KEY;
  if (!key) throw new SystemeError('Systeme.io-koppeling is nog niet ingesteld.', 503, 'SYSTEME_API_KEY ontbreekt');
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
    throw new SystemeError('Systeme.io is tijdelijk niet bereikbaar.', 503, `${method} ${path.split('?')[0]}: ${error?.name || 'fetch'} ${String(error?.message || '').slice(0, 120)}`);
  }
  if (!response.ok) {
    let body = '';
    try { body = (await response.text()).slice(0, 200); } catch {}
    throw new SystemeError(`Systeme.io gaf status ${response.status}`, response.status, `${method} ${path.split('?')[0]}: ${body}`);
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

function listItems(data) {
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
}

let fieldReady = false;
// Maakt het contactveld voor de inloglink aan als het nog niet bestaat.
export async function ensureLoginField() {
  if (fieldReady) return;
  const slug = loginFieldSlug();
  const fields = listItems(await sio('/contact_fields?limit=100'));
  if (!fields.some(f => f?.slug === slug)) {
    try { await sio('/contact_fields', { method: 'POST', body: { fieldName: 'Bot inloglink', slug } }); }
    catch (error) { if (![409, 422].includes(error.status)) throw error; }
  }
  fieldReady = true;
}

let cachedTagId = null;
// Zoekt de tag voor de inlogmail op en maakt hem aan als hij nog niet bestaat.
export async function ensureLoginTag() {
  if (process.env.BOT_LOGIN_TAG_ID) return Number(process.env.BOT_LOGIN_TAG_ID);
  if (cachedTagId) return cachedTagId;
  const name = String(process.env.BOT_LOGIN_TAG || 'bot-inloglink').trim();
  // Loop alle tags door (per 100), want zoeken op naam werkt niet overal hetzelfde.
  const diag = [];
  const find = async () => {
    let after = '';
    for (let page = 0; page < 30; page++) {
      const data = await sio('/tags?limit=100' + (after ? '&startingAfter=' + encodeURIComponent(after) : ''));
      const items = listItems(data);
      diag.push(`page${page}: keys=${Object.keys(data || {}).join(',')} n=${items.length} more=${data?.hasMore} first=${JSON.stringify(items[0] || null).slice(0, 80)}`);
      const hit = items.find(item => String(item?.name || '').trim().toLowerCase() === name.toLowerCase());
      if (hit) return hit;
      if (!data?.hasMore || !items.length) return null;
      after = items[items.length - 1].id;
    }
    return null;
  };
  let tag = await find();
  if (!tag) {
    try { tag = await sio('/tags', { method: 'POST', body: { name } }); diag.push('post: ' + JSON.stringify(tag).slice(0, 80)); }
    catch (error) { diag.push('post fout: ' + error.status + ' ' + String(error.detail).slice(0, 120)); if (![400, 409, 422].includes(error.status)) throw error; }
    if (!tag?.id) tag = await find();
  }
  if (!tag?.id) throw new SystemeError('De tag voor de inlogmail kon niet worden aangemaakt.', 503, 'diag: ' + diag.join(' | ').slice(0, 280));
  cachedTagId = Number(tag.id);
  return cachedTagId;
}

// Zet de inloglink in een veld bij de klant en zet de tag (opnieuw) aan.
// Een automatisering in Systeme.io ("tag toegevoegd") stuurt daarna de inlogmail met die link.
export async function sendLoginLink(contact, link) {
  await ensureLoginField();
  await sio('/contacts/' + encodeURIComponent(contact.id), {
    method: 'PATCH', contentType: 'application/merge-patch+json',
    body: { fields: [{ slug: loginFieldSlug(), value: link }] }
  });
  const tagId = await ensureLoginTag();
  try { await sio(`/contacts/${encodeURIComponent(contact.id)}/tags/${tagId}`, { method: 'DELETE' }); }
  catch (error) { if (![404, 422].includes(error.status)) throw error; }
  await sio(`/contacts/${encodeURIComponent(contact.id)}/tags`, { method: 'POST', body: { tagId } });
}
