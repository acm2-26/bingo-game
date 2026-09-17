/**
 * Entry point: wire the markup to the modules and boot.
 *
 * The HTML carries no inline event handlers. Instead elements declare
 * data-action (click) or data-change (change), and this file maps those names
 * to functions — one delegated listener for the whole page.
 */

import { GAME_VERSION } from './config.js';
import { $ } from './util/dom.js';
import { showScreen, openModal, closeModal } from './ui/screens.js';
import { hideCelebration } from './ui/celebrate.js';

import * as host from './host/host.js';
import { H } from './host/host-state.js';
import { game } from './core/state.js';
import * as player from './player/player.js';
import { P } from './player/player-state.js';
import { generateAndPrintCards } from './print/cards.js';
import { verifyClaim } from './core/validation.js';
import { patternCells } from './core/patterns.js';

/* ------------------------------------------------------------- action map */

const ACTIONS = {
  'nav': (_e, el) => showScreen(el.dataset.arg),
  'modal.open': (_e, el) => openModal(el.dataset.arg),
  'modal.close': (_e, el) => closeModal(el.dataset.arg),
  'ui.hideCelebration': hideCelebration,
  'ui.showPinEntry': (_e, el) => {
    const box = $('pin-entry');
    box.hidden = false;
    el.closest('.join-hint').hidden = true;
    $('manual-room-input').focus();
  },
  'app.reset': () => {
    if (confirm('Reset the whole app? All players will need to rejoin.')) location.reload();
  },

  'host.start': host.startHost,
  'host.copyLink': host.copyJoinLink,
  'host.draw': host.hostDrawNumber,
  'host.undo': host.undoLastDraw,
  'host.newRound': host.startNewRound,
  'host.fullscreenOpen': host.openFullCaller,
  'host.fullscreenClose': host.closeFullCaller,
  'host.dismissBanner': host.dismissWinnerBanner,
  'host.addManualWinner': host.addManualWinner,
  'host.clearWinners': host.clearWinnerLog,
  'host.saveWinners': host.saveWinnerLog,
  'host.exportRound': host.exportRoundData,
  'host.saveGame': host.saveGameSession,
  'host.loadGamePicker': () => $('load-game-file').click(),

  'player.joinByPin': player.joinByPin,
  'player.confirmJoin': player.confirmJoin,
  'player.claim': player.claimBingo,

  'print.cards': generateAndPrintCards
};

const CHANGES = {
  'host.capacity': host.updateCapacity,
  'host.pattern': host.broadcastPattern,
  'host.maxWinners': host.updateMaxWinnersLimit,
  'host.loadGame': ev => host.restoreSavedGame(ev)
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(ev, el);
  else console.warn('Unmapped action:', el.dataset.action);
});

document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(ev, el);
  else console.warn('Unmapped change:', el.dataset.change);
});

/* ------------------------------------------------------------------- boot */

function boot() {
  document.querySelectorAll('.ver').forEach(el => { el.textContent = GAME_VERSION; });

  $('alias-input').addEventListener('keydown', e => { if (e.key === 'Enter') player.confirmJoin(); });
  $('manual-room-input').addEventListener('keydown', e => { if (e.key === 'Enter') player.joinByPin(); });

  // ?pin= is what the QR code encodes; ?room= is kept for QR codes printed
  // before v2.5 and can be removed once none are in circulation.
  const params = new URLSearchParams(location.search);

  // ?debug=1 puts the player's sync state on screen — see player/debug.js.
  if (params.get('debug')) {
    import('./player/debug.js').then(m => m.initDebugPanel()).catch(() => {});
  }

  const entry = params.get('pin') || params.get('room');
  if (entry) player.promptJoin(entry);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/** Diagnostics hook — inspect live state from the browser console.
 *  Also what the browser test suite drives. */
window.BingoDebug = {
  version: GAME_VERSION,
  get host() { return H; },
  get player() { return P; },
  get game() { return game; },
  get drawn() { return game.drawn; },
  get winners() { return game.winners; },
  verifyClaim,
  patternCells,
  playerData: player.onMessage,
  hostDrawNumber: host.hostDrawNumber,
  broadcastPattern: host.broadcastPattern,
  updateMaxWinnersLimit: host.updateMaxWinnersLimit,
  updateCapacity: host.updateCapacity,
  openFullCaller: host.openFullCaller,
  closeFullCaller: host.closeFullCaller,
  dismissWinnerBanner: host.dismissWinnerBanner,
  hideCelebration
};
