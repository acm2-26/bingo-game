/**
 * Host controller.
 *
 * Owns the authoritative game state, admits players, referees claims and
 * drives the caller. Talks to phones only through the transport interface —
 * there is no WebRTC vocabulary anywhere in this file.
 */

import { $ } from '../util/dom.js';
import { stamp, now } from '../util/time.js';
import { toast } from '../ui/toast.js';
import { showScreen } from '../ui/screens.js';
import { blip, buzz, speak } from '../ui/sound.js';
import { showCelebration } from '../ui/celebrate.js';

import { OFFLINE_AFTER } from '../config.js';
import { callString, letterFor } from '../core/numbers.js';
import { patternName } from '../core/patterns.js';
import { verifyClaim } from '../core/validation.js';
import { MSG, stateSnapshot } from '../core/protocol.js';
import { game, drawNumber, undoDraw, startRound, roundWinners, hasWonThisRound } from '../core/state.js';
import { createHostTransport } from '../net/transport.js';

import { H, onlineCount, broadcast } from './host-state.js';
import { logActivity, renderActivity, announceJoin } from './activity.js';
import { renderRoster, scheduleRoster, updateCapacity } from './roster.js';
import {
  buildGrid, renderMasterGrid, paintMasterGrid,
  setCallerNumber, setAnnouncement, buildMaxWinnersOptions
} from './caller.js';
import {
  syncFullCaller, dismissWinnerBanner,
  openFullCaller as openFs, closeFullCaller
} from './fullscreen.js';
import { recordWinner, renderWinnerLog, addManualWinner, clearWinnerLog } from './winners.js';
import { exportRoundData, saveGameSession, saveWinnerLog, loadGameSession } from './persistence.js';

/* ------------------------------------------------------------------ startup */

export async function startHost() {
  showScreen('screen-host');
  buildMaxWinnersOptions();
  renderMasterGrid();
  renderRoster();
  renderWinnerLog();
  renderActivity();
  updateCapacity();

  H.transport = await createHostTransport();
  H.transport.on('status', (state, text) => setNetStatus(state, text));
  H.transport.on('ready', ({ roomId, pin }) => onRoomReady(roomId, pin));
  H.transport.on('peer', peer => admit(peer));
  H.transport.on('message', (peer, msg) => onMessage(peer, msg));
  H.transport.on('gone', peer => markOffline(peer));
  H.transport.start();

  // Firebase reports disconnection itself (onDisconnect), so timing players out
  // on missed heartbeats would wrongly grey out players who are perfectly fine.
  if (!H.transport.managesPresence && !H.sweepTimer) {
    H.sweepTimer = setInterval(sweepPresence, 5000);
  }
  document.addEventListener('keydown', onKey);
}

function setNetStatus(state, text) {
  const dot = $('host-net-dot');
  if (dot) dot.className = 'dot ' + state;
  const label = $('host-net-text');
  if (label) label.textContent = text;
}

function onRoomReady(roomId, pin) {
  H.roomId = roomId;
  H.pin = pin;
  $('host-pin').textContent = pin;
  $('fs-pin').textContent = pin;
  $('host-room-id').textContent = roomId;
  renderQR();
}

function renderQR() {
  const box = $('qrcode');
  if (!box) return;
  box.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    box.innerHTML = '<div class="hint">QR unavailable — share the Game PIN.</div>';
    return;
  }
  try {
    new QRCode(box, { text: H.transport.joinUrl(), width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
  } catch {
    box.innerHTML = '<div class="hint">QR unavailable — share the Game PIN.</div>';
  }
}

export function copyJoinLink() {
  if (!H.roomId) return toast('Room not ready yet', true);
  const url = H.transport.joinUrl();
  const done = () => toast('Join link copied ✔');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => prompt('Copy this link:', url));
  } else {
    prompt('Copy this link:', url);
  }
}

/* ------------------------------------------------------------- admission */

