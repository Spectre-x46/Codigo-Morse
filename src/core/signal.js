/**
 * Frontera única entre el núcleo y la interfaz. Sin DOM.
 *
 * Toda la UI que reacciona al Morse —waveform, glifo, la llave del hero, el
 * indicador de transmisión— lee EL MISMO objeto de estado. No hay ramas
 * `if (reproduciendo) ... else if (pulsando) ...` repartidas por los
 * componentes: aquí se mezclan las dos fuentes y se publica una sola verdad.
 *
 * La llave en vivo tiene prioridad sobre la reproducción: si el usuario
 * empieza a transmitir mientras algo suena, manda su mano.
 *
 * Los eventos discretos ('symbolstart', 'letter', ...) se DERIVAN comparando
 * la muestra actual con la anterior. No existe un solo temporizador visual, y
 * por eso el sistema se repara solo tras un salto de tiempo: si la pestaña
 * estuvo oculta 10 s, el siguiente muestreo emite todo lo que se cruzó.
 */

import * as audio from './audio.js';
import { sampleKeyer } from './keyer.js';
import * as player from './player.js';

/**
 * @typedef {{
 *   on: boolean,
 *   kind: 'dit'|'dah'|null,
 *   source: 'play'|'key'|null,
 *   level: number,
 *   progress: number,
 *   elementIndex: number,
 *   letterIndex: number,
 *   playbackId: number|null,
 *   seq: number
 * }} SignalState
 */

/** Objeto reciclado: `sample()` se llama 60 veces por segundo y no debe alocar. */
const state = {
  on: false, kind: null, source: null, level: 0, progress: 0,
  elementIndex: -1, letterIndex: -1, playbackId: null, seq: 0
};

let prevOn = false;
let prevElement = -1;
let prevLetter = -1;
let prevPlaybackId = null;

const frameSubs = new Set();
const eventSubs = new Set();
const wakeSubs = new Set();

/** Suscripción por frame: recibe el SignalState en cada muestreo. */
export function subscribe(fn) {
  frameSubs.add(fn);
  return () => frameSubs.delete(fn);
}

/**
 * Eventos discretos:
 * 'symbolstart' {kind,elementIndex,letterIndex,source} · 'symbolend' ·
 * 'letter' {ch,code,index} · 'start' · 'end'
 */
export function onSignalEvent(fn) {
  eventSubs.add(fn);
  return () => eventSubs.delete(fn);
}

function emit(type, detail) {
  for (const fn of eventSubs) { try { fn(type, detail); } catch { /* aislado */ } }
}

/** Avisa de que hay algo que animar: rearma el bucle de frames. */
export function wake() {
  for (const fn of wakeSubs) { try { fn(); } catch { /* aislado */ } }
}
export function onWake(fn) {
  wakeSubs.add(fn);
  return () => wakeSubs.delete(fn);
}

export const subscriberCount = () => frameSubs.size + eventSubs.size;

/**
 * Muestrea el estado en un instante dado.
 *
 * @param {number} [t] tiempo audible; por defecto `audio.audibleNow()`
 * @returns {SignalState} objeto reciclado — no guardarlo, leer sus campos
 */
export function sample(t = audio.audibleNow()) {
  const key = sampleKeyer(t);

  if (key) {
    setState(true, key.kind, 'key', key.progress, -1, -1, null);
  } else {
    const pb = player.current();
    const idx = pb ? pb.indexAt(t) : -1;
    if (pb && idx >= 0) {
      const el = pb.timeline.elements[idx];
      const span = el.t1 - el.t0;
      const local = t - pb.startTime - el.t0;
      setState(true, el.kind, 'play', span > 0 ? local / span : 0,
        idx, el.letterIndex, pb.id);
    } else {
      setState(false, null, pb ? 'play' : null, 0, -1,
        pb ? prevLetter : -1, pb ? pb.id : null);
    }
  }

  diffAndEmit();
  return state;
}

function setState(on, kind, source, progress, elementIndex, letterIndex, playbackId) {
  state.on = on;
  state.kind = kind;
  state.source = source;
  state.progress = Math.min(Math.max(progress, 0), 1);
  state.elementIndex = elementIndex;
  state.letterIndex = letterIndex;
  state.playbackId = playbackId;
  // Envolvente simple: ataque rápido, sin leer el grafo de audio.
  state.level = on ? Math.min(0.35 + state.progress * 0.65, 1) : 0;
}

function diffAndEmit() {
  if (state.playbackId !== prevPlaybackId) {
    prevElement = -1;
    prevLetter = -1;
    prevPlaybackId = state.playbackId;
  }

  if (state.elementIndex !== prevElement) {
    if (prevElement >= 0) emit('symbolend', { elementIndex: prevElement });
    if (state.elementIndex >= 0) {
      state.seq++;
      emit('symbolstart', {
        kind: state.kind,
        source: state.source,
        elementIndex: state.elementIndex,
        letterIndex: state.letterIndex
      });
    }
    prevElement = state.elementIndex;
  }

  if (state.letterIndex !== prevLetter && state.letterIndex >= 0) {
    const pb = player.current();
    const letter = pb?.timeline.letters[state.letterIndex];
    if (letter) {
      emit('letter', { ch: letter.ch, code: letter.code, index: state.letterIndex });
    }
    prevLetter = state.letterIndex;
  }

  if (state.on !== prevOn) {
    if (state.on) state.seq++;
    prevOn = state.on;
  }
}

/** Reinicia el diferencial. Se llama al cambiar de vista. */
export function reset() {
  prevOn = false;
  prevElement = -1;
  prevLetter = -1;
  prevPlaybackId = null;
  setState(false, null, null, 0, -1, -1, null);
}

/** ¿Hay algo que merezca seguir animando? */
export function isActive() {
  return state.on || player.current() !== null;
}
