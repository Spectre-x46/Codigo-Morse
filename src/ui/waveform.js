/**
 * Visualización de señal. Barras verticales que reaccionan al Morse.
 *
 * Deliberadamente NO es un analizador FFT: ya sabemos qué debería estar
 * sonando, no hace falta medirlo. Un AnalyserNode aquí sería un nodo más en
 * el grafo y una copia de buffer por frame a cambio de nada.
 *
 * Sólo se anima `transform: scaleY` (compositable, sin recalcular layout).
 * Nunca `height`.
 */

import * as frameLoop from './frame-loop.js';
import { prefersReduced } from './motion.js';

const MIN = 0.16;

/**
 * @param {HTMLElement} host
 * @param {{bars?:number}} [opts]
 */
export function Waveform(host, { bars = 26 } = {}) {
  host.classList.add('wave');
  host.dataset.on = 'false';
  host.setAttribute('aria-hidden', 'true');
  host.replaceChildren();

  /** @type {HTMLElement[]} */
  const items = [];
  for (let i = 0; i < bars; i++) {
    const b = document.createElement('span');
    b.className = 'wave__bar';
    host.appendChild(b);
    items.push(b);
  }

  const mid = (bars - 1) / 2;
  /** Perfil de campana: las barras centrales responden más. */
  const shape = items.map((_, i) => 1 - Math.abs(i - mid) / (mid + 1) * 0.72);

  let lastOn = null;
  let phase = 0;

  const unsubscribe = frameLoop.subscribe((state) => {
    if (state.on !== lastOn) {
      host.dataset.on = String(state.on);
      lastOn = state.on;
    }

    if (!state.on) {
      for (const b of items) b.style.transform = `scaleY(${MIN})`;
      return;
    }

    if (prefersReduced()) {
      // Sin ondulación: una sola altura estable que sigue informando de que
      // hay señal, pero no se mueve.
      const h = state.kind === 'dah' ? 0.8 : 0.5;
      for (let i = 0; i < items.length; i++) {
        items[i].style.transform = `scaleY(${Math.max(MIN, h * shape[i]).toFixed(3)})`;
      }
      return;
    }

    phase += state.kind === 'dah' ? 0.16 : 0.28;
    const amp = state.kind === 'dah' ? 1 : 0.66;
    for (let i = 0; i < items.length; i++) {
      const wobble = 0.72 + Math.sin(phase + i * 0.55) * 0.28;
      const v = Math.max(MIN, amp * shape[i] * wobble * state.level);
      items[i].style.transform = `scaleY(${v.toFixed(3)})`;
    }
  });

  return {
    destroy() { unsubscribe(); host.replaceChildren(); }
  };
}
