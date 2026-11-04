export const IDLE_MS = 30 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export const SESSION_KEY = 'cm-bot-tab-session-v1';
export const REMEMBER_KEY = 'cm-bot-remember-v1';
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

// Twee soorten sessies:
// - gewoon: alleen dit tabblad, uitgelogd na 30 minuten zonder activiteit;
// - "blijf ingelogd": 30 dagen op dit apparaat. Alleen de toegang wordt onthouden, nooit de gesprekken.
export function createTabSession({ storage, persistentStorage, navigationType, now = Date.now } = {}) {
  let session = null;
  const listeners = new Set();
  function save() {
    try {
      if (session && !session.persistent) storage?.setItem(SESSION_KEY, JSON.stringify(session));
      else storage?.removeItem(SESSION_KEY);
    } catch { /* Restricted storage falls back to this page's memory. */ }
    try {
      if (session?.persistent) persistentStorage?.setItem(REMEMBER_KEY, JSON.stringify(session));
      else persistentStorage?.removeItem(REMEMBER_KEY);
    } catch { /* Zonder opslag blijft alleen dit tabblad ingelogd. */ }
  }
  function valid(value) {
    if (!value || typeof value.token !== 'string' || value.token.length === 0 || !Number.isFinite(value.lastActive) || value.lastActive > now()) return false;
    return now() - value.lastActive < (value.persistent ? REMEMBER_MS : IDLE_MS);
  }
  // Onthouden toegang op dit apparaat mag altijd worden hersteld.
  try { const remembered = JSON.parse(persistentStorage?.getItem(REMEMBER_KEY) || 'null'); if (valid(remembered) && remembered.persistent) session = remembered; } catch {}
  // A new or duplicated tab must not inherit authentication. Only a reload
  // may restore this tab's session; normal launches always start at login.
  if (!session && navigationType === 'reload') {
    try { const saved = JSON.parse(storage?.getItem(SESSION_KEY) || 'null'); if (valid(saved)) session = saved; } catch {}
  }
  save();
  function clear(reason = '') {
    session = null;
    save();
    listeners.forEach(listener => listener(reason));
  }
  function token() {
    if (session && !valid(session)) clear('idle');
    return session?.token || '';
  }
  return {
    token,
    start(value, persistent = false) { session = { token: value, lastActive: now() }; if (persistent) session.persistent = true; save(); },
    persistent() { return Boolean(token() && session.persistent); },
    replace(value) { if (token()) { session.token = value; save(); } },
    clear,
    touch() { if (token()) { session.lastActive = now(); save(); return true; } return false; },
    remaining() { return token() ? Math.max(0, (session.persistent ? REMEMBER_MS : IDLE_MS) - (now() - session.lastActive)) : 0; },
    lastActive() { return session?.lastActive || 0; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

let storage, persistentStorage;
try { storage = globalThis.sessionStorage; } catch {}
try { persistentStorage = globalThis.localStorage; } catch {}
export const tabSession = createTabSession({ storage, persistentStorage, navigationType: globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type });

