# Firebase data model

Database: `https://acm2-bingo-default-rtdb.asia-southeast1.firebasedatabase.app/`
Region: `asia-southeast1` (Singapore) · Plan: Spark (no-cost)

## Shape

```
/games/{pin}/
  meta/      { hostUid, createdAt, round, pattern, maxWinners, capacity }
  call/      { n, seq, round, at }   ← every phone watches ONLY this node
  history/   { <round>: { <seq>: n } }  ← read once when joining, never watched
  winners/   { <rank>: { alias, clientId, round, pattern, at } }
  players/   { <clientId>: { alias, uid, joinedAt, online, lastSeen } }
  claims/    { <clientId>: { card, marks, round, uid, at } }
  results/   { <clientId>: { ok, rank, round, reason, at } }
```

## Round synchronisation

`meta/round` is the single source of truth. Every phone subscribes to it; when it
changes, the player deals a fresh card, clears its marks and shows the lobby
until the first call of the new round arrives. No message needs to be delivered
reliably for this to work — a phone that was asleep through the whole round
change reads the current value the moment it reconnects and catches up.

Two guards make round boundaries safe:

- **`call.round`** — a player applies a call only when it matches the round it is
  currently playing. A call still sitting in the node from the previous round,
  or one that arrives while the player is mid-transition, is discarded instead of
  marking a square on the new card.
- **`claims` and `results` carry `round`** — so a claim submitted a fraction of a
  second before the host advances the round is judged against the round it was
  made in, and cannot be counted twice.

`history` is keyed by round for the same reason: a player joining mid-game reads
`history/{currentRound}` and gets exactly the numbers that apply to the card it
is holding.

## Why `call` and `history` are separate

This is the single decision that determines the bandwidth bill.

Realtime Database sends the **whole node** to every listener whenever any part of
it changes. If the growing list of called numbers lived inside the node that all
50 phones subscribe to, every call would re-send the entire history to everyone,
and download would grow quadratically:

| | Data sent over a 75-call round, 50 players |
|---|---|
| History inside the watched node | ~7 MB per round → ~70 MB for 10 rounds |
| `call` alone watched (this model) | ~0.5 MB per round → ~5 MB for 10 rounds |

`call` holds three numbers and nothing else, so each call costs roughly 150 bytes
per phone. `history` is read once on join, which is exactly when a reconnecting
player needs it.

Estimated total for the event (10 rounds × 50 players): **~5–7 MB** against the
Spark allowance of 10 GB per month.

## Who may write what

Enforced by `database.rules.json`, not by the client:

| Path | Host | Player |
|---|---|---|
| `meta` | write (first writer claims `hostUid`) | read |
| `call`, `history`, `winners` | write | read |
| `results` | write | read |
| `players/{clientId}` | write | write own only |
| `claims/{clientId}` | read | write own only |

`meta/hostUid` is claimed by whoever creates the game first and can only be
rewritten by that same account, so a student cannot take over a running game or
call numbers. Validation rules also cap the ranges — a called number must be
1-75, an alias must be 1-24 characters — so a modified client cannot write
nonsense into the game.

**Claims are still refereed by the host**, exactly as in the peer-to-peer build:
a player writes their card and marks to `claims/{clientId}`, and the host reads
it, runs `core/validation.js` against the numbers actually called, and writes the
verdict to `results/{clientId}`. Firebase rules cannot check a bingo pattern;
they only stop a player writing somewhere they shouldn't.

## Known limits accepted for this event

- A player could in principle overwrite another player's `players` or `claims`
  entry if they knew that student's client id. The damage is limited to a
  rejected claim, and the host still verifies every win. Closing it properly
  needs per-client ids keyed by uid, which is more moving parts than a school
  game warrants.
- Anonymous authentication means every device gets an identity, but not a
  verified one. That is what makes the rules meaningful without asking fifty
  students to create accounts.

## Housekeeping

Delete `/games` after the event. Student nicknames should not sit in a cloud
database longer than the party needs them.
