/** Transient one-line message. One at a time, by design — during a game the
 *  host should never be reading a stack of notifications. */

import { $ } from '../util/dom.js';

let timer = null;

export function toast(message, isBad = false) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('bad', !!isBad);
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 2600);
}
