/**
 * Firebase Realtime Database implementation of the transport contract.
 *
 * Every device holds one connection to Google's servers. No NAT traversal, no
 * relay, and a phone that sleeps or changes network resyncs from the database
 * instead of renegotiating a link.
 *
 * The protocol in core/protocol.js is message-based; Realtime Database is
 * state-based. This file is the adapter between the two, and it is the only
 * place in the codebase that knows the difference. The node layout it reads and
 * writes is documented in firebase/DATA-MODEL.md.
 *
 *   host writes            players read
 *   ─────────────────────────────────────────────
 *   meta/     round, pattern, maxWinners   → STATE / PATTERN / LIMIT / ROUND_RESET
 *   call/     { n, seq, round }            → CALL
 *   history/{round}/                       → the drawn list inside STATE
 *   winners/                               → SOMEONE_WON
 *   results/{clientId}                     → BINGO_ACCEPTED / REJECTED / ROOM_FULL
 *
 *   players write          host reads
 *   ─────────────────────────────────────────────
 *   players/{clientId}                     → a peer appearing, or going offline
 *   claims/{clientId}                      → BINGO
 */

import {
  FIREBASE, FIREBASE_SDK_VERSION, FIREBASE_ROOT,
  FIREBASE_LASTSEEN_THROTTLE_MS, DEFAULT_CAPACITY
} from '../config.js';
import { MSG } from '../core/protocol.js';
import { emitter } from './transport.js';

/* ------------------------------------------------------------- SDK loading */

let sdk = null;

/** Load the modular SDK straight from Google's CDN — no bundler involved.
 *  Tests replace this by setting window.__firebaseSdkStub. */
