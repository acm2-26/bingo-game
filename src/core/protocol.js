/**
 * The wire protocol between host and players.
 *
 * Any transport implementation must carry these messages unchanged — that is
 * what makes the transport swappable (see net/transport.js). Keep this list in
 * sync on both sides; nothing else in the codebase should contain a raw
 * message-type string.
 */

export const MSG = {
  /* player -> host */
  HELLO: 'HELLO',                     // {clientId, alias} — identify / re-identify
  PING: 'PING',                       // {clientId, alias, t} — presence heartbeat
  BINGO: 'BINGO',                     // {clientId, alias, card, marks} — claim a win

  /* host -> player */
  PONG: 'PONG',                       // {t} — heartbeat reply
  STATE: 'STATE',                     // full snapshot; sent on every (re)connect
  CALL: 'CALL',                       // {number}
  PATTERN: 'PATTERN',                 // {pattern}
  LIMIT: 'LIMIT',                     // {maxWinners}
  ROUND_RESET: 'ROUND_RESET',         // {round, pattern, maxWinners}
  STARTED: 'STARTED',                 // {round} — the host pressed Begin
  BINGO_ACCEPTED: 'BINGO_ACCEPTED',   // {rank}
  BINGO_REJECTED: 'BINGO_REJECTED',   // {reason}
  SOMEONE_WON: 'SOMEONE_WON',         // {alias, rank} — for the other players
  ROOM_FULL: 'ROOM_FULL'              // {capacity} — try again shortly
};

/** Build the STATE snapshot a joining or reconnecting player needs. */
export function stateSnapshot(game) {
  return {
    type: MSG.STATE,
    round: game.round,
    pattern: game.pattern,
    drawn: game.drawn,
    last: game.last,
    maxWinners: game.maxWinners,
    winners: game.winners
      .filter(w => w.round === game.round)
      .map(w => ({ alias: w.alias, rank: w.rank, clientId: w.clientId }))
  };
}
