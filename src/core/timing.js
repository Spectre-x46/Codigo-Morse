/**
 * Timing Morse. Puro: sin DOM, sin Web Audio, sin relojes.
 *
 * Todo el resto del sistema deriva de aquí, así que es el único sitio donde
 * viven las constantes PARIS y la regla Farnsworth.
 *
 * Estándar PARIS: la palabra "PARIS" son exactamente 50 unidades, así que a
 * N palabras por minuto una unidad dura 1200/N milisegundos.
 *
 *   punto (dit)            1 unidad
 *   raya  (dah)            3 unidades
 *   hueco entre elementos  1 unidad
 *   hueco entre letras     3 unidades
 *   hueco entre palabras   7 unidades
 *
 * Farnsworth: los caracteres se envían rápido (>= 18 PPM) pero los huecos
 * entre letras y palabras se estiran para que la velocidad global percibida
 * siga siendo la pedida. Se aprende el ritmo real de cada letra desde el
 * principio, con tiempo para procesarla.
 *
 * De esas 50 unidades de PARIS, 31 son contenido de carácter (elementos y
 * huecos intra-carácter) y 19 son espaciado estirable (4 huecos de letra de 3
 * unidades + 1 hueco de palabra de 7). Sólo esas 19 se alargan. Ver
 * `spacingFactor` para la derivación.
 */

import { MORSE, tokenize } from '../data/morse.js';

/** @typedef {{wpm:number, freq:number, farnsworth:boolean, volume:number}} Settings */

export const DEFAULT_SETTINGS = Object.freeze({
  wpm: 13,
  freq: 600,
  farnsworth: true,
  volume: 0.25
});

export const LIMITS = Object.freeze({
  wpm: { min: 5, max: 25 },
  freq: { min: 300, max: 1000 },
  volume: { min: 0, max: 0.4 }
});

/** Velocidad mínima de carácter cuando Farnsworth está activo. */
export const FARNSWORTH_CHAR_WPM = 18;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
/** Número utilizable o el respaldo. Cubre NaN, null, undefined y cadenas. */
const finite = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Completa y acota unos settings parciales. Nunca lanza. */
export function resolveSettings(partial = {}) {
  const s = { ...DEFAULT_SETTINGS, ...partial };
  return {
    wpm: clamp(finite(s.wpm, DEFAULT_SETTINGS.wpm), LIMITS.wpm.min, LIMITS.wpm.max),
    freq: clamp(finite(s.freq, DEFAULT_SETTINGS.freq), LIMITS.freq.min, LIMITS.freq.max),
    farnsworth: Boolean(s.farnsworth),
    // `Number(x) ?? def` NO protege de nada: Number('abc') es NaN, no undefined,
    // y clamp(NaN) devuelve NaN. Un volumen NaN deja la aplicación muda.
    volume: clamp(finite(s.volume, DEFAULT_SETTINGS.volume), LIMITS.volume.min, LIMITS.volume.max)
  };
}

/** Velocidad a la que se emite cada carácter (PPM). */
export function charWpm(settings) {
  return settings.farnsworth
    ? Math.max(settings.wpm, FARNSWORTH_CHAR_WPM)
    : settings.wpm;
}

/** Unidad global en segundos: 1.2 / PPM. */
export function unitSeconds(settings) {
  return 1.2 / settings.wpm;
}

/** Unidad de carácter en segundos (más corta que la global si hay Farnsworth). */
export function charUnitSeconds(settings) {
  return 1.2 / charWpm(settings);
}

/** Unidades de PARIS que son contenido de carácter (elementos + huecos intra). */
export const PARIS_CHAR_UNITS = 31;
/** Unidades de PARIS que son espaciado estirable (4x3 entre letras + 7 de palabra). */
export const PARIS_GAP_UNITS = 19;

