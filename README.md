# ⚡ AC M2 Magical Bingo — Christmas 2026

Hogwarts-themed multiplayer bingo. The host runs the caller on a laptop and
projects it; students join from their phones with a 6-digit Game PIN. Printed
cards are supported alongside phones, so nobody is excluded.

---

## Running it

The app is plain ES modules — no build step, no npm install to play. But
browsers refuse ES modules over `file://`, so it **must be served over http(s)**.

**Locally**

```bash
cd bingo
python3 -m http.server 8000     # or: npm run serve
# open http://localhost:8000
```

**Networking**

`TRANSPORT` in `src/config.js` selects how host and players talk:

| Value | What it uses | When |
|---|---|---|
| `'firebase'` *(current)* | Firebase Realtime Database, Singapore region | the event — survives NAT, sleep and Wi-Fi changes |
| `'peerjs'` | browser-to-browser WebRTC | fallback; needs no account, but fragile on school Wi-Fi |

Switching is that one line and a republish. The database rules live in
`firebase/database.rules.json` and must be published in the Firebase console;
the node layout and its bandwidth reasoning are in `firebase/DATA-MODEL.md`.

Firebase requires **Anonymous** sign-in to be enabled in the console
(Authentication → Sign-in method). Without it every read and write is denied.

**Published (GitHub Pages)**

Push this folder to a public repository, then Settings → Pages → Deploy from a
branch → `main` → `/ (root)`. The site appears at
`https://<user>.github.io/<repo>/`.

Two things worth doing once:

- keep the empty `.nojekyll` file — without it, Pages runs Jekyll and ignores
  files beginning with an underscore;
- after each push, check the version badge on the mode-select screen. If it is
  older than what you published, you are seeing a cached copy — hard-reload with
  <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>, or append `?v=2` to the URL.

**Offline fallback:** `bingo-v2.5-standalone.html` (beside this folder) is the
previous single-file build, frozen and verified. It runs from a USB stick with
no server. Keep it for the event.

---

## Running the tests

```bash
npm test          # node --test tests/*.test.js
```

The game rules — card generation, pattern detection, claim validation, round
state — are pure functions in `src/core/` with no DOM dependency, so they run in
Node in under a second and need no browser.

---

## Project layout

```
index.html                markup only; no inline handlers, no inline styles
styles/
  tokens.css              the Hogwarts theme — colours, fonts, spacing
  base.css                reset, buttons, inputs, modals, toast, celebration
  host.css                host screen and the full-screen caller
  player.css              player screen, board, lobby
  print.css               printable cards (print media only)
src/
  config.js               every tunable value: capacity, timings, ICE, CDNs
  main.js                 entry point; maps data-action names to functions
  core/                   PURE — no DOM, fully unit-tested
    numbers.js            letters, call strings, card generation
    patterns.js           the four winning patterns
    validation.js         claim verification (the referee)
    state.js              round, called numbers, winners
    protocol.js           the host↔player message contract
  net/
    transport.js          the transport interface + factory
    firebase-transport.js Realtime Database implementation (active)
    peerjs-transport.js   WebRTC implementation (fallback)
  host/                   host-state, host controller, roster, caller,
                          fullscreen, winners, activity, persistence
  player/                 player-state, player controller, card-view, lobby
  ui/                     screens, toast, sound, celebrate
  print/cards.js          batch-rendered printable cards
firebase/
  database.rules.json     security rules — paste into the console
  DATA-MODEL.md           node layout and why it is shaped that way
tests/                    node --test suites for core/
docs/ADR-001-transport.md why the transport is the way it is
```

**The rule that keeps this tidy:** `core/` never imports from `ui/`, `host/`,
`player/` or `net/`. Dependencies point inward. If you find yourself wanting to
call `toast()` from `core/`, the logic belongs somewhere else.

---

## How a game works

1. Host opens the page and presses **Host Game**. A 6-digit PIN and QR code appear.
2. Students scan the QR (or type the PIN), enter a name, and land in the lobby.
3. Host picks a pattern and a winner limit, then presses **Draw Next Number**
   (or <kbd>Space</kbd>). Use **⛶ Full Screen** to project the caller.
4. Students tap numbers as they are called. They *cannot* tap a number that has
   not been called — the app refuses it, and the host re-checks every claim.
5. On a completed pattern the **CLAIM BINGO!** button lights up. The host
   verifies the card, records the winner and everyone sees the celebration.
6. **Start Next Round** deals fresh cards to everyone.

Paper players are supported throughout: print cards in advance from the mode
screen, and enter their names with **Add** in the winners panel.

---

## Operating notes for the day

- Host on mains power, wired Ethernet if available, with only that tab open.
- Room capacity defaults to 50. Players beyond it are told to wait and are
  admitted automatically as slots free up.
- A phone that locks, drops off or switches networks keeps its identity and
  rejoins its own roster row — no duplicate entries.
- **Undo** puts the last call back if you mis-call a number.
- **Export Round Report** and **Save Full Game State** produce plain JSON.
- Rehearse on the actual venue Wi-Fi with a handful of real phones before the
  day. The network, not the code, is what fails first — see the ADR.

---

## Changing things

| I want to… | Edit |
|---|---|
| change colours, fonts, spacing | `styles/tokens.css` |
| change room capacity or timings | `src/config.js` |
| use my own TURN server | `TURN_SERVERS` in `src/config.js` |
| add a winning pattern | `src/core/patterns.js` (+ a test, + the rules modal) |
| change what the host sees | `src/host/` |
| change what students see | `src/player/` |
| swap the networking | set `TRANSPORT` in `src/config.js` |
| change the database rules | `firebase/database.rules.json`, then publish in the console |
