/**
 * Host runtime state.
 *
 * Kept in its own module so roster.js, caller.js, winners.js and host.js can
 * all reach it without importing each other — that is what keeps the host
 * modules free of circular imports.
 *
 * Game state (round, pattern, drawn numbers, winners) lives in core/state.js;
 * this is only the things that exist because we are the host.
 */

import { DEFAULT_CAPACITY } from '../config.js';

/** @typedef {{clientId:string, alias:string, joinTime:string, lastSeen:number,
 *             online:boolean, peer:object}} Player */

export const H = {
  transport: null,
  pin: null,
  roomId: null,
  /** @type {Map<string, Player>} */
  players: new Map(),
  capacity: DEFAULT_CAPACITY,

  sweepTimer: null,
  rosterTimer: null,
  syncQueue: [],
  syncTimer: null
};

export function onlineCount() {
  let n = 0;
  H.players.forEach(p => { if (p.online) n += 1; });
  return n;
}

export function playersSorted() {
  return Array.from(H.players.values())
    .sort((a, b) => (b.online - a.online) || a.joinTime.localeCompare(b.joinTime));
}

/**
 * Send to every player.
 *
 * A transport that can publish once for all listeners (Firebase writes a single
 * node) exposes broadcast() and we use it — otherwise a called number would cost
 * 50 writes instead of 1. Peer-to-peer has no such shortcut and loops.
 */
export function broadcast(msg, exceptClientId) {
  if (H.transport && typeof H.transport.broadcast === 'function') {
    H.transport.broadcast(msg, exceptClientId);
    return;
  }
  H.players.forEach(p => {
    if (p.clientId !== exceptClientId && p.peer) p.peer.send(msg);
  });
}
