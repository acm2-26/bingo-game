/**
 * Player controller.
 *
 * Joins a room, keeps the presence heartbeat alive, applies host messages to
 * the local mirror of the game state, and submits claims.
 */

import { $, replay } from '../util/dom.js';
import { now } from '../util/time.js';
import { toast } from '../ui/toast.js';
import { showScreen } from '../ui/screens.js';
import { blip, buzz, unlockAudio } from '../ui/sound.js';
import { showCelebration } from '../ui/celebrate.js';

import { HB_INTERVAL, PONG_TIMEOUT, ROOM_FULL_RETRY_MS } from '../config.js';
import { CLIENT_ID, loadAlias, saveAlias } from '../util/identity.js';
import { callString } from '../core/numbers.js';
import { patternName } from '../core/patterns.js';
import { MSG } from '../core/protocol.js';
import { game } from '../core/state.js';
import { createPlayerTransport, roomIdFor } from '../net/transport.js';

import { P } from './player-state.js';
import { LOBBY, hideLobby } from './lobby.js';
import {
  buildCard, autoMark, evaluateCard, fitBoard,
  setClaimIdle, setClaimWon, setClaimChecking
} from './card-view.js';

/* -------------------------------------------------------------- join flow */

export function joinByPin() {
  const raw = $('manual-room-input').value.trim();
  if (!raw) return toast('Enter the Game PIN first', true);
  promptJoin(raw);
}

/** Show the name screen for a PIN (typed, or read from the QR link). */
export function promptJoin(pinOrId) {
  const raw = String(pinOrId).trim();
  P.pin = /^\d{4,8}$/.test(raw) ? raw : null;
  P.roomId = roomIdFor(raw);

  $('join-room-label').textContent = P.pin || raw;
  $('alias-input').value = loadAlias();
  showScreen('screen-join');
  setTimeout(() => { const el = $('alias-input'); el.focus(); el.select(); }, 150);
}

export async function confirmJoin() {
  const value = $('alias-input').value.trim();
  if (!value) return toast('Please enter your name', true);

  P.alias = value.slice(0, 24);
  saveAlias(P.alias);
  unlockAudio();                      // this tap is our one guaranteed gesture

  $('player-name-tag').textContent = P.alias;
  showScreen('screen-player');
  LOBBY.connecting();
  if (!P.card.length) buildCard();
  fitBoard();
  requestWakeLock();

  P.transport = await createPlayerTransport();
  P.transport.on('status', setStatus);
  P.transport.on('open', onConnected);
  P.transport.on('message', onMessage);
  P.transport.on('notfound', pin => LOBBY.notFound(pin));

  setStatus('warn', 'Connecting…');
  // A small random delay so a class scanning the QR together does not hit the
  // signalling server in the same instant.
  setTimeout(() => {
    P.transport.connect({ roomId: P.roomId, clientId: CLIENT_ID, alias: P.alias });
  }, Math.random() * 1500);
}

function setStatus(state, text) {
  $('player-dot').className = 'dot ' + state;
  $('player-status').textContent = text;
}

function onConnected() {
  P.waitingForSlot = false;
  P.lastPong = now();
  if (!P.drawn.size && !P.cardRevealed) LOBBY.waiting(P.pin);
  P.transport.send({ type: MSG.HELLO, clientId: CLIENT_ID, alias: P.alias });
  startHeartbeat();
}

/* ------------------------------------------------------------- heartbeat */

function startHeartbeat() {
  clearInterval(P.heartbeat);
  // A transport that tracks presence itself (Firebase) answers no pings, so the
  // silent-link watchdog below would fire every few seconds forever and resync
  // for no reason. Only peer-to-peer needs watching.
  const watchdog = !P.transport.managesPresence;

  P.heartbeat = setInterval(() => {
    if (P.transport.isOpen()) {
      P.transport.send({ type: MSG.PING, clientId: CLIENT_ID, alias: P.alias, t: now() });
      if (watchdog && P.lastPong && now() - P.lastPong > PONG_TIMEOUT) {
        setStatus('warn', 'Weak signal — reconnecting…');
        P.transport.reconnect();
      }
    } else if (P.roomId && !P.waitingForSlot) {
      P.transport.reconnect();
    }
  }, HB_INTERVAL);
}

