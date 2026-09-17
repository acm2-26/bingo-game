import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  letterFor, callString, newDeck, randomColumn,
  generateCard, emptyMarks, isFreeSpace, COLUMN_RANGES
} from '../src/core/numbers.js';

test('letterFor maps every number to its column letter', () => {
  assert.equal(letterFor(1), 'B');
  assert.equal(letterFor(15), 'B');
  assert.equal(letterFor(16), 'I');
  assert.equal(letterFor(30), 'I');
  assert.equal(letterFor(31), 'N');
  assert.equal(letterFor(45), 'N');
  assert.equal(letterFor(46), 'G');
  assert.equal(letterFor(60), 'G');
  assert.equal(letterFor(61), 'O');
  assert.equal(letterFor(75), 'O');
});

test('callString is what the caller announces', () => {
  assert.equal(callString(7), 'B-7');
  assert.equal(callString(75), 'O-75');
});

test('newDeck holds every number once', () => {
  const deck = newDeck();
  assert.equal(deck.length, 75);
  assert.equal(new Set(deck).size, 75);
  assert.equal(Math.min(...deck), 1);
  assert.equal(Math.max(...deck), 75);
});

test('randomColumn returns distinct numbers inside its range', () => {
  for (let i = 0; i < 200; i++) {
    const col = randomColumn(16, 30, 5);
    assert.equal(col.length, 5);
    assert.equal(new Set(col).size, 5, 'no duplicates within a column');
    col.forEach(n => assert.ok(n >= 16 && n <= 30, `${n} outside 16-30`));
  }
});

test('generateCard respects the column ranges — a B square is never 40', () => {
  for (let i = 0; i < 100; i++) {
    const card = generateCard();
    for (let c = 0; c < 5; c++) {
      const [min, max] = COLUMN_RANGES[c];
      for (let r = 0; r < 5; r++) {
        if (isFreeSpace(r, c)) continue;
        const n = card[r][c];
        assert.ok(n >= min && n <= max, `column ${c} held ${n}, expected ${min}-${max}`);
      }
    }
  }
});

test('generateCard never repeats a number on the same card', () => {
  for (let i = 0; i < 100; i++) {
    const card = generateCard();
    const seen = card.flat().filter((_, idx) => idx !== 12);
    assert.equal(new Set(seen).size, 24, 'all 24 numbered squares are distinct');
  }
});

test('the centre square is free and pre-marked', () => {
  const card = generateCard();
  assert.equal(card[2][2], 0);
  const marks = emptyMarks();
  assert.equal(marks[2][2], true);
  assert.equal(marks.flat().filter(Boolean).length, 1);
});

test('generateCard is deterministic for a seeded rng', () => {
  const seeded = () => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  assert.deepEqual(generateCard(seeded()), generateCard(seeded()));
});
