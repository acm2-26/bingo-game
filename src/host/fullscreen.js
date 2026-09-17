/**
 * Full-screen caller — the projector view.
 *
 * Fullscreen is requested on the page root rather than on the panel itself.
 * Requesting it on the panel would make the browser render only that subtree,
 * which would hide the confetti and the BINGO overlay during the one moment
 * they matter most.
 */

import { $ } from '../util/dom.js';
import { callString } from '../core/numbers.js';
import { patternName } from '../core/patterns.js';
import { game, roundWinners } from '../core/state.js';
import { H, onlineCount } from './host-state.js';

/** Refresh the projector chips. Cheap no-op when the view is closed. */
export function syncFullCaller(recentHtml) {
  if (!document.body.classList.contains('caller-fs')) return;
  $('fs-pin').textContent = H.pin || '••••••';
  $('fs-round').textContent = game.round;
  $('fs-pattern').textContent = patternName(game.pattern);
  $('fs-drawn').textContent = game.drawn.length;
  $('fs-players').textContent = onlineCount();
  $('fs-winners').textContent = roundWinners().length;
  $('fs-winlimit').textContent = game.maxWinners;
  if (recentHtml !== undefined) $('fs-recent').innerHTML = recentHtml;
}

/** Winner banner, shown on the host panel and mirrored into the projector view
 *  so a win is never missed whichever screen the host is looking at. */
export function showWinnerBanner(alias, rank, pattern) {
  const text = `🏆 WINNER #${rank} — ${alias}  ·  ${pattern}  ·  Round ${game.round}`;
  [['host-winner-banner', 'hwb-text'], ['fs-winner-banner', 'fswb-text']].forEach(([box, label]) => {
    const boxEl = $(box);
    const labelEl = $(label);
    if (!boxEl || !labelEl) return;
    labelEl.textContent = text;
    boxEl.style.display = 'flex';
  });
}

export function dismissWinnerBanner() {
  ['host-winner-banner', 'fs-winner-banner'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = 'none';
  });
}

export function openFullCaller({ buildGrid, paintMasterGrid, setCallerNumber }) {
  document.body.classList.add('caller-fs');
  buildGrid($('fs-grid'), 'fs-num-');
  paintMasterGrid();
  setCallerNumber(game.last ? callString(game.last) : '--', false);
  syncFullCaller();

  const root = document.documentElement;
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
}

export function closeFullCaller() {
  document.body.classList.remove('caller-fs');
  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch { /* browser refused — the overlay closes regardless */ }
}

/** Esc leaves fullscreen without going through our button; follow it. */
['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      document.body.classList.remove('caller-fs');
    }
  });
});
