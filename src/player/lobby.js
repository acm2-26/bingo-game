/** The "You're in!" overlay.
 *
 *  It covers the card until the first number of the round is called, which
 *  also means nobody can pre-mark anything before the game starts. */

import { $ } from '../util/dom.js';
import { P } from './player-state.js';

export function showLobby(icon, title, waitText) {
  $('pl-icon').textContent = icon;
  $('pl-title').textContent = title;
  $('pl-name').textContent = P.alias;
  $('pl-wait').textContent = waitText;
  $('player-lobby').classList.add('show');
}

export const hideLobby = () => $('player-lobby').classList.remove('show');

export const LOBBY = {
  connecting: () => showLobby('🦉', 'Sending your owl…', 'Connecting to the Great Hall'),
  waiting: () => showLobby('🪄', "You're in!", 'Waiting for the host to begin'),
  newRound: round => showLobby('🪄', `Round ${round}`, 'A fresh card has been conjured — get ready')
};
