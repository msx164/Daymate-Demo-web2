const KEY = 'daymate.web2.session.v1';
export function session() {
  try { return JSON.parse(window.sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
export function saveSession(value) { window.sessionStorage.setItem(KEY, JSON.stringify(value)); }
export function clearSession() { window.sessionStorage.removeItem(KEY); }
// Legacy hooks retain their contracts while their storage becomes account-scoped.
export function userStorage(kind = 'local') {
  const raw = kind === 'local' ? window.localStorage : window.sessionStorage;
  const prefix = `daymate.web2.${session()?.user?.id || 'signed-out'}.`;
  return {
    getItem: key => raw.getItem(prefix + key),
    setItem: (key, value) => raw.setItem(prefix + key, value),
    removeItem: key => raw.removeItem(prefix + key),
  };
}
