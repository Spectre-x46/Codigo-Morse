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

/** Completa y acota unos settings parciales. Nunca lanza. */
export function resolveSettings(partial = {}) {
  const s = { ...DEFAULT_SETTINGS, ...partial };
  return {
    wpm: clamp(Number(s.wpm) || DEFAULT_SETTINGS.wpm, LIMITS.wpm.min, LIMITS.wpm.max),
    freq: clamp(Number(s.freq) || DEFAULT_SETTINGS.freq, LIMITS.freq.min, LIMITS.freq.max),
    farnsworth: Boolean(s.farnsworth),
    volume: clamp(Number(s.volume) ?? DEFAULT_SETTINGS.volume, LIMITS.volume.min, LIMITS.volume.max)
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

/** Factor de estirado de los huecos. 1 cuando no hay Farnsworth. */
export function spacingFactor(settings) {
  return Math.max(charWpm(settings) / settings.wpm, 1);
}

/**
 * @typedef {{kind:'dit'|'dah', t0:number, t1:number, letterIndex:number, symIndex:number}} MorseElement
 * @typedef {{ch:string, code:string, t0:number, t1:number, firstEl:number, lastEl:number}} MorseLetter
 * @typedef {{elements:MorseElement[], letters:MorseLetter[], duration:number,
 *            t0s:Float64Array, t1s:Float64Array, settings:Settings, text:string}} Timeline
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

  return { elements, letters, duration: t, t0s, t1s, settings, text: String(text) };
}

/** Timeline de un único código ('.-'), para el abecedario. */
export function timelineForCode(code, settings) {
  const ch = Object.keys(MORSE).find((k) => MORSE[k] === code);
  return buildTimeline(ch ?? '', settings);
}

/** Duración total de un texto sin construir la timeline entera. */
export function durationOf(text, settings) {
  return buildTimeline(text, settings).duration;
}
