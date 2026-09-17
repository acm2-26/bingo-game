/**
 * Single place for every tunable value in the game.
 *
 * Nothing here touches the DOM, so it is safe to import from tests.
 */

export const GAME_VERSION = 'v4.6';

/** Which transport implementation net/transport.js should build.
 *  'firebase' — central Realtime Database; survives NAT, sleep and Wi-Fi changes
 *  'peerjs'   — browser-to-browser WebRTC; no account needed, fragile on school Wi-Fi
 *
 *  Changing this one line is the whole switch. See docs/ADR-001-transport.md.
 *  If Firebase misbehaves during a rehearsal, set this back to 'peerjs' and
 *  republish — nothing else needs to change.
 */
export const TRANSPORT = 'firebase';

/* ---------- Firebase (used only when TRANSPORT === 'firebase') ---------- */

/** Project: acm2-bingo · Realtime Database in asia-southeast1 (Singapore).
 *
 *  These values are identifiers, not secrets — Google intends them to ship in
 *  client code, and they are useless without the published security rules in
 *  firebase/database.rules.json, which is what actually protects the data.
 *  The private key under Project settings → Service accounts IS a secret and
 *  must never appear in this repository. */
export const FIREBASE = {
  apiKey: 'AIzaSyAfyIGb6zogXyCcJ-nG_w67-B11H7daQNk',
  authDomain: 'acm2-bingo.firebaseapp.com',
  databaseURL: 'https://acm2-bingo-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'acm2-bingo',
  storageBucket: 'acm2-bingo.firebasestorage.app',
  messagingSenderId: '997296723537',
  appId: '1:997296723537:web:61513cdfdf54571b834a70'
};

/** Pinned so a future SDK release cannot change behaviour under us mid-term. */
export const FIREBASE_SDK_VERSION = '12.19.0';

/** Root path for all games, so the database can be cleared in one action. */
export const FIREBASE_ROOT = 'games';

/** Player heartbeats only refresh a "last seen" stamp; presence itself comes
 *  from onDisconnect, so this can be slow and still be accurate. */
export const FIREBASE_LASTSEEN_THROTTLE_MS = 30000;

/* ---------- room ---------- */

/** Students type a 6-digit PIN. It is namespaced before use as a PeerJS id,
 *  because PeerJS ids are global across every app on the public broker —
 *  a bare "482106" would collide with strangers. */
export const ID_PREFIX = 'acm2bingo-';

/** Players beyond this are told to wait and admitted as slots free up. */
export const DEFAULT_CAPACITY = 50;
export const CAPACITY_OPTIONS = [20, 30, 40, 50, 60, 80, 100];
export const MAX_WINNERS_OPTIONS = 50;

/* ---------- presence ---------- */

/** How often a player pings the host. */
export const HB_INTERVAL = 5000;
/** No ping for this long and the host shows the player as offline. */
export const OFFLINE_AFTER = 17000;
/** Missed pongs before the player forces a reconnect. */
export const PONG_TIMEOUT = HB_INTERVAL * 3.6;

/* ---------- connection ---------- */

/** Lean ICE. With ~50 simultaneous connections on the host, every extra
 *  STUN/TURN entry multiplies candidate gathering. Two STUN + two TURN
 *  transports is the smallest set that still covers restrictive school and
 *  mobile networks. Replace TURN_SERVERS with your own relay if you obtain one. */
export const TURN_SERVERS = [
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

export const STUN_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

export const PEER_OPTIONS = {
  debug: 1,
  config: {
    iceServers: [...STUN_SERVERS, ...TURN_SERVERS],
    iceCandidatePoolSize: 0,   // no speculative pre-gathering — matters at 50 peers
    iceTransportPolicy: 'all'
  }
};

/** Reconnect backoff for players. */
export const RETRY_BASE_MS = 1200;
export const RETRY_FACTOR = 1.6;
export const RETRY_MAX_MS = 8000;
/** How long a player waits before retrying after a ROOM_FULL reply. */
export const ROOM_FULL_RETRY_MS = 8000;

/* ---------- fallback CDNs (used only if the primary script tags fail) ---------- */
export const FALLBACK_CDN = {
  peerjs: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
};
