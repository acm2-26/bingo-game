/** Tiny DOM helpers. Kept deliberately thin — no framework here. */

export const $ = id => document.getElementById(id);

/** Escape user-supplied text before it goes near innerHTML.
 *  Player aliases are typed by students and rendered on the host screen. */
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Restart a CSS animation on an element that may already be playing it. */
export function replay(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;            // force reflow so the animation restarts
  el.classList.add(className);
}
