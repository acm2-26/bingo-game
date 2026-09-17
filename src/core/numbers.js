/**
 * Bingo number helpers and card generation.
 *
 * Pure: no DOM, no globals, no side effects. Covered by tests/numbers.test.js.
 */

export const COLUMN_RANGES = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
export const FREE_ROW = 2;
export const FREE_COL = 2;

/** B-I-N-G-O letter for a called number. */
export function letterFor(n) {
  return n <= 15 ? 'B' : n <= 30 ? 'I' : n <= 45 ? 'N' : n <= 60 ? 'G' : 'O';
}

/** "B-12" — what the caller says and what error messages quote. */
export function callString(n) {
  return `${letterFor(n)}-${n}`;
}

/** A fresh 1..75 pool for a new round. */
export function newDeck() {
  return Array.from({ length: 75 }, (_, i) => i + 1);
}

/**
 * `count` distinct numbers from [min, max], uniformly shuffled.
 * @param {() => number} rng injectable for deterministic tests
 */
export function randomColumn(min, max, count, rng = Math.random) {
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * A 5x5 card as [row][col] numbers. The centre is 0, meaning FREE.
 * Column c draws from COLUMN_RANGES[c], which is what makes a bingo card a
 * bingo card — B only ever holds 1-15, and so on.
 */
export function generateCard(rng = Math.random) {
  const cols = COLUMN_RANGES.map(([min, max]) => randomColumn(min, max, 5, rng));
  const card = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      card[r][c] = (r === FREE_ROW && c === FREE_COL) ? 0 : cols[c][r];
    }
  }
  return card;
}

/** A blank mark grid with the free space already marked. */
export function emptyMarks() {
  const marks = Array.from({ length: 5 }, () => Array(5).fill(false));
  marks[FREE_ROW][FREE_COL] = true;
  return marks;
}

export const isFreeSpace = (r, c) => r === FREE_ROW && c === FREE_COL;
