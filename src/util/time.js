/** Timestamps. Local time on purpose — these are read by a human during a game. */

export const now = () => Date.now();

/** "2026-12-19 14:07:33" — used in logs, exports and the roster. */
export function stamp(d = new Date()) {
  const p = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
       + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Just the clock part of a stamp(), for compact tables. */
export function shortTime(s) {
  const parts = String(s || '').split(' ');
  return parts[1] || s || '';
}