/**
 * Register or re-register a player. Idempotent: the transport may announce the
 * same peer twice, and a HELLO arrives on top of that.
 */
function admit(peer, aliasFromHello) {
  const clientId = peer.id;
  const alias = aliasFromHello || peer.meta.alias || 'Wizard';
  let player = H.players.get(clientId);

  if (!player) {
    // Capacity guard. A player who already holds a slot is always re-admitted,
    // so a reconnection is never bounced by a full room.
    if (onlineCount() >= H.capacity) {
      peer.send({ type: MSG.ROOM_FULL, capacity: H.capacity });
      setTimeout(() => peer.close(), 500);
      return;
    }
    player = { clientId, alias, joinTime: stamp(), lastSeen: now(), online: true, peer };
    H.players.set(clientId, player);
    announceJoin(alias);
  } else {
    if (player.peer && player.peer !== peer) player.peer.close();
    const wasOffline = !player.online;
    player.peer = peer;
    if (alias) player.alias = alias;
    player.online = true;
    player.lastSeen = now();
    if (wasOffline) logActivity('rejoin', `${player.alias} reconnected`);
  }

  queueState(peer);
  scheduleRoster();
}

/** Snapshots are drained a few at a time so a mass join does not serialise the
 *  called-number history fifty times in one tick. */
function queueState(peer) {
  H.syncQueue.push(peer);
  if (H.syncTimer) return;
  H.syncTimer = setInterval(() => {
    for (let i = 0; i < 4 && H.syncQueue.length; i++) {
      H.syncQueue.shift().send(stateSnapshot(game));
    }
    if (!H.syncQueue.length) { clearInterval(H.syncTimer); H.syncTimer = null; }
  }, 120);
}

function markOffline(peer) {
  const player = H.players.get(peer.id);
  if (player && player.peer === peer) {
    player.online = false;
    logActivity('leave', `${player.alias} disconnected`);
    scheduleRoster();
  }
}

function sweepPresence() {
  let changed = false;
  H.players.forEach(player => {
    if (player.online && now() - player.lastSeen > OFFLINE_AFTER) {
      player.online = false;
      changed = true;
      logActivity('leave', `${player.alias} lost connection`);
    }
  });
  if (changed) scheduleRoster();
}

/* --------------------------------------------------------------- messages */

function onMessage(peer, msg) {
  if (!msg || !msg.type) return;

  // The player's own id wins: it survives across transport-level reconnects.
  if (msg.clientId) peer.id = msg.clientId;
  const player = H.players.get(peer.id);

  if (msg.type === MSG.HELLO) return admit(peer, msg.alias);

  if (player) {
    player.lastSeen = now();
    if (!player.online) { player.online = true; scheduleRoster(); }
  }

  switch (msg.type) {
    case MSG.PING:
      if (player && msg.alias && player.alias !== msg.alias) {
        player.alias = msg.alias;
        scheduleRoster();
      }
      peer.send({ type: MSG.PONG, t: msg.t });
      break;

    case MSG.BINGO:
      judgeClaim(peer, player, msg);
      break;
  }
}

