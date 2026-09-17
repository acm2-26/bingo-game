/**
 * Web Audio cues and the speech caller.
 *
 * The AudioContext must be created inside a user gesture or mobile browsers
 * leave it suspended — unlockAudio() is called when a player taps "Let's Play".
 */

import { $ } from '../util/dom.js';

let ctx = null;

function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export const unlockAudio = audio;

export function tone(freq, start, dur, vol = 0.25, type = 'triangle') {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

const enabled = id => { const el = $(id); return !el || el.checked; };

/** Rising four-note flourish on a win. */
export function fanfare() {
  if (!enabled('sfx-toggle')) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.5, 0.3, 'triangle'));
  tone(1318.5, 0.48, 0.9, 0.22, 'sine');
}

/** Short tick when a number is called. */
export const blip = () => tone(880, 0, 0.12, 0.16, 'sine');

/** Two-note chime when a player joins. */
export function chimeJoin() {
  if (!enabled('join-toggle')) return;
  tone(659.25, 0, 0.12, 0.14, 'sine');
  tone(987.77, 0.1, 0.16, 0.12, 'sine');
}

/** Low buzz for a refused tap or an invalid claim. */
export const buzz = () => tone(150, 0, 0.22, 0.18, 'sawtooth');

/** The voice caller. Silently does nothing where speech is unavailable. */
export function speak(text) {
  if (!enabled('voice-toggle')) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch { /* some browsers throw when the queue is busy */ }
}
