/**
 * Game state and the operations that mutate it.
 *
 * The host owns the authoritative copy; players keep a mirror that the host
 * refreshes with a STATE snapshot on every (re)connection. Both import this
 * module so the two sides can never disagree about what a "round" means.
 *
 * Pure apart from the shared object itself — no DOM. Covered by tests/state.test.js.
 */

import { newDeck } from './numbers.js';

/** @typedef {{round:number, rank:number, alias:string, clientId:string|null,
 *             pattern:string, timestamp:string, verified:boolean, source:'app'|'paper'}} Winner */

export const game = {
  round: 1,
  pattern: 'LINE',
  maxWinners: 1,
  available: newDeck(),   // not yet called this round
  drawn: [],              // called, in order
  last: null,             // most recent call
  winners: /** @type {Winner[]} */ ([])
};

/** Draw one number at random. Returns null when the round is exhausted. */
export function drawNumber(state = game, rng = Math.random) {
  if (!state.available.length) return null;
  const i = Math.floor(rng() * state.available.length);
  const n = state.available.splice(i, 1)[0];
  state.drawn.push(n);
  state.last = n;
  return n;
}

/** Put the most recent call back in the pool. Returns it, or null. */
export function undoDraw(state = game) {
  if (!state.drawn.length) return null;
  const n = state.drawn.pop();
  state.available.push(n);
  state.last = state.drawn[state.drawn.length - 1] ?? null;
  return n;
}

/** Advance to the next round, clearing calls but keeping the winners history. */
export function startRound(state = game) {
  state.round += 1;
  state.available = newDeck();
  state.drawn = [];
  state.last = null;
  return state.round;
}

export function roundWinners(state = game, round = state.round) {
  return state.winners.filter(w => w.round === round);
}

export function hasWonThisRound(state, clientId, round = state.round) {
  return state.winners.some(w => w.round === round && w.clientId === clientId);
}

/** Replace state wholesale — used by "Load Saved Game" and by player STATE sync. */
export function hydrate(patch, state = game) {
  if (patch.round != null) state.round = patch.round;
  if (patch.pattern) state.pattern = patch.pattern;
  if (patch.maxWinners != null) state.maxWinners = patch.maxWinners;
  if (Array.isArray(patch.available)) state.available = patch.available;
  if (Array.isArray(patch.drawn)) state.drawn = patch.drawn;
  if (patch.last !== undefined) state.last = patch.last;
  if (Array.isArray(patch.winners)) state.winners = patch.winners;
  return state;
}
