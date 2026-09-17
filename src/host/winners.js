/** The winners log, and the paper-card entry for students playing on print-outs. */

import { $, esc } from '../util/dom.js';
import { stamp, shortTime } from '../util/time.js';
import { toast } from '../ui/toast.js';
import { showCelebration } from '../ui/celebrate.js';
import { patternName } from '../core/patterns.js';
import { game, roundWinners } from '../core/state.js';
import { logActivity } from './activity.js';
import { showWinnerBanner, syncFullCaller } from './fullscreen.js';
import { renderRoster } from './roster.js';

/** The single place a win is recorded — app claims and paper cards both land here. */
export function recordWinner(winner) {
  game.winners.push({ timestamp: stamp(), ...winner });
  renderWinnerLog();
  renderRoster();
  logActivity('win', `BINGO — ${winner.alias} is winner #${winner.rank} (${winner.pattern})`);
  showWinnerBanner(winner.alias, winner.rank, winner.pattern);
  toast(`🏆 BINGO! ${winner.alias} — winner #${winner.rank}`);
}

export function addManualWinner() {
  const input = $('manual-alias-input');
  const alias = input.value.trim();
  if (!alias) return toast('Enter a name first', true);

  const rank = roundWinners().length + 1;
  recordWinner({
    round: game.round, rank, alias, clientId: null,
    pattern: patternName(game.pattern), verified: false, source: 'paper'
  });
  input.value = '';
  showCelebration('BINGO!', alias, rank);
}

export function renderWinnerLog() {
  const tbody = $('winner-log-body');
  if (!tbody) return;

  $('winner-count-label').textContent = roundWinners().length;
  $('winner-limit-label').textContent = game.maxWinners;
  syncFullCaller();

  if (!game.winners.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No winners yet</td></tr>';
    return;
  }
  tbody.innerHTML = game.winners.slice().reverse().map(w => `
    <tr>
      <td><b>#${w.rank}</b> <span style="color:var(--muted)">R${w.round}</span></td>
      <td>${esc(w.alias)} ${w.source === 'paper' ? '📝' : (w.verified ? '✅' : '')}</td>
      <td title="${esc(w.timestamp)}">${esc(shortTime(w.timestamp))}</td>
      <td>${esc(w.pattern)}</td>
    </tr>`).join('');
}

export function clearWinnerLog() {
  if (!confirm('Clear the entire winner log?')) return;
  game.winners = [];
  renderWinnerLog();
  renderRoster();
}