/** The referee. Runs on host data, over the card the player actually holds. */
function judgeClaim(peer, player, msg) {
  const wins = roundWinners();
  const who = player?.alias || msg.alias || 'Wizard';

  if (wins.length >= game.maxWinners) {
    peer.send({ type: MSG.BINGO_REJECTED, reason: 'Winner limit already reached for this round.' });
    return;
  }
  if (hasWonThisRound(game, peer.id)) {
    peer.send({ type: MSG.BINGO_REJECTED, reason: 'You already won this round.' });
    return;
  }

  const check = verifyClaim(msg.card, msg.marks, game.pattern, new Set(game.drawn));
  if (!check.ok) {
    peer.send({ type: MSG.BINGO_REJECTED, reason: check.reason });
    setAnnouncement(`⚠️ Invalid claim from ${who} — ${check.reason}`, '#fca5a5');
    logActivity('bad', `Invalid claim by ${who} — ${check.reason}`);
    toast(`⚠️ Invalid claim by ${who}`, true);
    buzz();
    return;
  }

  const rank = wins.length + 1;
  recordWinner({
    round: game.round, rank, alias: who, clientId: peer.id,
    pattern: patternName(game.pattern), verified: true, source: 'app'
  });
  peer.send({ type: MSG.BINGO_ACCEPTED, rank });
  // clientId travels with it so the winner's own device can skip the
  // "someone else won" toast — a broadcast transport cannot exclude a reader.
  broadcast({ type: MSG.SOMEONE_WON, alias: who, rank, clientId: peer.id }, peer.id);

  setAnnouncement(`🎉 BINGO! Winner #${rank}: ${who}`, '#4ade80');
  showCelebration('BINGO!', who, rank);
  speak(`Bingo! Winner number ${rank}. ${who}`);

  if (rank >= game.maxWinners) {
    setTimeout(() => {
      setAnnouncement(`🏁 Round ${game.round} complete — ${game.maxWinners}/${game.maxWinners} winners`, '#4ade80');
    }, 4000);
  }
}

/* ----------------------------------------------------------------- calling */

export function hostDrawNumber() {
  const n = drawNumber(game);
  if (n === null) {
    setCallerNumber('END', false);
    toast('All 75 numbers have been called.');
    return;
  }
  setCallerNumber(callString(n), true);
  blip();
  speak(`${letterFor(n)}, ${n}`);
  paintMasterGrid();
  broadcast({ type: MSG.CALL, number: n });
}

export function undoLastDraw() {
  const n = undoDraw(game);
  if (n === null) return toast('Nothing to undo', true);
  setCallerNumber(game.last ? callString(game.last) : '--', false);
  paintMasterGrid();
  resyncAll();
  toast(`Undid ${callString(n)}`);
}

export function broadcastPattern() {
  game.pattern = $('winning-pattern-selector').value;
  broadcast({ type: MSG.PATTERN, pattern: game.pattern });
  syncFullCaller();
}

export function updateMaxWinnersLimit() {
  game.maxWinners = parseInt($('max-winners-select').value, 10) || 1;
  $('winner-limit-label').textContent = game.maxWinners;
  broadcast({ type: MSG.LIMIT, maxWinners: game.maxWinners });
  syncFullCaller();
}

export function startNewRound() {
  const round = startRound(game);
  $('current-round-num').textContent = round;
  setCallerNumber('--', false);
  setAnnouncement('');
  paintMasterGrid();
  renderWinnerLog();
  renderRoster();
  broadcast({ type: MSG.ROUND_RESET, round, pattern: game.pattern, maxWinners: game.maxWinners });
  dismissWinnerBanner();
  logActivity('round', `Round ${round} started — new cards sent to all players`);
  toast(`Round ${round} started — new cards sent`);
}

/** Push the current snapshot to everyone — after an undo or a restore. */
function resyncAll() {
  H.players.forEach(p => p.peer?.send(stateSnapshot(game)));
}

function onKey(e) {
  if (!$('screen-host').classList.contains('active')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag)) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    hostDrawNumber();
  }
}

/* --------------------------------------------------------- wiring for main */

export const openFullCaller = () => openFs({ buildGrid, paintMasterGrid, setCallerNumber });

export function restoreSavedGame(ev) {
  loadGameSession(ev, () => {
    $('current-round-num').textContent = game.round;
    $('winning-pattern-selector').value = game.pattern;
    $('max-winners-select').value = game.maxWinners;
    setCallerNumber(game.last ? callString(game.last) : '--', false);
    paintMasterGrid();
    renderWinnerLog();
    renderRoster();
    resyncAll();
  });
}

export {
  updateCapacity, closeFullCaller, dismissWinnerBanner,
  addManualWinner, clearWinnerLog, saveWinnerLog,
  exportRoundData, saveGameSession
};
