/** The host's Live Activity feed: who joined, who dropped, who won.
 *  Joins are batched so fifty students scanning at once produce one toast. */

import { $, esc } from '../util/dom.js';
import { stamp, shortTime } from '../util/time.js';
import { toast } from '../ui/toast.js';
import { chimeJoin } from '../ui/sound.js';

const MAX_ENTRIES = 60;
const ICONS = { join: '✅', rejoin: '🔄', leave: '⚪', win: '🏆', bad: '⚠️', round: '▶️' };

/** @type {{t:string, type:string, text:string}[]} */
export const activity = [];

export function logActivity(type, text) {
  activity.unshift({ t: stamp(), type, text });
  if (activity.length > MAX_ENTRIES) activity.pop();
  renderActivity();
}

export function renderActivity() {
  const box = $('activity-list');
  if (!box) return;
  if (!activity.length) {
    box.innerHTML = '<div class="empty">Waiting for players…</div>';
    return;
  }
  box.innerHTML = activity.map(a => `
    <div class="act-row ${a.type}">
      <span class="ic">${ICONS[a.type] || '•'}</span>
      <span class="tx">${esc(a.text)}</span>
      <span class="tm">${esc(shortTime(a.t))}</span>
    </div>`).join('');
}

let joinBuffer = [];
let joinTimer = null;

export function announceJoin(alias) {
  logActivity('join', `${alias} joined the game`);
  chimeJoin();
  joinBuffer.push(alias);
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    const n = joinBuffer.length;
    if (n === 1) toast(`👋 ${joinBuffer[0]} joined`);
    else toast(`👋 ${n} players joined — ${joinBuffer.slice(0, 3).join(', ')}${n > 3 ? '…' : ''}`);
    joinBuffer = [];
  }, 1000);
}
