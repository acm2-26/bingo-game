/** Player runtime state, in its own module so card-view.js and player.js can
 *  share it without importing each other. */

export const P = {
  transport: null,
  roomId: null,
  pin: null,
  alias: 'Guest',

  /** @type {number[][]} */ card: [],
  /** @type {boolean[][]} */ marks: [],
  /** Numbers the host has actually called — the basis for every mark. */
  drawn: new Set(),
  /** Cells highlighted by the last evaluation, so only those need clearing. */
  lastHits: [],

  cardRevealed: false, // lobby has stepped aside; do not re-cover the card
  ready: false,        // card completes the pattern
  claimed: false,      // this round's win already accepted
  waitingForSlot: false,
  lastPong: 0,
  heartbeat: null,
  wakeLock: null
};
