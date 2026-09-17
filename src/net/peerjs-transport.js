/**
 * PeerJS / WebRTC implementation of the transport contract.
 *
 * Every phone opens a direct connection to the host's browser, negotiated
 * through STUN and, on networks that block direct paths, relayed via TURN.
 * The fragility this implies is documented in docs/ADR-001-transport.md.
 *
 * Nothing outside this file knows that WebRTC exists.
 */

import {
  PEER_OPTIONS, ID_PREFIX, FALLBACK_CDN,
  RETRY_BASE_MS, RETRY_FACTOR, RETRY_MAX_MS
} from '../config.js';
import { emitter } from './transport.js';

/* ---------------------------------------------------------------- libraries */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** The <script> tags in index.html are the fast path; this is the safety net
 *  for school networks that block one CDN but not another. */
export async function ensureLibs() {
  if (typeof Peer === 'undefined') {
    try { await loadScript(FALLBACK_CDN.peerjs); } catch { /* reported by callers */ }
  }
  if (typeof QRCode === 'undefined') {
    try { await loadScript(FALLBACK_CDN.qrcode); } catch { /* QR is optional */ }
  }
}

export const librariesAvailable = () => typeof Peer !== 'undefined';

const makePin = () => String(Math.floor(100000 + Math.random() * 900000));

/** A 4-8 digit PIN is namespaced; anything else is treated as a raw room id. */
export function pinToRoomId(pin) {
  const raw = String(pin).trim();
  return /^\d{4,8}$/.test(raw) ? ID_PREFIX + raw : raw;
}

const newPeer = id => (id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS));

/* --------------------------------------------------------------------- host */

export function createPeerJsHost() {
  const bus = emitter();
  const peers = new Map();        // clientId -> wrapper
  let peer = null;
  let pin = null;
  let roomId = null;
  let pinTries = 0;
  let stopped = false;

  /** Wrap a PeerJS DataConnection in the transport's Peer shape. */
  function wrap(conn) {
    return {
      id: (conn.metadata && conn.metadata.clientId) || conn.peer,
      meta: conn.metadata || {},
      raw: conn,
      isOpen: () => !!conn.open,
      send(msg) { try { if (conn.open) conn.send(msg); } catch { /* link gone */ } },
      close() { try { conn.close(); } catch { /* already closed */ } }
    };
  }

  function attach(conn) {
    const p = wrap(conn);
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      peers.set(p.id, p);
      bus.emit('peer', p);
    };

    conn.on('open', announce);
    // PeerJS can fire 'open' before this listener is attached.
    setTimeout(() => { if (conn.open) announce(); }, 600);

    conn.on('data', msg => bus.emit('message', p, msg));
    conn.on('close', () => bus.emit('gone', p));
    conn.on('error', () => bus.emit('gone', p));
  }

  function start(preferredPin) {
    if (stopped) return;
    if (!librariesAvailable()) {
      bus.emit('status', 'off', 'Offline — connection library blocked');
      return;
    }
    bus.emit('status', 'warn', 'Connecting to signaling…');
    try { if (peer && !peer.destroyed) peer.destroy(); } catch { /* ignore */ }

    pin = preferredPin || pin || makePin();
    peer = newPeer(ID_PREFIX + pin);

    peer.on('open', id => {
      roomId = id;
      pinTries = 0;
      bus.emit('status', 'on', 'Room live — players can join');
      bus.emit('ready', { roomId, pin });
    });

    peer.on('connection', attach);

    peer.on('disconnected', () => {
      bus.emit('status', 'warn', 'Signaling dropped — reconnecting…');
      setTimeout(() => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch { /* ignore */ } }, 800);
    });

    peer.on('error', err => {
      const type = err && err.type;
      console.warn('[host]', type, err);
      if (type === 'unavailable-id') {
        // PIN taken — by another host, or by our own id still being released.
        pinTries += 1;
        roomId = null;
        if (pinTries <= 6) pin = makePin();
        bus.emit('status', 'warn', 'PIN in use — picking another…');
        setTimeout(() => start(pin), 900);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        bus.emit('status', 'warn', 'Network hiccup — retrying…');
        setTimeout(() => start(pin), 2500);
      }
    });
  }

  return {
    start,
    stop() { stopped = true; try { peer && peer.destroy(); } catch { /* ignore */ } },
    on: bus.on,
    get pin() { return pin; },
    get roomId() { return roomId; },
    joinUrl() {
      return `${location.protocol}//${location.host}${location.pathname}?pin=${encodeURIComponent(pin || '')}`;
    }
  };
}