async function loadSdk() {
  if (sdk) return sdk;
  if (typeof window !== 'undefined' && window.__firebaseSdkStub) {
    sdk = window.__firebaseSdkStub;
    return sdk;
  }
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [app, auth, db] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`)
  ]);
  sdk = { app, auth, db };
  return sdk;
}

let connection = null;

/** One app, one anonymous sign-in, shared by whichever role this tab is playing. */
async function connect() {
  if (connection) return connection;
  const { app, auth, db } = await loadSdk();

  const application = app.initializeApp(FIREBASE);
  const authentication = auth.getAuth(application);
  const database = db.getDatabase(application);

  const credential = await auth.signInAnonymously(authentication);
  const uid = credential?.user?.uid || authentication.currentUser?.uid;
  if (!uid) throw new Error('Anonymous sign-in returned no user');

  connection = { db, database, uid };
  return connection;
}

const makePin = () => String(Math.floor(100000 + Math.random() * 900000));

/** Realtime Database keys may not contain . # $ [ ] or / — digits are safe. */
export const firebaseRoomId = pin => String(pin).trim().replace(/[.#$[\]/]/g, '');

/* ------------------------------------------------------------------- host */

export function createFirebaseHost() {
  const bus = emitter();
  const peers = new Map();          // clientId -> peer wrapper
  const online = new Map();         // clientId -> boolean

  let api = null;                   // the database module namespace
  let database = null;
  let uid = null;
  let pin = null;
  let root = null;
  let stopped = false;

  let round = 1;
  let pattern = 'LINE';
  let maxWinners = 1;
  let seq = 0;
  let lastHistoryWritten = -1;      // guards against re-writing history per peer

  const path = child => api.ref(database, `${FIREBASE_ROOT}/${pin}/${child}`);

  async function start(preferredPin) {
    if (stopped) return;
    bus.emit('status', 'warn', 'Connecting to Firebase…');

    try {
      const c = await connect();
      api = c.db;
      database = c.database;
      uid = c.uid;
    } catch (err) {
      console.error('[firebase host]', err);
      bus.emit('status', 'off', 'Cannot reach Firebase — check the network');
      return;
    }

    pin = preferredPin || pin || makePin();
    root = `${FIREBASE_ROOT}/${pin}`;

    // Claim the PIN. If another host already owns it, take a different one.
    try {
      const existing = await api.get(path('meta'));
      if (existing.exists() && existing.val().hostUid && existing.val().hostUid !== uid) {
        bus.emit('status', 'warn', 'PIN in use — picking another…');
        pin = makePin();
        return start(pin);
      }
      await api.set(path('meta'), {
        hostUid: uid,
        createdAt: Date.now(),
        round, pattern, maxWinners,
        capacity: DEFAULT_CAPACITY
      });
    } catch (err) {
      console.error('[firebase host] claim failed', err);
      bus.emit('status', 'off', 'Could not create the game — check the database rules');
      return;
    }

    watchConnection();
    watchPlayers();
    watchClaims();

    bus.emit('status', 'on', 'Room live — players can join');
    bus.emit('ready', { roomId: pin, pin });
  }

  function watchConnection() {
    api.onValue(api.ref(database, '.info/connected'), snap => {
      if (snap.val()) bus.emit('status', 'on', 'Room live — players can join');
      else bus.emit('status', 'warn', 'Offline — reconnecting…');
    });
  }

  /** A player node appearing, or its online flag changing, is this transport's
   *  equivalent of a connection opening and closing. */
  function watchPlayers() {
    const handle = (key, value) => {
      if (!value) return;
      const wasOnline = online.get(key) === true;
      const isOnline = value.online !== false;
      online.set(key, isOnline);

      let peer = peers.get(key);
      if (!peer) {
        peer = makePeer(key, value);
        peers.set(key, peer);
      }
      peer.meta = { clientId: key, alias: value.alias };

      if (isOnline) bus.emit('peer', peer);
      else if (wasOnline) bus.emit('gone', peer);
    };

    api.onChildAdded(path('players'), s => handle(s.key, s.val()));
    api.onChildChanged(path('players'), s => handle(s.key, s.val()));
    api.onChildRemoved(path('players'), s => {
      const peer = peers.get(s.key);
      if (peer) { online.set(s.key, false); bus.emit('gone', peer); }
    });
  }

  function watchClaims() {
    const handle = (key, value) => {
      if (!value) return;
      const peer = peers.get(key);
      if (!peer) return;
      bus.emit('message', peer, {
        type: MSG.BINGO,
        clientId: key,
        alias: peer.meta.alias,
        round: value.round,
        card: value.card,
        marks: value.marks
      });
    };
    api.onChildAdded(path('claims'), s => handle(s.key, s.val()));
    api.onChildChanged(path('claims'), s => handle(s.key, s.val()));
  }

  function makePeer(clientId, value) {
    return {
      id: clientId,
      meta: { clientId, alias: value.alias },
      isOpen: () => online.get(clientId) === true,
      send: msg => sendTo(clientId, msg),
      close: () => api.update(path(`players/${clientId}`), { online: false }).catch(() => {})
    };
  }

  /** Per-player messages become a write under results/{clientId}. */
  function sendTo(clientId, msg) {
    if (!msg || !api) return;
    switch (msg.type) {
      case MSG.BINGO_ACCEPTED:
        write(path(`results/${clientId}`), { ok: true, rank: msg.rank, round, at: Date.now() });
        break;
      case MSG.BINGO_REJECTED:
        write(path(`results/${clientId}`), { ok: false, reason: msg.reason, round, at: Date.now() });
        break;
      case MSG.ROOM_FULL:
        write(path(`results/${clientId}`), { ok: false, roomFull: true, capacity: msg.capacity, round, at: Date.now() });
        break;
      case MSG.STATE:
        // State already lives in the database; make sure it is current, once.
        syncState(msg);
        break;
      case MSG.PONG:
      default:
        break;   // presence is handled by the database, not by pings
    }
  }

  /** Broadcasts are written once, not once per player — this is the difference
   *  between 1 write and 50 for every number called. */
  function broadcast(msg) {
    if (!msg || !api) return;
    switch (msg.type) {
      case MSG.CALL: {
        seq += 1;
        write(path('call'), { n: msg.number, seq, round, at: Date.now() });
        write(path(`history/${round}/${seq}`), msg.number);
        break;
      }
      case MSG.PATTERN:
        pattern = msg.pattern;
        write(path('meta/pattern'), pattern);
        break;
      case MSG.LIMIT:
        maxWinners = msg.maxWinners;
        write(path('meta/maxWinners'), maxWinners);
        break;
      case MSG.ROUND_RESET:
        round = msg.round;
        pattern = msg.pattern;
        maxWinners = msg.maxWinners;
        seq = 0;
        lastHistoryWritten = -1;
        write(path('call'), null);
        api.update(path('meta'), { round, pattern, maxWinners }).catch(report);
        break;
      case MSG.SOMEONE_WON:
        write(path(`winners/${round}_${msg.rank}`), {
          alias: msg.alias, rank: msg.rank, round, clientId: msg.clientId || null, at: Date.now()
        });
        break;
      case MSG.STATE:
        syncState(msg);
        break;
      default:
        break;
    }
  }

  /** Push the host's authoritative state into the database. Idempotent: called
   *  once per joining player, but only writes when something actually differs. */
  function syncState(state) {
    const changed = state.round !== round || state.pattern !== pattern || state.maxWinners !== maxWinners;
    round = state.round;
    pattern = state.pattern;
    maxWinners = state.maxWinners ?? maxWinners;
    if (changed) api.update(path('meta'), { round, pattern, maxWinners }).catch(report);

    // After an undo or a restored save the history may no longer match.
    const drawn = state.drawn || [];
    if (drawn.length !== lastHistoryWritten) {
      lastHistoryWritten = drawn.length;
      const history = {};
      drawn.forEach((n, i) => { history[i + 1] = n; });
      seq = drawn.length;
      write(path(`history/${round}`), Object.keys(history).length ? history : null);
      if (state.last) write(path('call'), { n: state.last, seq, round, at: Date.now() });
    }
  }

  const report = err => console.warn('[firebase host]', err);
  const write = (ref, value) => api.set(ref, value).catch(report);

  return {
    start,
    stop() {
      stopped = true;
      if (api && pin) api.set(path('meta/hostUid'), uid).catch(() => {});
    },
    on: bus.on,
    broadcast,
    /** Presence comes from onDisconnect, so host.js must not time players out. */
    managesPresence: true,
    get pin() { return pin; },
    get roomId() { return pin; },
    joinUrl() {
      return `${location.protocol}//${location.host}${location.pathname}?pin=${encodeURIComponent(pin || '')}`;
    }
  };
}