/**
 * Factor de estirado de los huecos, en unidades de carácter. 1 sin Farnsworth.
 *
 * Derivación (estándar ARRL, "A Standard for Morse Timing Using the Farnsworth
 * Technique"). Con velocidad de carácter C y velocidad efectiva S, una palabra
 * estándar debe durar 60/S segundos. El contenido de carácter ya consume
 * 31 * (1.2/C). Lo que queda se reparte entre las 19 unidades de espaciado:
 *
 *   ta = 60/S - 37.2/C           (segundos de espaciado por palabra estándar)
 *   hueco de una unidad = ta/19
 *   F = (ta/19) / (1.2/C) = (50*C/S - 31) / 19
 *
 * Con C = S da exactamente 1, así que la misma expresión sirve con Farnsworth
 * apagado. Nunca baja de 1: el espaciado ITU es el suelo, no el techo.
 *
 * La versión anterior usaba `C/S`, que deja los huecos a 3 y 7 unidades de la
 * velocidad EFECTIVA en vez de repartir el tiempo sobrante. Resultado: a 5 PPM
 * pedidos se emitían 9,05 PPM reales. Ver tests/timing.test.js.
 */
export function spacingFactor(settings) {
  const c = charWpm(settings);
  const s = settings.wpm;
  const f = ((50 * c) / s - PARIS_CHAR_UNITS) / PARIS_GAP_UNITS;
  return Number.isFinite(f) ? Math.max(f, 1) : 1;
}

/**
 * Velocidad efectiva real de unos ajustes, en PPM.
 *
 * Se calcula desde la misma aritmética que produce la timeline, así que si el
 * motor cambia, este número cambia con él. Existe para poder afirmarlo en los
 * tests en vez de suponerlo.
 */
export function effectiveWpm(settings) {
  const uc = charUnitSeconds(settings);
  const gap = spacingFactor(settings);
  const parisSeconds = PARIS_CHAR_UNITS * uc + PARIS_GAP_UNITS * uc * gap;
  return 60 / parisSeconds;
}

/**
 * @typedef {{kind:'dit'|'dah', t0:number, t1:number, letterIndex:number, symIndex:number}} MorseElement
 * @typedef {{ch:string, code:string, t0:number, t1:number, firstEl:number, lastEl:number}} MorseLetter
 * @typedef {{elements:MorseElement[], letters:MorseLetter[], duration:number,
 *            t0s:Float64Array, t1s:Float64Array, settings:Settings}} Timeline
 */

/**
 * Construye la línea de tiempo completa de un texto, en segundos relativos a 0.
 * Determinista y testeable sin navegador.
 *
 * @param {string} text
 * @param {Settings} settings ya resueltos
 * @returns {Timeline}
 */
export function buildTimeline(text, settings) {
  const uc = charUnitSeconds(settings);
  const gap = spacingFactor(settings);
  const words = tokenize(text);

  /** @type {MorseElement[]} */ const elements = [];
  /** @type {MorseLetter[]} */ const letters = [];
  let t = 0;

  words.forEach((word, wi) => {
    word.forEach((ch, li) => {
      const code = MORSE[ch];
      const firstEl = elements.length;
      const letterStart = t;

      for (let s = 0; s < code.length; s++) {
        const isDah = code[s] === '-';
        const len = isDah ? uc * 3 : uc;
        elements.push({
          kind: isDah ? 'dah' : 'dit',
          t0: t,
          t1: t + len,
          letterIndex: letters.length,
          symIndex: s
        });
        t += len;
        if (s < code.length - 1) t += uc;     // hueco entre elementos: 1 unidad
      }

      letters.push({
        ch,
        code,
        t0: letterStart,
        t1: t,
        firstEl,
        lastEl: elements.length - 1
      });

      if (li < word.length - 1) t += uc * 3 * gap;   // hueco entre letras
    });
    if (wi < words.length - 1) t += uc * 7 * gap;    // hueco entre palabras
  });

  // Arrays tipados paralelos: el muestreo por frame es aritmética pura,
  // sin recorrer objetos ni alocar.
  const n = elements.length;
  const t0s = new Float64Array(n);
  const t1s = new Float64Array(n);
  for (let i = 0; i < n; i++) { t0s[i] = elements[i].t0; t1s[i] = elements[i].t1; }

  return { elements, letters, duration: t, t0s, t1s, settings };
}

