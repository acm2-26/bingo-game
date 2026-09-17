import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawNumber, undoDraw, startRound, roundWinners, hasWonThisRound, hydrate } from '../src/core/state.js';
import { newDeck } from '../src/core/numbers.js';

const fresh = () => ({
  round: 1, pattern: 'LINE', maxWinners: 1,
  available: newDeck(), drawn: [], last: null, winners: []
});

test('drawing moves a number from the pool to the history', () => {
  const s = fresh();
  const n = drawNumber(s);
  assert.equal(s.available.length, 74);
  assert.deepEqual(s.drawn, [n]);
  assert.equal(s.last, n);
  assert.ok(!s.available.includes(n), 'a drawn number cannot be drawn again');
});

test('every number comes out exactly once, then the round ends', () => {
  const s = fresh();
  const seen = [];
  for (let i = 0; i < 75; i++) seen.push(drawNumber(s));
  assert.equal(new Set(seen).size, 75);
  assert.equal(drawNumber(s), null, 'an exhausted round returns null, not a repeat');
});

test('undo puts the number back and restores the previous call', () => {
  const s = fresh();
  const first = drawNumber(s);
  const second = drawNumber(s);
  assert.equal(undoDraw(s), second);
  assert.equal(s.last, first);
  assert.ok(s.available.includes(second));
  assert.equal(s.drawn.length, 1);
});

test('undo on an empty round is a no-op', () => {
  const s = fresh();
  assert.equal(undoDraw(s), null);
  assert.equal(s.last, null);
});

test('a new round clears the calls but keeps the winners history', () => {
  const s = fresh();
  drawNumber(s); drawNumber(s);
  s.winners.push({ round: 1, rank: 1, alias: 'Ploy', clientId: 'c1' });

  assert.equal(startRound(s), 2);
  assert.equal(s.drawn.length, 0);
  assert.equal(s.last, null);
  assert.equal(s.available.length, 75);
  assert.equal(s.winners.length, 1, 'history survives the round change');
  assert.equal(roundWinners(s).length, 0, 'but round 2 starts with no winners');
});

test('winner lookups are scoped to the round', () => {
  const s = fresh();
  s.winners.push({ round: 1, rank: 1, alias: 'Ploy', clientId: 'c1' });
  assert.equal(hasWonThisRound(s, 'c1'), true);
  assert.equal(hasWonThisRound(s, 'c2'), false);
  startRound(s);
  assert.equal(hasWonThisRound(s, 'c1'), false, 'last round does not block this one');
});

test('hydrate restores a saved game and ignores absent fields', () => {
  const s = fresh();
  hydrate({ round: 4, drawn: [5, 9], last: 9 }, s);
  assert.equal(s.round, 4);
  assert.deepEqual(s.drawn, [5, 9]);
  assert.equal(s.last, 9);
  assert.equal(s.pattern, 'LINE', 'untouched fields keep their value');
});
