/** Connected Wizards: lobby tiles plus the detailed roster list. */

import { $, esc } from '../util/dom.js';
import { shortTime } from '../util/time.js';
import { game } from '../core/state.js';
import { H, onlineCount, playersSorted } from './host-state.js';
import { syncFullCaller } from './fullscreen.js';

/** Re-render is coalesced: during a 50-player join burst this collapses
 *  ~50 full re-renders into one. */
export function scheduleRoster() {
  if (H.rosterTimer) return;
  H.rosterTimer = setTimeout(() => { H.rosterTimer = null; renderRoster(); }, 120);
}

/** Tiles are added and removed in place rather than rebuilt, so only a newly
 *  arrived name plays the pop-in animation — the other 49 stay still. */
const tiles = new Map();

function renderTiles(players) {
  const box = $('lobby-tiles');
  if (!box) return;
  const seen = new Set();

  for (const p of players) {
    seen.add(p.clientId);
    let el = tiles.get(p.clientId);
    if (!el) {
      el = document.createElement('span');
      el.className = 'tile pop';
      tiles.set(p.clientId, el);
      box.appendChild(el);
      setTimeout(() => el.classList.remove('pop'), 500);
    }
    const win = game.winners.find(w => w.clientId === p.clientId && w.round === game.round);
    const label = (win ? '🏆 ' : '') + p.alias;
    if (el.textContent !== label) el.textContent = label;
    el.classList.toggle('off', !p.online);
    el.classList.toggle('win', !!win);
  }

  tiles.forEach((el, id) => {
    if (!seen.has(id)) { el.remove(); tiles.delete(id); }
  });
}

export function renderRoster() {
  const list = $('roster-list');
  if (!list) return;

  const players = playersSorted();
  $('player-count').textContent = onlineCount();
  syncFullCaller();
  renderTiles(players);

  if (!players.length) {
    list.innerHTML = '<div class="empty">No players yet — share the Game PIN.</div>';
    return;
  }

  list.innerHTML = players.map((p, i) => {
    const wins = game.winners.filter(w => w.clientId === p.clientId);
    const thisRound = wins.find(w => w.round === game.round);
    const badge = thisRound
      ? `<span class="badge-win">🏆 #${thisRound.rank}</span>`
      : (wins.length ? `<span class="badge-win" style="opacity:.55">🏆 ×${wins.length}</span>` : '');
    return `<div class="roster-row ${p.online ? '' : 'offline'}">
      <i class="dot ${p.online ? 'on' : 'off'}"></i>
      <span class="nm">${i + 1}. ${esc(p.alias)}</span>
      ${badge}
      <span class="tm">${esc(shortTime(p.joinTime))}</span>
    </div>`;
  }).join('');
}

export function updateCapacity() {
  H.capacity = parseInt($('capacity-select').value, 10) || H.capacity;
  $('capacity-label').textContent = H.capacity;
  scheduleRoster();
}
