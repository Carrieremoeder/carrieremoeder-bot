export const IDLE_MS = 30 * 60 * 1000;
export const WARNING_MS = 60 * 1000;
export const SESSION_KEY = 'cm-bot-tab-session-v1';

export function createTabSession({ storage, navigationType, now = Date.now } = {}) {
  let session = null;
  const listeners = new Set();
  function save() {
    try {
      if (session) storage?.setItem(SESSION_KEY, JSON.stringify(session));
      else storage?.removeItem(SESSION_KEY);
    } catch { /* Restricted storage falls back to this page's memory. */ }
  }
  function valid(value) {
    return value && typeof value.token === 'string' && value.token.length > 0 &&
      Number.isFinite(value.lastActive) && value.lastActive <= now() && now() - value.lastActive < IDLE_MS;
  }
  // A new or duplicated tab must not inherit authentication. Only a reload
  // may restore this tab's session; normal launches always start at login.
  if (navigationType === 'reload') {
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
    start(value) { session = { token: value, lastActive: now() }; save(); },
    replace(value) { if (token()) { session.token = value; save(); } },
    clear,
    touch() { if (token()) { session.lastActive = now(); save(); return true; } return false; },
    remaining() { return token() ? Math.max(0, IDLE_MS - (now() - session.lastActive)) : 0; },
    lastActive() { return session?.lastActive || 0; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

let storage;
try { storage = globalThis.sessionStorage; } catch {}
export const tabSession = createTabSession({ storage, navigationType: globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type });

