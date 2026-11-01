import test from 'node:test';
import assert from 'node:assert/strict';
import { session, saveSession, clearSession, userStorage } from './web2/session.js';

test('different accounts cannot read one another’s legacy local settings or session drafts', () => {
  const original = global.window;
  function storage() {
    const values = new Map();
    return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  }
  global.window = { localStorage: storage(), sessionStorage: storage() };
  try {
    saveSession({ token: 'a-token', user: { id: 'user-a' } });
    userStorage('local').setItem('legacy-memory', 'private A');
    userStorage('session').setItem('focus-draft', 'draft A');
    saveSession({ token: 'b-token', user: { id: 'user-b' } });
    assert.equal(userStorage('local').getItem('legacy-memory'), null);
    assert.equal(userStorage('session').getItem('focus-draft'), null);
    userStorage('local').setItem('legacy-memory', 'private B');
    saveSession({ token: 'a-token', user: { id: 'user-a' } });
    assert.equal(userStorage('local').getItem('legacy-memory'), 'private A');
    assert.equal(userStorage('session').getItem('focus-draft'), 'draft A');
    clearSession(); assert.equal(session(), null);
    assert.equal(userStorage('local').getItem('legacy-memory'), null);
  } finally { global.window = original; }
});
