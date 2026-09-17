/**
 * The "You're in!" overlay.
 *
 * It confirms the student is in the right game, then gets out of the way on a
 * timer. The card underneath is safe to show before any number is called —
 * marking is validated against the called list, so there is nothing to
 * pre-mark — and seeing it early lets students read their numbers and settle.
 *
 * Deliberately NOT load-bearing: the card must never depend on a message
 * arriving to become visible.
 */

import { $ } from '../util/dom.js';
import { P } from './player-state.js';

/** How long the confirmation sits before revealing the card. */
const REVEAL_AFTER_JOIN = 2800;
const REVEAL_AFTER_ROUND = 2200;

let autoHideTimer = null;

export function showLobby(icon, title, waitText, autoHideMs = 0) {
  clearTimeout(autoHideTimer);
  $('pl-icon').textContent = icon;
  $('pl-title').textContent = title;
  $('pl-name').textContent = P.alias;
  $('pl-wait').textContent = waitText;
  $('player-lobby').classList.add('show');

  if (autoHideMs) autoHideTimer = setTimeout(hideLobby, autoHideMs);
}

export function hideLobby() {
  clearTimeout(autoHideTimer);
  P.cardRevealed = true;
  $('player-lobby').classList.remove('show');
}

export const LOBBY = {
  /** Stays until the connection opens — there is nothing useful behind it yet. */
  connecting: () => showLobby('🦉', 'Sending your owl…', 'Connecting to the Great Hall'),

  /** Confirms, then reveals the card by itself. */
  waiting: pin => showLobby('🪄', "You're in!",
    pin ? `Your card is coming up · PIN ${pin}` : 'Your card is coming up',
    REVEAL_AFTER_JOIN),

  newRound: round => showLobby('🪄', `Round ${round}`,
    'A fresh card has been conjured', REVEAL_AFTER_ROUND),

  /** Persistent: a wrong PIN is not something to hide after three seconds. */
  notFound: pin => showLobby('🔎', 'Game not found',
    `No game with PIN ${pin} — check the number with the host`)
};