/** Phones suspend timers in the background; catch up the moment we return. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !P.roomId) return;
  requestWakeLock();
  if (!P.transport?.isOpen()) P.transport?.reconnect();
  else P.transport.send({ type: MSG.PING, clientId: CLIENT_ID, alias: P.alias, t: now() });
  fitBoard();
});

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && (!P.wakeLock || P.wakeLock.released)) {
      P.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* unsupported or denied — the game still works */ }
}

/* ---------------------------------------------------------------- messages */

export function onMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case MSG.PONG:
      P.lastPong = now();
      break;

    case MSG.STATE:
      game.round = msg.round;
      applyPattern(msg.pattern);
      P.drawn = new Set(msg.drawn || []);
      if (msg.maxWinners) game.maxWinners = msg.maxWinners;
      if (P.drawn.size || P.cardRevealed) hideLobby(); else LOBBY.waiting(P.pin);
      updateCallUI(msg.last, false);

      // Re-joining after a win: restore the trophy rather than offering a claim.
      if (Array.isArray(msg.winners)) {
        const mine = msg.winners.find(w => w.clientId === CLIENT_ID);
        if (mine) { P.claimed = true; setClaimWon(mine.rank); }
      }
      evaluateCard();
      break;

    case MSG.STARTED:
      P.started = msg.started !== false;
      if (P.started) {
        hideLobby();
        if (!P.drawn.size) toast('The game has started — first number coming up');
      }
      break;

    case MSG.CALL:
      P.drawn.add(msg.number);
      hideLobby();
      updateCallUI(msg.number, true);
      if ($('auto-mark').checked) autoMark(msg.number);
      evaluateCard();
      break;

    case MSG.PATTERN:
      applyPattern(msg.pattern);
      evaluateCard();
      break;

    case MSG.LIMIT:
      game.maxWinners = msg.maxWinners;
      break;

    case MSG.ROUND_RESET:
      game.round = msg.round;
      applyPattern(msg.pattern);
      P.drawn = new Set();
      P.claimed = false;
      P.started = false;
      updateCallUI(null, false);
      buildCard();
      setClaimIdle();
      P.cardRevealed = false;
      LOBBY.newRound(game.round);
      toast(`Round ${game.round} — new card!`);
      break;

    case MSG.BINGO_ACCEPTED:
      P.claimed = true;
      setClaimWon(msg.rank);
      showCelebration('BINGO!', P.alias, msg.rank);
      break;

    case MSG.BINGO_REJECTED:
      P.claimed = false;
      buzz();
      toast(msg.reason || 'Claim not accepted', true);
      setClaimIdle();
      evaluateCard();
      break;

    case MSG.SOMEONE_WON:
      toast(`🏆 ${msg.alias} got Bingo #${msg.rank}!`);
      break;

    case MSG.ROOM_FULL:
      P.waitingForSlot = true;
      setStatus('warn', `Room full (${msg.capacity}) — waiting`);
      toast(`The room is full (${msg.capacity} players). You'll join automatically when a slot frees up.`, true);
      P.transport.pause(ROOM_FULL_RETRY_MS + Math.random() * 4000);
      break;
  }
}

function applyPattern(pattern) {
  if (!pattern) return;
  game.pattern = pattern;
  $('current-pattern-display').textContent = patternName(pattern);
}

function updateCallUI(n, animate) {
  const el = $('player-last-call');
  el.textContent = n ? callString(n) : '--';
  if (animate) { replay(el, 'pop'); blip(); }
  $('player-drawn-count').textContent = P.drawn.size;
}

/* ------------------------------------------------------------------- claim */

export function claimBingo() {
  if (!P.ready || P.claimed) return;
  if (!P.transport?.isOpen()) {
    toast('Not connected — reconnecting…', true);
    P.transport?.reconnect();
    return;
  }
  setClaimChecking();
  P.transport.send({ type: MSG.BINGO, clientId: CLIENT_ID, alias: P.alias, card: P.card, marks: P.marks });
  // If the host never answers, give the button back rather than stranding them.
  setTimeout(() => { if (!P.claimed && P.ready) evaluateCard(); }, 4000);
}
