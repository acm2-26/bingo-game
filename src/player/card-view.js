/**
 * The player's bingo card: rendering, marking, pattern highlighting and the
 * sizing that guarantees the screen never scrolls.
 */

import { $, replay } from '../util/dom.js';
import { toast } from '../ui/toast.js';
import { buzz, tone } from '../ui/sound.js';
import { SCREEN_CHANGED } from '../ui/screens.js';
import { callString, generateCard, emptyMarks, isFreeSpace } from '../core/numbers.js';
import { patternCells } from '../core/patterns.js';
import { game } from '../core/state.js';
import { P } from './player-state.js';

/* ------------------------------------------------------------------- build */

export function buildCard() {
  const board = $('player-board');
  board.innerHTML = '';
  P.card = generateCard();
  P.marks = emptyMarks();
  P.lastHits = [];

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.id = `cell-${r}-${c}`;

      if (isFreeSpace(r, c)) {
        cell.textContent = '★ FREE';
        cell.classList.add('free-space', 'selected');
      } else {
        cell.textContent = P.card[r][c];
        // pointerdown fires on touch-down, ahead of the 100-300ms the browser
        // waits before synthesising a click. That delay is what made marking
        // feel laggy on phones.
        cell.addEventListener('pointerdown', ev => {
          ev.preventDefault();
          toggleCell(cell, r, c);
        }, { passive: false });
      }
      board.appendChild(cell);
    }
  }

  fitBoard();
  setClaimIdle();
}

/* ------------------------------------------------------------------ marking */

/**
 * Self-validation: a square can only be marked once the host has called it.
 * Unconditional by design — an empty called-list means nothing may be marked.
 * The host re-checks every claim anyway (core/validation.js); this is the
 * immediate feedback that keeps students honest without a round trip.
 */
export function toggleCell(cell, r, c) {
  if (isFreeSpace(r, c)) return;
  const n = P.card[r][c];

  if (!P.marks[r][c]) {
    if (!P.drawn.has(n)) {
      replay(cell, 'shake');
      buzz();
      if (!P.drawn.size) {
        toast(P.transport?.isOpen()
          ? 'No numbers have been called yet'
          : 'Not connected to the host yet — wait for the green dot', true);
      } else {
        toast(`${callString(n)} has not been called`, true);
      }
      return;
    }
    P.marks[r][c] = true;
    cell.classList.add('selected');
  } else {
    P.marks[r][c] = false;
    cell.classList.remove('selected');
  }
  evaluateCard();
}

/** Mark a called number automatically, for players who turn Auto-mark on. */
export function autoMark(n) {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (P.card[r][c] === n && !P.marks[r][c]) {
        P.marks[r][c] = true;
        $(`cell-${r}-${c}`)?.classList.add('selected');
      }
    }
  }
}

/** Recompute the winning highlight and the claim button. */
export function evaluateCard() {
  // Clear only what was highlighted last time rather than walking all 25 cells.
  P.lastHits.forEach(([r, c]) => $(`cell-${r}-${c}`)?.classList.remove('winning-cell'));

  const hits = patternCells(P.marks, game.pattern);
  P.lastHits = hits;
  P.ready = hits.length > 0;
  hits.forEach(([r, c]) => $(`cell-${r}-${c}`)?.classList.add('winning-cell'));

  if (P.claimed) return;
  if (P.ready) setClaimReady(); else setClaimIdle();
}

/* ------------------------------------------------------------ claim button */

export function setClaimIdle() {
  const b = $('claim-btn');
  b.className = 'btn-claim';
  b.disabled = true;
  b.textContent = 'Mark your card…';
}

export function setClaimReady() {
  const b = $('claim-btn');
  if (b.classList.contains('ready')) return;
  b.className = 'btn-claim ready';
  b.disabled = false;
  b.textContent = '🎉 CLAIM BINGO!';
  tone(1046.5, 0, 0.3, 0.22, 'sine');
}

export function setClaimWon(rank) {
  const b = $('claim-btn');
  b.className = 'btn-claim won';
  b.disabled = true;
  b.textContent = `🏆 You won #${rank}!`;
}

export function setClaimChecking() {
  const b = $('claim-btn');
  b.textContent = 'Checking…';
  b.disabled = true;
}

/* ------------------------------------------------------------------ sizing */

/**
 * Size the board to exactly the space between the call bar and the claim bar.
 * Done in JS rather than CSS because the available height depends on dynamic
 * viewport units that differ across mobile browsers; this is what guarantees
 * the player screen never scrolls.
 */
export function fitBoard() {
  const wrap = $('board-wrap');
  const stack = $('board-stack');
  if (!wrap || !stack || !$('screen-player').classList.contains('active')) return;

  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w <= 0 || h <= 0) return;

  const gap = 6;
  const headRatio = 0.42;                       // the B-I-N-G-O row ≈ 0.42 of a cell

  let cellW = Math.min((w - 4 * gap) / 5, 112);
  let headH = cellW * headRatio;
  let cellH = (h - 6 * gap - headH) / 5;

  if (cellH > cellW * 1.3) cellH = cellW * 1.3;  // don't stretch cells too tall
  if (cellH < cellW * 0.78) {                    // short screen: squares that fit
    cellW = Math.max(28, (h - 6 * gap) / (5 + headRatio));
    cellW = Math.min(cellW, (w - 4 * gap) / 5);
    headH = cellW * headRatio;
    cellH = cellW;
  }

  stack.style.width = `${cellW * 5 + gap * 4}px`;
  stack.style.height = `${cellH * 5 + gap * 5 + headH}px`;
  stack.style.setProperty('--cellsize', `${Math.min(cellW, cellH)}px`);
}

document.addEventListener(SCREEN_CHANGED, e => {
  if (e.detail.id === 'screen-player') requestAnimationFrame(fitBoard);
});
window.addEventListener('resize', fitBoard);

if (window.ResizeObserver) {
  // Throttled to one call per frame: an unthrottled observer can re-enter while
  // fitBoard is writing styles and keep the main thread busy.
  let pending = false;
  new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fitBoard(); });
  }).observe(document.body);
}
