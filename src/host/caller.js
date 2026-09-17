/** The caller: current number, recent calls and the 1-75 master grid.
 *  Every display here is mirrored into the full-screen projector view. */

import { $, replay } from '../util/dom.js';
import { callString } from '../core/numbers.js';
import { game } from '../core/state.js';
import { MAX_WINNERS_OPTIONS } from '../config.js';
import { syncFullCaller } from './fullscreen.js';

/** The normal host grid and the full-screen grid use the same cell ids with
 *  different prefixes, so both are painted by one pass. */
export const GRID_PREFIXES = ['host-num-', 'fs-num-'];

export function buildGrid(container, prefix) {
  if (!container) return;
  container.innerHTML = '';
  ['B', 'I', 'N', 'G', 'O'].forEach((letter, row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'grid-row';

    const letterEl = document.createElement('div');
    letterEl.className = 'row-letter';
    letterEl.textContent = letter;
    rowEl.appendChild(letterEl);

    for (let n = row * 15 + 1; n <= row * 15 + 15; n++) {
      const cell = document.createElement('div');
      cell.className = 'num-cell-host';
      cell.id = prefix + n;
      cell.textContent = n;
      rowEl.appendChild(cell);
    }
    container.appendChild(rowEl);
  });
}

export function renderMasterGrid() {
  buildGrid($('master-grid'), 'host-num-');
  if (document.body.classList.contains('caller-fs')) buildGrid($('fs-grid'), 'fs-num-');
  paintMasterGrid();
}

export function paintMasterGrid() {
  document.querySelectorAll('.num-cell-host').forEach(c => c.classList.remove('drawn', 'latest'));
  game.drawn.forEach(n => GRID_PREFIXES.forEach(p => $(p + n)?.classList.add('drawn')));
  if (game.last) GRID_PREFIXES.forEach(p => $(p + game.last)?.classList.add('latest'));

  $('drawn-count').textContent = game.drawn.length;
  const recent = game.drawn.slice(-8, -1).reverse();
  const html = recent.map(n => `<span>${callString(n)}</span>`).join('')
    || '<span style="opacity:.4">no previous calls</span>';
  $('host-recent').innerHTML = html;
  updateDrawButton();
  syncFullCaller(html);
}

/** Write the called number to both the panel and the projector view. */
export function setCallerNumber(text, pop) {
  [$('host-current-num'), $('fs-num')].forEach(el => {
    if (!el) return;
    el.textContent = text;
    if (pop) replay(el, 'pop');
  });
}

export function setAnnouncement(text, color) {
  [$('host-announcement'), $('fs-announce')].forEach(el => {
    if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
  });
}

/**
 * The primary caller button doubles as the Begin button.
 *
 * Students sit in a lobby that says "waiting for the host to begin", so the
 * host needs a control that says "begin" — drawing the first number is what
 * actually starts a round, and this makes that obvious rather than tribal
 * knowledge. It reverts to "Draw Next Number" once the round is under way, and
 * returns to "Begin Round N" after every round change.
 */
export function updateDrawButton() {
  const notStarted = game.drawn.length === 0;
  const label = notStarted
    ? (game.round === 1 ? '▶️ Begin Game' : `▶️ Begin Round ${game.round}`)
    : '🎲 Draw Next Number';

  [['draw-btn', ''], ['fs-draw-btn', ' <small>(Space)</small>']].forEach(([id, suffix]) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = label + suffix;
    el.classList.toggle('begin', notStarted);
  });
}

export function buildMaxWinnersOptions() {
  const sel = $('max-winners-select');
  if (!sel || sel.options.length) return;
  for (let i = 1; i <= MAX_WINNERS_OPTIONS; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i} winner${i > 1 ? 's' : ''}`;
    sel.appendChild(opt);
  }
  sel.value = game.maxWinners;
}
