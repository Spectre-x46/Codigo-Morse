/**
 * Representa un código Morse (· — · —) e ilumina cada símbolo exactamente
 * mientras suena.
 *
 * El componente NO sabe qué es un punto ni cuánto dura: sólo compara un
 * entero. Todo el timing vive en `core/`. Esa es la razón de que no pueda
 * desincronizarse — no tiene reloj propio con el que equivocarse.
 */

import * as frameLoop from './frame-loop.js';

/**
 * @param {HTMLElement} host
 * @param {{code?:string, size?:'md'|'lg'|'xl'}} [opts]
 */
export function MorseGlyph(host, { code = '', size = 'md' } = {}) {
  host.classList.add('glyph');
  // 'xl' existía en el CSS y en las llamadas, pero aquí sólo se contemplaba
  // 'lg' y se descartaba sin avisar: funcionaba de casualidad, porque la clase
  // ya venía puesta en el HTML de la vista.
  if (size === 'lg' || size === 'xl') host.classList.add(`glyph--${size}`);
  host.setAttribute('aria-hidden', 'true');

  /** @type {HTMLElement[]} */
  let symbols = [];
  let tracked = null;      // { playbackId, firstEl }
  let litIndex = -1;

  function setCode(next) {
    code = next ?? '';
    host.replaceChildren();
    symbols = [...code].map((c) => {
      const el = document.createElement('span');
      el.className = 'glyph__sym';
      el.textContent = c === '-' ? '—' : '·';
      el.dataset.lit = 'false';
      host.appendChild(el);
      return el;
    });
    litIndex = -1;
  }

  function light(i) {
    if (i === litIndex) return;         // única condición que escribe en el DOM
    if (symbols[litIndex]) symbols[litIndex].dataset.lit = 'false';
    if (symbols[i]) symbols[i].dataset.lit = 'true';
    litIndex = i;
  }

  const unsubscribe = frameLoop.subscribe((state) => {
    if (!tracked) return;
    if (state.playbackId !== tracked.playbackId || !state.on) { light(-1); return; }
    light(state.elementIndex - tracked.firstEl);
  });

  return {
    setCode,

    /** Sigue una reproducción concreta. `letterIndex` es la letra dentro de ella. */
    track(playback, letterIndex = 0) {
      const letter = playback?.timeline?.letters?.[letterIndex];
      if (!letter) { tracked = null; return; }
      setCode(letter.code);
      tracked = { playbackId: playback.id, firstEl: letter.firstEl };
      frameLoop.wake();
    },

    clear() { tracked = null; light(-1); },

    destroy() { unsubscribe(); host.replaceChildren(); }
  };
}
