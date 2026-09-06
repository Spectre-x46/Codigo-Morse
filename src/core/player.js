/**
 * Reproducción de texto en Morse. Sin DOM.
 *
 * `playText` NO acepta callbacks ni devuelve una duración: devuelve un handle
 * `Playback` con la timeline dentro. Quien quiera reaccionar al sonido se
 * suscribe a `core/signal.js`, que muestrea contra el reloj de audio.
 *
 * Los settings se pasan explícitamente en cada llamada. El código anterior
 * mutaba el estado global para conseguirlo (`const s=S.wpm; S.wpm=X; ...`),
 * lo que corrompía los ajustes guardados si el usuario tocaba el slider
 * durante esos milisegundos.
 */

import * as audio from './audio.js';
import { buildTimeline, resolveSettings } from './timing.js';
import { pulse } from './pulse.js';

/** Margen antes del primer elemento: da aire al scheduler. */
const LEAD = 0.08;

/**
 * @typedef {'scheduled'|'playing'|'ended'|'stopped'|'blocked'} PlaybackState
 * @typedef {{
 *   id: number,
 *   timeline: import('./timing.js').Timeline,
 *   startTime: number,
 *   endTime: number,
 *   state: PlaybackState,
 *   finished: Promise<'ended'|'stopped'|'blocked'>,
 *   stop(): void,
 *   indexAt(t:number): number,
 *   progress(t:number): number
 * }} Playback
 */

let nextId = 1;
/** @type {Playback|null} */
let currentPlayback = null;

const listeners = new Set();

/** Suscribirse a eventos de reproducción: 'start' | 'end' | 'needsgesture'. */
export function onPlayerEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(type, detail) {
  for (const fn of listeners) { try { fn(type, detail); } catch { /* aislado */ } }
}

export const current = () => currentPlayback;

/** Detiene lo que esté sonando. */
export function stopAll() {
  currentPlayback?.stop();
}

/**
 * Agenda un texto y devuelve el handle.
 *
 * @param {string} text
 * @param {Partial<import('./timing.js').Settings>} [partialSettings]
 * @returns {Playback}
 */
export function playText(text, partialSettings) {
  const settings = resolveSettings(partialSettings);
  const timeline = buildTimeline(text, settings);

  stopAll();

  // Si el contexto está suspendido, `currentTime` no avanza: agendar contra
  // un reloj congelado daría silencio con visuales congelados, que es
  // indistinguible de un cuelgue. Mejor decirlo.
  if (!audio.isRunning()) {
    audio.resume();
    const blocked = makeBlocked(timeline);
    emit('needsgesture', { playback: blocked });
    return blocked;
  }

  if (timeline.elements.length === 0) return makeBlocked(timeline, 'ended');

  const startTime = audio.now() + LEAD;
  const handle = audio.scheduleUtterance(timeline, startTime);
  if (!handle) return makeBlocked(timeline);

  let settle;
  const finished = new Promise((res) => { settle = res; });

  /** @type {Playback} */
  const pb = {
    id: nextId++,
    timeline,
    startTime,
    endTime: startTime + timeline.duration,
    state: 'scheduled',
    finished,
    stop() {
      if (pb.state === 'ended' || pb.state === 'stopped') return;
      pb.state = 'stopped';
      handle.stop();
      if (currentPlayback === pb) currentPlayback = null;
      emit('end', { playback: pb, reason: 'stopped' });
      settle('stopped');
    },
    /** Índice del elemento sonando en `t` (tiempo de audio), o -1. */
    indexAt(t) {
      const local = t - pb.startTime;
      if (local < 0 || local > timeline.duration) return -1;
      const { t0s, t1s } = timeline;
      // Búsqueda binaria: O(log n), sin alocaciones.
      let lo = 0, hi = t0s.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (local < t0s[mid]) hi = mid - 1;
        else if (local >= t1s[mid]) lo = mid + 1;
        else return mid;
      }
      return -1;
    },
    progress(t) {
      const local = t - pb.startTime;
      return Math.min(Math.max(local / timeline.duration, 0), 1);
    }
  };

  handle.onended(() => {
    if (pb.state === 'stopped') return;
    pb.state = 'ended';
    if (currentPlayback === pb) currentPlayback = null;
    emit('end', { playback: pb, reason: 'ended' });
    settle('ended');
  });

  currentPlayback = pb;
  pb.state = 'playing';
  emit('start', { playback: pb });
  pulse();   // arranca el bucle visual aunque estuviera dormido
  return pb;
}

/** Reproduce el código de un solo carácter respetando los mismos settings. */
export function playChar(ch, partialSettings) {
  return playText(ch, partialSettings);
}

function makeBlocked(timeline, state = 'blocked') {
  return {
    id: nextId++,
    timeline,
    startTime: 0,
    endTime: 0,
    state,
    finished: Promise.resolve(state === 'ended' ? 'ended' : 'blocked'),
    stop() {},
    indexAt: () => -1,
    progress: () => 0
  };
}
