# ADR-001 — How host and players talk to each other

- **Status:** Superseded on 2026-09-17 by the Firebase option below. Peer-to-peer
  is retained as a one-line fallback (`TRANSPORT` in `src/config.js`).
- **Date:** 2026-09-17
- **Context:** ~50 students on personal phones, one host laptop, school Wi-Fi,
  a single evening in December 2026

## Context

The host must broadcast called numbers to about fifty phones and receive claims
back, with sub-second latency, on a network nobody controls. The app is a
volunteer project for one school event; there is no budget, no server to
operate and no engineer on call during the party.

Three options were considered.

**A. Peer-to-peer WebRTC (PeerJS).** Each phone opens a direct data channel to
the host's browser. A public broker introduces the two sides; STUN discovers
routable addresses; TURN relays when a direct path is impossible.

**B. A hosted realtime service** (Firebase Realtime Database, Ably, Supabase).
Every device holds one connection to a cloud service. The host writes state,
players subscribe.

**C. A self-hosted server.** Full control, and a machine to run, secure and pay
for.

## Decision

**Option A, for now.** Nothing to provision, nothing to pay for, no account to
create, and the whole app deploys as static files on GitHub Pages. For an event
three months away run by one person, the setup cost of B and the operational
cost of C are not yet justified.

The transport is isolated behind `src/net/transport.js` so this decision can be
reversed without touching game logic or UI.

## Consequences

**What we accept**

- Every phone must negotiate a path to the host through NAT. Where school Wi-Fi
  enables client isolation — common — no direct path exists and all traffic
  relays through a public TURN server we do not control.
- Two third-party dependencies sit on the critical path at 20:00 on party night:
  the public PeerJS broker and the free TURN relay. Neither offers an SLA, and
  the TURN endpoint in `config.js` should be re-tested before the event.
- The host's browser holds ~50 simultaneous peer connections. Measured app-layer
  cost is negligible (50 joins ≈ 0.6 ms of main-thread work, a call broadcast
  ≈ 2 ms), so the constraint is WebRTC negotiation, not our code.
- Game state lives only in the host's tab. Closing it ends the game — hence
  **Save Full Game State**.

**What we do about it**

- Capacity guard, join jitter, batched state sync and coalesced rendering, so a
  mass join degrades gracefully rather than collapsing (see `config.js`).
- Stable client ids, so a reconnecting phone reattaches to its own roster row.
- Heartbeat with a silent-link watchdog, exponential backoff, and a full state
  snapshot on every reconnection.
- Printed cards and manual winner entry remain first-class, so the game can be
  finished on paper if the network fails entirely.

## Revisited the same day

Trigger 3 fired sooner than expected: the app is intended to be reused, and the
host would rather not spend the evening watching a free TURN relay. A Firebase
project (`acm2-bingo`, Realtime Database in `asia-southeast1`) was created and
`src/net/firebase-transport.js` written against the existing interface.

Nothing in `core/`, `host/`, `player/` or `ui/` changed to accommodate it. Three
small, deliberate adjustments were made at the seams:

1. `host-state.js` now prefers `transport.broadcast()` when the transport has
   one. Firebase publishes a called number as a single write that all 50 phones
   read; looping over players would have cost 50 writes per number.
2. `host.js` skips the heartbeat timeout sweep when `transport.managesPresence`
   is true, because Firebase reports disconnection itself via `onDisconnect` and
   timing players out on missed pings would grey out healthy players.
3. Room-id namespacing moved behind `transport.roomIdFor()` — PeerJS must
   namespace a PIN because its ids are global, Firebase uses it as a path key.

The measured result, against an in-memory stand-in for the database: a called
number costs **2 writes regardless of player count** (the call node and one
history entry), and a full 75-number round costs 152 writes.

## When to revisit (original)

Move to Option B if **any** of these becomes true:

1. A rehearsal on the venue's Wi-Fi shows more than ~10% of phones failing to
   connect or dropping during a round.
2. The public PeerJS broker or the free TURN relay proves unreliable or
   disappears.
3. The app is reused beyond a single evening — a recurring class activity makes
   the one-off setup cost of a hosted backend clearly worth paying.
4. Player numbers exceed ~60, where a single browser holding every connection
   stops being comfortable.

## Migration sketch (Option B, Firebase Realtime Database)

The free Spark plan allows 100 simultaneous connections, 1 GB stored and 10 GB
downloaded per month — ample for 50 students exchanging a few hundred bytes per
call. The work is:

1. Create a project; create a Realtime Database in `asia-southeast1` (closest to
   Bangkok); write rules scoped to one game path.
2. Add `src/net/firebase-transport.js` exporting `createFirebaseHost()` and
   `createFirebasePlayer()` satisfying the interface in `transport.js`.
3. Set `TRANSPORT = 'firebase'` in `config.js`.

No changes to `core/`, `host/`, `player/` or `ui/`. The protocol in
`core/protocol.js` carries over unchanged — that is the whole point of the
interface.

Two caveats to record now: the Firebase config values live in the client and
will be public in the repository (normal for Firebase — they are identifiers,
not credentials, and the database rules are what protect the data); and student
nicknames would then be stored in a cloud database, so use nicknames rather than
full names or student IDs, and delete the database after the event.
