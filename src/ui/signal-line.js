/**
 * Línea de señal: el motivo gráfico propio del producto.
 *
 *   ────●──────━━━───────●────────
 *
 * Es una transcripción real en Morse, no un adorno: los trazos cortos y largos
 * corresponden a los puntos y rayas de la palabra que se le pase. Alguien que
 * sepa Morse puede leerla.
 *
 * Se dibuja con stroke-dashoffset sobre un único path, así que animarla cuesta
 * una propiedad compositable y ni un solo frame de JavaScript.
 */

import { MORSE, tokenize } from '../data/morse.js';

/** Proporciones en unidades Morse, iguales que en el audio. */
const DIT = 1;
const DAH = 3;
const GAP = 1;
const LETTER_GAP = 3;
const WORD_GAP = 7;

/** Píxeles por unidad Morse. Define el tamaño final de la marca. */
const UNIT_PX = 6;

/**
 * Construye el SVG de una palabra en Morse.
 *
 * @param {string} text palabra a transcribir
 * @param {{height?:number, stroke?:number}} [opts]
 * @returns {SVGSVGElement}
 */
export function buildSignalLine(text, { height = 12, stroke = 2 } = {}) {
  const words = tokenize(text);
  /** @type {{x:number,len:number,kind:'dit'|'dah'}[]} */
  const marks = [];
  let x = 0;

  words.forEach((word, wi) => {
    word.forEach((ch, li) => {
      const code = MORSE[ch];
      [...code].forEach((sym, si) => {
        const len = sym === '-' ? DAH : DIT;
        marks.push({ x, len, kind: sym === '-' ? 'dah' : 'dit' });
        x += len;
        if (si < code.length - 1) x += GAP;
      });
      if (li < word.length - 1) x += LETTER_GAP;
    });
    if (wi < words.length - 1) x += WORD_GAP;
  });

  const total = x || 1;

  // Tamaño natural, sin deformar. Con preserveAspectRatio="none" y un ancho del
  // 100% la línea se estiraba unas 27 veces: los puntos salían tan largos como
  // las rayas y dejaba de ser Morse legible para pasar a parecer una regla
  // discontinua. Se dibuja a escala fija y se centra.
  const w = total * UNIT_PX;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${height}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sigline');

  const mid = height / 2;

  // Riel de fondo: la línea continua sobre la que se apoyan las marcas.
  const rail = document.createElementNS(svg.namespaceURI, 'line');
  rail.setAttribute('x1', '0'); rail.setAttribute('y1', String(mid));
  rail.setAttribute('x2', String(total)); rail.setAttribute('y2', String(mid));
  rail.setAttribute('class', 'sigline__rail');
  rail.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(rail);

  for (const m of marks) {
    const el = document.createElementNS(svg.namespaceURI, 'line');
    el.setAttribute('x1', String(m.x)); el.setAttribute('y1', String(mid));
    el.setAttribute('x2', String(m.x + m.len)); el.setAttribute('y2', String(mid));
    el.setAttribute('class', `sigline__mark sigline__mark--${m.kind}`);
    el.setAttribute('stroke-width', String(stroke));
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    el.style.setProperty('--at', (m.x / total).toFixed(4));
    svg.appendChild(el);
  }

  svg.dataset.marks = String(marks.length);
  return svg;
}

/**
 * Inserta una línea de señal en `host` y la barre cuando entra en pantalla.
 *
 * El barrido se disparaba al montar la vista, pero la banda inferior de la home
 * está a más de cuatro mil píxeles del fold: la animación empezaba y terminaba
 * mientras el usuario seguía mirando el hero, y al llegar allí no quedaba nada
 * que ver. Un IntersectionObserver por instancia —son dos por página— pone
 * `data-sweep="run"` en el momento correcto y se da de baja.
 *
 * Con movimiento reducido no hay barrido: se marca `run` igualmente y el CSS,
 * que sólo declara la animación bajo `[data-motion='full']`, la ignora.
 *
 * @param {HTMLElement} host
 * @param {string} text
 */
export function SignalLine(host, text, opts) {
  host.replaceChildren(buildSignalLine(text, opts));
  host.dataset.sweep = 'pending';

  let observer = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      host.dataset.sweep = 'run';
      observer.disconnect();
      observer = null;
    }, { threshold: 0.35 });
    observer.observe(host);
  } else {
    host.dataset.sweep = 'run';
  }

  return {
    destroy() {
      observer?.disconnect();
      observer = null;
      host.replaceChildren();
      delete host.dataset.sweep;
    }
  };
}
