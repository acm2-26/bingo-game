/** Screen switching. Emits a DOM event so modules can react without importing
 *  each other — this is what keeps player/card-view.js out of this file. */

import { $ } from '../util/dom.js';

export const SCREEN_CHANGED = 'bingo:screen';

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  document.body.classList.toggle('player-mode', id === 'screen-player');
  document.dispatchEvent(new CustomEvent(SCREEN_CHANGED, { detail: { id } }));
}

export const openModal = id => $(id)?.classList.add('active');
export const closeModal = id => $(id)?.classList.remove('active');
