/** The BINGO moment: full-screen overlay, canvas confetti and a fanfare.
 *  Rendered above everything including the full-screen caller. */

import { $ } from '../util/dom.js';
import { now } from '../util/time.js';
import { fanfare } from './sound.js';
import { game } from '../core/state.js';

const canvas = $('confetti');
const ctx = canvas ? canvas.getContext('2d') : null;
const COLORS = ['#f5c518', '#ef4444', '#22c55e', '#60a5fa', '#f97316', '#ffffff', '#c084fc'];

let pieces = [];
let until = 0;
let raf = null;
let dismissTimer = null;

function sizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
sizeCanvas();
window.addEventListener('resize', sizeCanvas);

export function startConfetti(ms = 5000) {
  if (!ctx) return;
  for (let i = 0; i < 150; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 10,
      vy: 2.2 + Math.random() * 3.4,
      vx: -1.6 + Math.random() * 3.2,
      rot: Math.random() * Math.PI,
      vr: -0.14 + Math.random() * 0.28,
      color: COLORS[(Math.random() * COLORS.length) | 0]
    });
  }
  until = now() + ms;
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pieces = pieces.filter(p => p.y < canvas.height + 40);
  for (const p of pieces) {
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  if (pieces.length || now() < until) {
    raf = requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    raf = null;
  }
}

export function showCelebration(title, who, rank) {
  $('celebrate-title').textContent = title;
  $('celebrate-who').textContent = who || '';
  $('celebrate-rank').textContent = rank ? `Winner #${rank} · Round ${game.round}` : '';
  $('celebrate').classList.add('active');
  startConfetti(5200);
  fanfare();
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hideCelebration, 6500);
}

export function hideCelebration() {
  $('celebrate').classList.remove('active');
}
