/**
 * A stable per-device id.
 *
 * This is what lets a phone that drops off and comes back reattach to its own
 * roster row instead of appearing as a second player. It survives a refresh,
 * a screen lock and a network change.
 */

const KEY = 'bingo_client_id';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode — ignore */ }
}

function makeId() {
  return 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const CLIENT_ID = (() => {
  let id = read(KEY);
  if (!id) { id = makeId(); write(KEY, id); }
  return id;
})();

export const loadAlias = () => read('bingo_alias') || '';
export const saveAlias = alias => write('bingo_alias', alias);
