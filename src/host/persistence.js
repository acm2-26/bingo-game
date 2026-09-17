/** Round reports, full game saves and restore.
 *  Everything is plain JSON so the files stay readable years later. */

import { $ } from '../util/dom.js';
import { stamp } from '../util/time.js';
import { toast } from '../ui/toast.js';
import { GAME_VERSION } from '../config.js';
import { callString } from '../core/numbers.js';
import { patternName } from '../core/patterns.js';
import { game, hydrate, roundWinners } from '../core/state.js';
import { H } from './host-state.js';

function downloadJSON(data, filename) {
  const a = document.createElement('a');
  a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const rosterSnapshot = () => Array.from(H.players.values())
  .map(p => ({ clientId: p.clientId, alias: p.alias, joinTime: p.joinTime, online: p.online }));

export function exportRoundData() {
  downloadJSON({
    roundNumber: game.round,
    timestamp: stamp(),
    pattern: patternName(game.pattern),
    maxWinnersSet: game.maxWinners,
    totalConnectedPlayers: H.players.size,
    playersList: rosterSnapshot(),
    numbersCalled: game.drawn.map(callString),
    roundWinners: roundWinners()
  }, `bingo_round_${game.round}_report_${new Date().toISOString().slice(0, 10)}.json`);
}

export function saveGameSession() {
  downloadJSON({
    version: GAME_VERSION,
    saveDate: stamp(),
    round: game.round,
    pattern: game.pattern,
    maxWinners: game.maxWinners,
    available: game.available,
    drawn: game.drawn,
    last: game.last,
    winners: game.winners,
    playerRoster: rosterSnapshot()
  }, `ac_m2_bingo_fullgame_${stamp().replace(/[: ]/g, '_')}.json`);
}

export function saveWinnerLog() {
  if (!game.winners.length) return toast('Winner log is empty', true);
  downloadJSON(game.winners, `ac_m2_bingo_winners_${stamp().replace(/[: ]/g, '_')}.json`);
}

/**
 * Restore a saved game. Accepts both the v3 field names and the v2 ones, so
 * files saved by the single-file build still load.
 * @param {Event} ev change event from the file input
 * @param {() => void} afterLoad host callback that repaints and resyncs players
 */
export function loadGameSession(ev, afterLoad) {
  const file = ev.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const s = JSON.parse(e.target.result);
      hydrate({
        round: s.round ?? s.currentRound,
        pattern: s.pattern ?? s.currentPattern,
        maxWinners: s.maxWinners ?? s.maxWinnersLimit,
        available: s.available ?? s.availableNumbers,
        drawn: s.drawn ?? s.drawnHistory ?? s.drawnNumbersHistory,
        last: s.last ?? s.lastDrawnNum ?? null,
        winners: s.winners ?? s.winnersList
      });
      afterLoad();
      toast('Game state loaded ✔');
    } catch {
      toast('Invalid save file', true);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

export { downloadJSON };
