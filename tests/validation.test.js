import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim } from '../src/core/validation.js';

/** A card whose top row is 1, 16, 31, 46, 61 — one from each column. */
function fixture() {
  const card = Array.from({ length: 5 }, () => Array(5).fill(0));
  const marks = Array.from({ length: 5 }, () => Array(5).fill(false));
  [1, 16, 31, 46, 61].forEach((n, c) => { card[0][c] = n; });
  [2, 17, 32, 47, 62].forEach((n, c) => { card[1][c] = n; });
  [3, 18, 0, 48, 63].forEach((n, c) => { card[2][c] = n; });
  [4, 19, 34, 49, 64].forEach((n, c) => { card[3][c] = n; });
  [5, 20, 35, 50, 65].forEach((n, c) => { card[4][c] = n; });
  marks[2][2] = true;                 // free space
  return { card, marks };
}

test('a complete row of called numbers is accepted', () => {
  const { card, marks } = fixture();
  for (let c = 0; c < 5; c++) marks[0][c] = true;
  const result = verifyClaim(card, marks, 'LINE', new Set([1, 16, 31, 46, 61]));
  assert.deepEqual(result, { ok: true });
});

test('REGRESSION: a marked number that was never called is rejected', () => {
  // This is the bug shipped in v2.3 — the guard was skipped when the called
  // list was empty, so a player could pre-mark a whole row and claim.
  const { card, marks } = fixture();
  for (let c = 0; c < 5; c++) marks[0][c] = true;
  const result = verifyClaim(card, marks, 'LINE', new Set());
  assert.equal(result.ok, false);
  assert.match(result.reason, /was not called/);
});

test('the rejection names the offending square', () => {
  const { card, marks } = fixture();
  for (let c = 0; c < 5; c++) marks[0][c] = true;
  const result = verifyClaim(card, marks, 'LINE', new Set([1, 16, 46, 61]));  // 31 missing
  assert.equal(result.reason, 'N-31 was not called');
});

test('every called number but an incomplete pattern is rejected', () => {
  const { card, marks } = fixture();
  for (let c = 0; c < 4; c++) marks[0][c] = true;
  const result = verifyClaim(card, marks, 'LINE', new Set([1, 16, 31, 46, 61]));
  assert.deepEqual(result, { ok: false, reason: 'Pattern not complete' });
});

test('the free space needs no call', () => {
  const { card, marks } = fixture();
  // Middle column: rows 0,1,3,4 plus the free centre.
  [0, 1, 3, 4].forEach(r => { marks[r][2] = true; });
  const result = verifyClaim(card, marks, 'LINE', new Set([31, 32, 34, 35]));
  assert.deepEqual(result, { ok: true });
});

test('malformed payloads are rejected, not thrown on', () => {
  assert.equal(verifyClaim(null, null, 'LINE', new Set()).ok, false);
  assert.equal(verifyClaim(undefined, [[true]], 'LINE', new Set()).ok, false);
  assert.equal(verifyClaim([[1]], 'not-an-array', 'LINE', new Set()).ok, false);
});

test('a claim under the wrong pattern is rejected', () => {
  const { card, marks } = fixture();
  for (let c = 0; c < 5; c++) marks[0][c] = true;
  const called = new Set([1, 16, 31, 46, 61]);
  assert.equal(verifyClaim(card, marks, 'LINE', called).ok, true);
  assert.equal(verifyClaim(card, marks, 'CORNERS', called).ok, false);
  assert.equal(verifyClaim(card, marks, 'FULL', called).ok, false);
});
