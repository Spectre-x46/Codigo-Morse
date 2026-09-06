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
 * `ui/frame-loop.js` es quien llama a `sample()` una vez por frame y reparte el
 * resultado. No existe un solo temporizador visual, y por eso el sistema se
 * repara solo tras un salto de tiempo: si la pestaña estuvo oculta 10 s, el
 * siguiente muestreo describe el instante correcto sin acumular error.
 */

import * as audio from './audio.js';
import { sampleKeyer, isKeying } from './keyer.js';
import { onPulse, pulse } from './pulse.js';
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
 *   playbackId: number|null
 * }} SignalState
 */

/** Objeto reciclado: `sample()` se llama 60 veces por segundo y no debe alocar. */
const state = {
  on: false, kind: null, source: null, level: 0, progress: 0,
  elementIndex: -1, letterIndex: -1, playbackId: null
};

/* Memoria de la muestra anterior. Sólo sirve para sostener `letterIndex`
   durante los huecos: entre dos letras no suena nada, pero la letra en curso
   sigue siendo la última empezada. */
let prevLetter = -1;
let prevPlaybackId = null;

/** Avisa de que hay algo que animar: rearma el bucle de frames. */
export const wake = pulse;
export const onWake = onPulse;

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

  remember();
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

function remember() {
  if (state.playbackId !== prevPlaybackId) {
    prevLetter = -1;
    prevPlaybackId = state.playbackId;
  }
  if (state.letterIndex >= 0) prevLetter = state.letterIndex;
}

/** Reinicia el diferencial. Se llama al cambiar de vista. */
export function reset() {
  prevLetter = -1;
  prevPlaybackId = null;
  setState(false, null, null, 0, -1, -1, null);
}

/**
 * ¿Hay algo que merezca seguir animando?
 * Incluye la llave pulsada: si no, el bucle podía dormirse en mitad de una
 * raya larga y el contacto se quedaba encendido.
 */
export function isActive() {
  return state.on || isKeying() || player.current() !== null;
}