/* ------------------------------------------------------------------- player */

export function createPeerJsPlayer() {
  const bus = emitter();
  let peer = null;
  let conn = null;
  let opts = null;
  let retries = 0;
  let retryTimer = null;
  let connecting = false;
  let paused = false;          // true while waiting for a slot in a full room

  function scheduleRetry() {
    if (paused) return;
    clearTimeout(retryTimer);
    const delay = Math.min(RETRY_BASE_MS * Math.pow(RETRY_FACTOR, retries), RETRY_MAX_MS) + Math.random() * 400;
    retries += 1;
    retryTimer = setTimeout(() => { if (opts) open(); }, delay);
  }

  function hardReset() {
    try { if (peer && !peer.destroyed) peer.destroy(); } catch { /* ignore */ }
    peer = null;
    conn = null;
    connecting = false;
    scheduleRetry();
  }

  function openDataConnection() {
    if (!peer || peer.destroyed) return open();
    if (conn) { try { conn.close(); } catch { /* ignore */ } conn = null; }

    let c;
    try {
      c = peer.connect(opts.roomId, {
        reliable: true,
        metadata: { clientId: opts.clientId, alias: opts.alias }
      });
    } catch { return scheduleRetry(); }
    if (!c) return scheduleRetry();
    conn = c;

    const guard = setTimeout(() => {
      if (!c.open) { try { c.close(); } catch { /* ignore */ } scheduleRetry(); }
    }, 9000);

    c.on('open', () => {
      clearTimeout(guard);
      retries = 0;
      paused = false;
      bus.emit('status', 'on', 'Connected');
      bus.emit('open');
    });
    c.on('data', msg => bus.emit('message', msg));
    c.on('close', () => {
      clearTimeout(guard);
      bus.emit('status', 'warn', 'Reconnecting…');
      bus.emit('closed');
      scheduleRetry();
    });
    c.on('error', () => {
      clearTimeout(guard);
      bus.emit('status', 'warn', 'Retrying…');
      scheduleRetry();
    });
  }

  function open() {
    if (!librariesAvailable()) { bus.emit('status', 'off', 'Offline'); return; }
    if (connecting) return;
    connecting = true;
    bus.emit('status', 'warn', 'Connecting…');

    if (!peer || peer.destroyed) {
      peer = newPeer();
      peer.on('open', () => { connecting = false; openDataConnection(); });
      peer.on('disconnected', () => {
        bus.emit('status', 'warn', 'Reconnecting…');
        setTimeout(() => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch { /* ignore */ } }, 700);
      });
      peer.on('error', err => {
        const type = err && err.type;
        console.warn('[player]', type, err);
        connecting = false;
        if (type === 'peer-unavailable') {
          bus.emit('status', 'warn', 'Waiting for host…');
          scheduleRetry();
        } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'].includes(type)) {
          hardReset();
        } else {
          scheduleRetry();
        }
      });
    } else {
      connecting = false;
      openDataConnection();
    }
  }

  // The browser tells us when the radio comes back; take it.
  window.addEventListener('online', () => { if (opts && !paused) { retries = 0; open(); } });

  return {
    connect(options) { opts = options; open(); },
    reconnect() { retries = 0; if (conn) { try { conn.close(); } catch { /* ignore */ } } open(); },
    /** Suppress automatic retries — used while the host says the room is full. */
    pause(ms) {
      paused = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { paused = false; open(); }, ms);
    },
    isOpen: () => !!(conn && conn.open),
    send(msg) {
      try { if (conn && conn.open) { conn.send(msg); return true; } } catch { /* link gone */ }
      return false;
    },
    stop() {
      clearTimeout(retryTimer);
      opts = null;
      try { peer && peer.destroy(); } catch { /* ignore */ }
    },
    on: bus.on
  };
}
