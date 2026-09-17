/**
 * Claim verification — the referee.
 *
 * This runs on the HOST, over data the player sent, so a modified client
 * cannot award itself a win. The player also self-validates on every tap
 * (player/card-view.js) but that check is convenience, not enforcement.
 *
 * Pure: no DOM. Covered by tests/validation.test.js.
 */

import { callString, isFreeSpace } from './numbers.js';
import { patternCells } from './patterns.js';

/**
 * @param {number[][]} card   the player's 5x5 numbers (centre 0 = free)
 * @param {boolean[][]} marks what the player marked
 * @param {string} pattern    the round's active pattern code
 * @param {Set<number>} drawnSet every number the host has actually called
 * @returns {{ok: boolean, reason?: string}}
 */
export function verifyClaim(card, marks, pattern, drawnSet) {
  if (!Array.isArray(card) || !Array.isArray(marks)) {
    return { ok: false, reason: 'Card data missing' };
  }

  // Every marked square must correspond to a number the host called.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (isFreeSpace(r, c)) continue;
      if (marks[r] && marks[r][c]) {
        const n = card[r] && card[r][c];
        if (!drawnSet.has(n)) return { ok: false, reason: `${callString(n)} was not called` };
      }
    }
  }

  if (!patternCells(marks, pattern).length) {
    return { ok: false, reason: 'Pattern not complete' };
  }

  return { ok: true };
}
