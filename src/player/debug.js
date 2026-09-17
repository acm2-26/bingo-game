/**
 * On-screen diagnostics for the player, enabled with ?debug=1 on the URL.
 *
 * Exists because the interesting failure — a phone that is connected but never
 * applies a called number — is invisible from the outside and awkward to debug
 * through a phone's developer console. This puts the same facts on the screen.
 *
 * Read it top to bottom: if `round` is blank the player never synced state and
 * every call is being dropped; if `skip` has a reason, that reason is why.
 */

import { $ } from '../util/dom.js';
import { P } from './player-state.js';
import { game } from '../core/state.js';

export function initDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  document.body.appendChild(panel);

  const line = (label, value, bad = false) =>
    `<div${bad ? ' class="bad"' : ''}><b>${label}</b> ${value ?? '—'}</div>`;

  setInterval(() => {
    const stats = (P.transport && typeof P.transport.stats === 'function')
      ? P.transport.stats()
      : {};
    const call = stats.call || {};

    panel.innerHTML =
      line('pin', stats.pin)
      + line('conn', stats.connected ? 'yes' : 'NO', !stats.connected)
      + line('round', stats.myRound, stats.myRound === null || stats.myRound === undefined)
      + line('seq', stats.lastSeq)
      + line('node', call.n !== undefined ? `n=${call.n} seq=${call.seq} r=${call.round}` : 'none')
      + line('called', P.drawn.size)
      + line('mine', `r${game.round} ${game.pattern}`)
      + (stats.skipped ? line('skip', stats.skipped, true) : '')
      + (stats.error ? line('err', stats.error, true) : '');
  }, 700);
}
