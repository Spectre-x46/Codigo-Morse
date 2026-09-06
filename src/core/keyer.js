/**
 * Motor de la llave telegráfica. Sin DOM: no conoce botones ni selectores.
 * Quien capture los eventos de puntero o teclado es cosa de `ui/`.
 *
 * La distinción punto/raya se DERIVA del reloj de audio en cada muestreo, no
 * se cronometra con `setTimeout`. En la versión anterior el umbral audible
 * usaba `AudioContext.currentTime` y el medidor visual usaba
 * `performance.now()`: dos relojes distintos para el mismo evento, que se
 * separaban bajo carga. Ahora hay uno solo.
 *
 * Los únicos temporizadores que quedan son los huecos LÓGICOS de fin de letra
 * y fin de palabra. No tienen contraparte sonora y toleran ±30 ms, pero aun
 * así revalidan contra el reloj de audio al dispararse.
 */

import * as audio from './audio.js';
import { resolveSettings, unitSeconds } from './timing.js';
import { REVERSE } from '../data/morse.js';

/** Un símbolo pasa a raya al superar 2 unidades pulsado. */
const DASH_THRESHOLD_UNITS = 2;

const listeners = new Set();
function emit(type, detail) {
  for (const fn of listeners) { try { fn(type, detail); } catch { /* aislado */ } }
}

/** Eventos: 'symbol' {kind,code} · 'letter' {ch,code} · 'word' · 'change' {buffer} */
export function onKeyerEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let settings = resolveSettings();
let isDown = false;
let downAt = 0;
let buffer = '';
let letterTimer = 0;
let wordTimer = 0;

export const getBuffer = () => buffer;
export const isKeying = () => isDown;

export function configure(partial) {
  settings = resolveSettings(partial);
}

/** Umbral punto/raya en segundos, derivado de la velocidad actual. */
function dashThreshold() {
  return unitSeconds(settings) * DASH_THRESHOLD_UNITS;
}
/** Huecos lógicos, con suelo para que sean usables a mano. */
const letterGap = () => Math.max(unitSeconds(settings) * 4, 0.6);
const wordGap = () => Math.max(unitSeconds(settings) * 7, 1.2);

/** Empieza a transmitir. Debe llamarse desde un gesto real del usuario. */
export function press(partial) {
  if (isDown) return;
  if (partial) settings = resolveSettings(partial);
  audio.ensureContext();
  isDown = true;
  clearTimeout(letterTimer);
  clearTimeout(wordTimer);
  audio.keyDown(settings.freq);
  downAt = audio.audibleNow();
}

/** Suelta la llave: cierra el símbolo y programa el cierre de letra. */
export function release() {
  if (!isDown) return;
  isDown = false;
  audio.keyUp();

  const held = audio.audibleNow() - downAt;
  const kind = held >= dashThreshold() ? 'dah' : 'dit';
  buffer += kind === 'dah' ? '-' : '.';

  emit('symbol', { kind, code: buffer });
  emit('change', { buffer });

  letterTimer = setTimeout(finalizeLetter, letterGap() * 1000);
}

/** Cierra la letra en curso y la publica. */
function finalizeLetter() {
  if (!buffer) return;
  const code = buffer;
  const ch = REVERSE[code] ?? '?';
  buffer = '';
  emit('letter', { ch, code });
  emit('change', { buffer });
  wordTimer = setTimeout(() => emit('word', {}), (wordGap() - letterGap()) * 1000);
}

/** Vacía el buffer sin emitir letra (botón "limpiar", cambio de vista). */
export function clear() {
  clearTimeout(letterTimer);
  clearTimeout(wordTimer);
  buffer = '';
  emit('change', { buffer });
}

/** Suelta la llave si quedó pulsada. Se llama al navegar, en blur y pointercancel. */
export function forceRelease() {
  if (isDown) release();
}

/** Libera todo: se llama al desmontar una vista. */
export function dispose() {
  forceRelease();
  clearTimeout(letterTimer);
  clearTimeout(wordTimer);
  buffer = '';
}

/**
 * Muestreo para el bucle visual.
 *
 * @param {number} t tiempo audible (`audio.audibleNow()`)
 * @returns {{on:boolean, kind:'dit'|'dah', progress:number}|null} null si no se está pulsando
 */
export function sampleKeyer(t) {
  if (!isDown) return null;
  const held = Math.max(t - downAt, 0);
  const thr = dashThreshold();
  return {
    on: true,
    kind: held >= thr ? 'dah' : 'dit',
    progress: Math.min(held / thr, 1)
  };
}