/* ----------------------------------------------------------------- player */

export function createFirebasePlayer() {
  const bus = emitter();

  let api = null;
  let database = null;
  let uid = null;
  let pin = null;
  let clientId = null;
  let alias = null;

  let connected = false;
  let opened = false;
  let paused = false;
  let pauseTimer = null;

  let myRound = null;
  let lastSeq = -1;
  let notFoundTimer = null;
  let lastPattern = null;
  let lastLimit = null;
  let lastSeenWrite = 0;
  let detachers = [];
  let lastError = null;      // diagnostics only
  let lastCallSeen = null;
  let skipped = null;

  const path = child => api.ref(database, `${FIREBASE_ROOT}/${pin}/${child}`);
  const me = () => path(`players/${clientId}`);

  async function connectPlayer(options) {
    pin = firebaseRoomId(options.roomId);
    clientId = options.clientId;
    alias = options.alias;

    bus.emit('status', 'warn', 'Connecting…');
    try {
      const c = await connect();
      api = c.db;
      database = c.database;
      uid = c.uid;
    } catch (err) {
      console.error('[firebase player]', err);
      bus.emit('status', 'off', 'Cannot reach Firebase');
      return;
    }

    try {
      await api.set(me(), { alias, uid, joinedAt: Date.now(), online: true, lastSeen: Date.now() });
    } catch (err) {
      lastError = `join failed: ${err && (err.code || err.message)}`;
      console.error('[firebase player] join failed', err);
      bus.emit('status', 'off', `Could not join — ${err && (err.code || err.message)}`);
      return;
    }

    watchConnection();
    watchMeta();
    watchCall();
    watchResults();
    watchWinners();

    // A player can write its own node into a game that does not exist, so a
    // wrong PIN otherwise looks exactly like a game that has not started yet.
    // If no state has arrived shortly after joining, say so — and keep the
    // watchers running, so it recovers by itself if the host opens late.
    notFoundTimer = setTimeout(() => {
      if (myRound === null) {
        bus.emit('status', 'warn', `Game ${pin} not found — check the PIN`);
        bus.emit('notfound', pin);
      }
    }, 6000);
  }

  function watchConnection() {
    track(api.onValue(api.ref(database, '.info/connected'), async snap => {
      const up = !!snap.val();
      if (up && !connected) {
        connected = true;
        // Re-assert presence and arrange for it to be cleared if we vanish.
        api.onDisconnect(me()).update({ online: false }).catch(() => {});
        api.update(me(), { online: true, lastSeen: Date.now() }).catch(() => {});
        bus.emit('status', 'on', 'Connected');
        if (!opened) { opened = true; bus.emit('open'); }
        else await resync();          // catch up after being away
      } else if (!up && connected) {
        connected = false;
        bus.emit('status', 'warn', 'Reconnecting…');
      }
    }));
  }

  /** meta drives round changes, pattern changes and the winner limit. */
  function watchMeta() {
    track(api.onValue(path('meta'), async snap => {
      const meta = snap.val();
      if (!meta) return;

      if (myRound === null) {
        await emitFullState(meta);
        return;
      }
      if (meta.round !== myRound) {
        myRound = meta.round;
        lastSeq = -1;
        lastPattern = meta.pattern;
        lastLimit = meta.maxWinners;
        bus.emit('message', {
          type: MSG.ROUND_RESET, round: meta.round, pattern: meta.pattern, maxWinners: meta.maxWinners
        });
        return;
      }
      if (meta.pattern !== lastPattern) {
        lastPattern = meta.pattern;
        bus.emit('message', { type: MSG.PATTERN, pattern: meta.pattern });
      }
      if (meta.maxWinners !== lastLimit) {
        lastLimit = meta.maxWinners;
        bus.emit('message', { type: MSG.LIMIT, maxWinners: meta.maxWinners });
      }
    }));
  }

  /** Read everything a card needs and hand it over as one STATE message.
   *  Any failure here leaves myRound unset, which silently drops every call —
   *  so failures are reported loudly rather than swallowed. */
  async function emitFullState(meta) {
    let history, winners, call;
    try {
      [history, winners, call] = await Promise.all([
        api.get(path(`history/${meta.round}`)),
        api.get(path('winners')),
        api.get(path('call'))
      ]);
    } catch (err) {
      lastError = `read failed: ${err && (err.code || err.message)}`;
      console.error('[firebase player] state read failed', err);
      bus.emit('status', 'off', 'Cannot read the game — check the database rules');
      return;
    }

    clearTimeout(notFoundTimer);
    // Clear any earlier "not found" message now that real state has arrived.
    if (connected) bus.emit('status', 'on', 'Connected');
    // Coerce: a round that arrived as a string would fail every call's
    // `call.round !== myRound` check and drop numbers for the whole game.
    myRound = Number(meta.round);
    lastPattern = meta.pattern;
    lastLimit = meta.maxWinners;

    // Realtime Database turns contiguous numeric keys into a JS array with a
    // leading null (our sequence starts at 1), so filter rather than trust the
    // shape. Without this, `null` lands in the called-numbers set and the very
    // first square a player taps is refused.
    const drawn = history.exists()
      ? Object.values(history.val()).filter(n => typeof n === 'number')
      : [];
    const callValue = call.exists() ? call.val() : null;
    lastSeq = callValue && callValue.round === meta.round ? callValue.seq : -1;

    const mine = [];
    if (winners.exists()) {
      Object.values(winners.val()).forEach(w => {
        if (w && w.round === meta.round) mine.push({ alias: w.alias, rank: w.rank, clientId: w.clientId });
      });
    }

    bus.emit('message', {
      type: MSG.STATE,
      round: meta.round,
      pattern: meta.pattern,
      maxWinners: meta.maxWinners,
      drawn,
      last: callValue && callValue.round === meta.round ? callValue.n : null,
      winners: mine
    });
  }

  async function resync() {
    const snap = await api.get(path('meta'));
    if (!snap.exists()) return;
    myRound = null;
    await emitFullState(snap.val());
  }

  function watchCall() {
    track(api.onValue(path('call'), snap => {
      const call = snap.val();
      if (!call) return;
      lastCallSeen = call;

      const round = Number(call.round);
      const seq = Number(call.seq);

      if (myRound === null) { skipped = 'state not synced yet'; return; }
      if (round !== myRound) { skipped = `round ${round} ≠ mine ${myRound}`; return; }
      if (seq <= lastSeq) { skipped = `seq ${seq} ≤ ${lastSeq}`; return; }

      skipped = null;
      lastSeq = seq;
      bus.emit('message', { type: MSG.CALL, number: Number(call.n) });
    }));
  }

  function watchResults() {
    track(api.onValue(path(`results/${clientId}`), snap => {
      const result = snap.val();
      if (!result) return;
      if (result.roomFull) {
        bus.emit('message', { type: MSG.ROOM_FULL, capacity: result.capacity });
        return;
      }
      if (result.round !== myRound) return;
      if (result.ok) bus.emit('message', { type: MSG.BINGO_ACCEPTED, rank: result.rank });
      else bus.emit('message', { type: MSG.BINGO_REJECTED, reason: result.reason });
    }));
  }

  function watchWinners() {
    track(api.onChildAdded(path('winners'), snap => {
      const winner = snap.val();
      if (!winner || winner.round !== myRound) return;
      if (winner.clientId === clientId) return;      // our own win has its own path
      bus.emit('message', { type: MSG.SOMEONE_WON, alias: winner.alias, rank: winner.rank });
    }));
  }

  const track = detach => { if (typeof detach === 'function') detachers.push(detach); };

  function send(msg) {
    if (!api || !msg) return false;
    switch (msg.type) {
      case MSG.HELLO:
        // Identity was established by writing the player node on connect.
        api.update(me(), { alias: msg.alias, uid, online: true, lastSeen: Date.now() }).catch(() => {});
        return true;

      case MSG.PING: {
        // Presence is real-time via onDisconnect; this only keeps the host's
        // "joined at / last seen" column honest, so it can be slow.
        const now = Date.now();
        if (now - lastSeenWrite > FIREBASE_LASTSEEN_THROTTLE_MS) {
          lastSeenWrite = now;
          api.update(me(), { lastSeen: now, alias: msg.alias }).catch(() => {});
        }
        return true;
      }

      case MSG.BINGO:
        api.set(path(`claims/${clientId}`), {
          card: msg.card, marks: msg.marks, round: myRound, uid, at: Date.now()
        }).catch(err => {
          console.warn('[firebase player] claim failed', err);
          bus.emit('message', { type: MSG.BINGO_REJECTED, reason: 'Could not reach the host' });
        });
        return true;

      default:
        return false;
    }
  }

  return {
    connect: connectPlayer,
    reconnect() {
      if (paused) return;
      resync().catch(() => {});
    },
    pause(ms) {
      paused = true;
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => { paused = false; resync().catch(() => {}); }, ms);
    },
    isOpen: () => connected,
    send,
    stop() {
      clearTimeout(pauseTimer);
      clearTimeout(notFoundTimer);
      detachers.forEach(off => { try { off(); } catch { /* ignore */ } });
      detachers = [];
      if (api && clientId) api.update(me(), { online: false }).catch(() => {});
    },
    on: bus.on,
    managesPresence: true,
    /** Live state for the on-screen ?debug=1 panel. */
    stats: () => ({
      pin, uid, connected, myRound, lastSeq,
      call: lastCallSeen, skipped, error: lastError
    })
  };
}
