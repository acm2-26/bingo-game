/**
 * Printable advance cards.
 *
 * Rendered in batches so generating 1,000 cards does not lock the browser —
 * each batch yields to the event loop and updates the progress line.
 */

import { $ } from '../util/dom.js';
import { generateCard, isFreeSpace } from '../core/numbers.js';

const BATCH_SIZE = 50;

function buildPrintableCard(index) {
  const card = document.createElement('div');
  card.className = 'printable-card';
  card.innerHTML = `
    <div class="hp-header-title">🎄 Hogwarts Christmas 2026 🎄</div>
    <div class="hp-sub-title">AC M2 Magical Bingo Card #${index}</div>
    <div class="student-info-box">
      <div class="student-info-field"><strong>Name:</strong> <span class="student-line"></span></div>
      <div class="student-info-row">
        <div class="student-info-field"><strong>Student ID:</strong> <span class="student-line"></span></div>
        <div class="student-info-field" style="margin-left:8px;"><strong>Class:</strong> <span class="student-line"></span></div>
      </div>
    </div>`;

  const board = document.createElement('div');
  board.className = 'printable-board';

  ['B', 'I', 'N', 'G', 'O'].forEach(letter => {
    const head = document.createElement('div');
    head.className = 'printable-cell header';
    head.textContent = letter;
    board.appendChild(head);
  });

  const numbers = generateCard();
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.className = 'printable-cell';
      if (isFreeSpace(r, c)) {
        cell.textContent = 'FREE';
        cell.classList.add('free');
      } else {
        cell.textContent = numbers[r][c];
      }
      board.appendChild(cell);
    }
  }

  card.appendChild(board);
  return card;
}

export function generateAndPrintCards() {
  const total = parseInt($('card-count').value, 10);
  const container = $('print-section');
  const progress = $('print-progress');
  const button = $('print-btn');

  container.innerHTML = '';
  button.disabled = true;
  progress.textContent = 'Preparing…';

  let done = 0;

  (function renderBatch() {
    const fragment = document.createDocumentFragment();
    const limit = Math.min(done + BATCH_SIZE, total);
    for (let i = done + 1; i <= limit; i++) fragment.appendChild(buildPrintableCard(i));
    container.appendChild(fragment);

    done = limit;
    progress.textContent = `Generating… ${done}/${total}`;

    if (done < total) {
      setTimeout(renderBatch, 5);
    } else {
      progress.textContent = 'Done — opening print dialog…';
      button.disabled = false;
      setTimeout(() => { window.print(); progress.textContent = ''; }, 300);
    }
  })();
}
