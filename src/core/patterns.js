/**
 * Winning patterns.
 *
 * Pure: no DOM. Covered by tests/patterns.test.js.
 */

export const PATTERNS = {
  LINE: 'Standard Line',
  CORNERS: 'Four Corners',
  X: 'X-Shape',
  FULL: 'Full House'
};

export function patternName(code) {
  return PATTERNS[code] || PATTERNS.LINE;
}

/**
 * Which cells, if any, complete `pattern` on this mark grid.
 *
 * Returns [] when the pattern is not complete, so callers can treat a
 * non-empty result as "this card has bingo". Cells may repeat (the two
 * diagonals of an X share the centre) — callers only add a CSS class, so
 * duplicates are harmless.
 *
 * @param {boolean[][]} marks 5x5
 * @param {keyof PATTERNS} pattern
 * @returns {Array<[number, number]>} [row, col] pairs
 */
export function patternCells(marks, pattern) {
  const hits = [];
  const at = (r, c) => !!(marks[r] && marks[r][c]);
  const all = [0, 1, 2, 3, 4];

  if (pattern === 'LINE') {
    for (let r = 0; r < 5; r++) if (all.every(c => at(r, c))) for (let c = 0; c < 5; c++) hits.push([r, c]);
    for (let c = 0; c < 5; c++) if (all.every(r => at(r, c))) for (let r = 0; r < 5; r++) hits.push([r, c]);
    if (all.every(i => at(i, i))) for (let i = 0; i < 5; i++) hits.push([i, i]);
    if (all.every(i => at(i, 4 - i))) for (let i = 0; i < 5; i++) hits.push([i, 4 - i]);

  } else if (pattern === 'CORNERS') {
    if (at(0, 0) && at(0, 4) && at(4, 0) && at(4, 4)) hits.push([0, 0], [0, 4], [4, 0], [4, 4]);

  } else if (pattern === 'X') {
    const d1 = all.every(i => at(i, i));
    const d2 = all.every(i => at(i, 4 - i));
    if (d1 && d2) for (let i = 0; i < 5; i++) { hits.push([i, i]); hits.push([i, 4 - i]); }

  } else if (pattern === 'FULL') {
    let complete = true;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!at(r, c)) complete = false;
    if (complete) for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) hits.push([r, c]);
  }

  return hits;
}
