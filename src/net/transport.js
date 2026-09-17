/**
 * Transport contract.
 *
 * Everything above this line in the stack (host/, player/, ui/) speaks only in
 * protocol messages and never mentions WebRTC, PeerJS, sockets or databases.
 * Swapping transports therefore means writing one new file that satisfies the
 * interfaces below and changing TRANSPORT in config.js — no changes to game
 * logic or UI. See docs/ADR-001-transport.md for why that matters.
 *
 * ── Peer ──────────────────────────────────────────────────────────────────
 *   A single connected player, as the host sees it.
 *     id        string   the player's stable client id
 *     meta      object   {clientId, alias} supplied at connection time
 *     send(msg) void
 *     close()   void
 *     isOpen()  boolean
 *
 * ── HostTransport ─────────────────────────────────────────────────────────
 *   start(pin)             begin hosting; may pick a different pin on collision
 *   stop()
 *   on(event, handler)     'status'   (state, text)   state: on|warn|off
 *                          'ready'    ({roomId, pin})
 *                          'peer'     (peer)          a player connected
 *                          'message'  (peer, msg)
 *                          'gone'     (peer)          a player disconnected
 *   joinUrl()              string the QR code encodes
 *
 * ── PlayerTransport ───────────────────────────────────────────────────────
 *   connect({roomId, clientId, alias})
 *   reconnect()            force a fresh attempt (used by the heartbeat watchdog)
 *   send(msg)              returns false if the link is down
 *   isOpen()
 *   stop()
 *   on(event, handler)     'status'  (state, text)
 *                          'open'    ()
 *                          'message' (msg)
 *                          'closed'  ()
 */

import { TRANSPORT } from '../config.js';
import { createPeerJsHost, createPeerJsPlayer, ensureLibs, pinToRoomId } from './peerjs-transport.js';
import { createFirebaseHost, createFirebasePlayer, firebaseRoomId } from './firebase-transport.js';

/** Minimal event emitter shared by the transport implementations. */
export function emitter() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return this;
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) || []) {
        try { fn(...args); } catch (err) { console.error(`[transport:${event}]`, err); }
      }
    }
  };
}

export async function createHostTransport(options = {}) {
  switch (TRANSPORT) {
    case 'firebase': return createFirebaseHost(options);
    case 'peerjs': await ensureLibs(); return createPeerJsHost(options);
    default: throw new Error(`Unknown transport: ${TRANSPORT}`);
  }
}

export async function createPlayerTransport(options = {}) {
  switch (TRANSPORT) {
    case 'firebase': return createFirebasePlayer(options);
    case 'peerjs': await ensureLibs(); return createPeerJsPlayer(options);
    default: throw new Error(`Unknown transport: ${TRANSPORT}`);
  }
}

/** Turn the PIN a student typed into whatever the active transport calls a room.
 *  PeerJS namespaces it (its ids are global); Firebase uses it as a path key. */
export function roomIdFor(pin) {
  return TRANSPORT === 'firebase' ? firebaseRoomId(pin) : pinToRoomId(pin);
}
