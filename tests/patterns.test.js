import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternCells, patternName, PATTERNS } from '../src/core/patterns.js';

const blank = () => Array.from({ length: 5 }, () => Array(5).fill(false));
const mark = (marks, cells) => { cells.forEach(([r, c]) => { marks[r][c] = true; }); return marks; };
const row = r => [0, 1, 2, 3, 4].map(c => [r, c]);
const col = c => [0, 1, 2, 3, 4].map(r => [r, c]);
const diag = () => [0, 1, 2, 3, 4].map(i => [i, i]);
const antiDiag = () => [0, 1, 2, 3, 4].map(i => [i, 4 - i]);

test('patternName covers every code and falls back safely', () => {
  Object.keys(PATTERNS).forEach(code => assert.equal(patternName(code), PATTERNS[code]));
  assert.equal(patternName('NONSENSE'), PATTERNS.LINE);
});

test('an empty card completes nothing', () => {
  Object.keys(PATTERNS).forEach(code => {
    assert.deepEqual(patternCells(blank(), code), [], `${code} should not fire on a blank card`);
  });
});

test('LINE fires on any full row, column or diagonal', () => {
  for (let r = 0; r < 5; r++) assert.ok(patternCells(mark(blank(), row(r)), 'LINE').length, `row ${r}`);
  for (let c = 0; c < 5; c++) assert.ok(patternCells(mark(blank(), col(c)), 'LINE').length, `col ${c}`);
  assert.ok(patternCells(mark(blank(), diag()), 'LINE').length, 'diagonal');
  assert.ok(patternCells(mark(blank(), antiDiag()), 'LINE').length, 'anti-diagonal');
});

test('LINE does not fire on four of five', () => {
  const marks = mark(blank(), row(0).slice(0, 4));
  assert.deepEqual(patternCells(marks, 'LINE'), []);
});

test('CORNERS needs all four corners and ignores a full row', () => {
  assert.deepEqual(
    patternCells(mark(blank(), [[0, 0], [0, 4], [4, 0], [4, 4]]), 'CORNERS'),
    [[0, 0], [0, 4], [4, 0], [4, 4]]
  );
  assert.deepEqual(patternCells(mark(blank(), [[0, 0], [0, 4], [4, 0]]), 'CORNERS'), []);
  assert.deepEqual(patternCells(mark(blank(), row(2)), 'CORNERS'), []);
});

test('X needs both diagonals, not one', () => {
  assert.deepEqual(patternCells(mark(blank(), diag()), 'X'), []);
  const both = mark(mark(blank(), diag()), antiDiag());
  assert.ok(patternCells(both, 'X').length);
});

test('FULL needs all 25 squares', () => {
  const nearly = blank();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) nearly[r][c] = true;
  nearly[4][4] = false;
  assert.deepEqual(patternCells(nearly, 'FULL'), []);

  nearly[4][4] = true;
  assert.equal(patternCells(nearly, 'FULL').length, 25);
});

test('a ragged marks array does not throw', () => {
  assert.doesNotThrow(() => patternCells([[true]], 'LINE'));
  assert.doesNotThrow(() => patternCells([], 'FULL'));
});
