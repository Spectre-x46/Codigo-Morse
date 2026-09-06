/**
 * Dueño exclusivo del grafo de Web Audio. Sin DOM.
 *
 * Grafo:
 *   keyOsc  ──> keyGain  ─┐
 *                         ├─> busGain ──> destination
 *   playOsc ──> playGain ─┘
 *
 * Dos caminos a propósito:
 *
 *  - Llave en vivo: un oscilador persistente cuyo gain se rampa en 5 ms. Es
 *    impredecible (el usuario mantiene pulsado), así que no se puede agendar;
 *    lo que importa es la latencia mínima.
 *
 *  - Reproducción: UN oscilador por locución, con toda la envolvente escrita
 *    de una vez sobre su gain. Una frase de 80 elementos son ~320 puntos de
 *    automatización sobre un nodo, en vez de 160 nodos con su churn de GC.
 *    El hilo de audio recibe las instrucciones una sola vez y no se le vuelve
 *    a molestar: es lo que garantiza que los efectos visuales no puedan
 *    provocar jitter en el sonido.
 *
 * Los AudioNode NO se exportan. Nadie fuera de este módulo toca el grafo.
 */

const ATTACK = 0.005;   // rampa de subida (s) — evita el clic
const RELEASE = 0.006;  // rampa de bajada (s)

/** @type {AudioContext|null} */ let ctx = null;
/** @type {GainNode|null} */ let busGain = null;
/** @type {OscillatorNode|null} */ let keyOsc = null;
/** @type {GainNode|null} */ let keyGain = null;

let volume = 0.25;

/**
 * Crea el contexto. DEBE llamarse dentro de un gesto del usuario.
 * @returns {AudioContext|null}
 */
export function ensureContext() {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor({ latencyHint: 'interactive' });

  busGain = ctx.createGain();
  busGain.gain.value = volume;
  busGain.connect(ctx.destination);

  keyGain = ctx.createGain();
  keyGain.gain.value = 0;
  keyGain.connect(busGain);

  keyOsc = ctx.createOscillator();
  keyOsc.type = 'sine';
  keyOsc.frequency.value = 600;
  keyOsc.connect(keyGain);
  keyOsc.start();

  return ctx;
}

/**
 * Reanuda el contexto. Hay que llamarlo en CADA gesto, no sólo en el primero:
 * iOS vuelve a suspender al regresar de segundo plano o al bloquear pantalla.
 * @returns {Promise<void>}
 */
export async function resume() {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { /* el navegador decidirá */ }
  }
}

export const isRunning = () => ctx?.state === 'running';

/** Reloj del contexto: instante del último bloque renderizado. */
export const now = () => (ctx ? ctx.currentTime : 0);

/**
 * Reloj CANÓNICO para todo lo visual, háptico y de puntuación.
 *
 * `currentTime` marca el inicio del último quantum renderizado, pero lo que el
 * usuario OYE en ese instante se renderizó hace `outputLatency` segundos. Si se
 * ilumina el glifo con `currentTime`, la imagen va sistemáticamente adelantada
 * al sonido entre 5 y 60 ms según el dispositivo (Bluetooth es lo peor).
 *
 * Regla del proyecto: ningún cálculo de timing Morse usa `performance.now()`.
 */
export function audibleNow() {
  if (!ctx) return 0;
  const lat = ctx.outputLatency ?? ctx.baseLatency ?? 0;   // Safari no expone outputLatency
  return ctx.currentTime - Math.min(Math.max(lat, 0), 0.25); // clamp: Android reporta valores absurdos
}

/** Volumen maestro (0..1). Se aplica en vivo a lo que ya está sonando. */
export function setVolume(v) {
  volume = Math.min(Math.max(Number(v) || 0, 0), 1);
  if (busGain && ctx) {
    const t = ctx.currentTime;
    busGain.gain.cancelScheduledValues(t);
    busGain.gain.setValueAtTime(busGain.gain.value, t);
    busGain.gain.linearRampToValueAtTime(volume, t + 0.02);
  }
}

/* ---------------------------------------------------------------- llave viva */

/** Abre la llave: tono continuo hasta `keyUp()`. */
export function keyDown(freq) {
  const c = ensureContext();
  if (!c || !keyGain || !keyOsc) return;
  keyOsc.frequency.setValueAtTime(freq, c.currentTime);
  const g = keyGain.gain;
  const t = c.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(1, t + ATTACK);
}

/** Cierra la llave. */
export function keyUp() {
  if (!ctx || !keyGain) return;
  const g = keyGain.gain;
  const t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + RELEASE);
}

/* -------------------------------------------------------------- reproducción */

/**
 * Agenda una locución completa sobre un único oscilador.
 *
 * @param {import('./timing.js').Timeline} timeline tiempos relativos a 0
 * @param {number} startTime instante de AudioContext del t=0
 * @returns {{stop(at?:number):void, onended(fn:()=>void):void}|null}
 */
export function scheduleUtterance(timeline, startTime) {
  const c = ensureContext();
  if (!c || !busGain) return null;

  const { elements, settings, duration } = timeline;
  if (elements.length === 0) return null;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = settings.freq;

  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(busGain);

  // Una envolvente trapezoidal por elemento, toda escrita de golpe.
  for (const el of elements) {
    const t0 = startTime + el.t0;
    const t1 = startTime + el.t1;
    const a = Math.min(ATTACK, (t1 - t0) / 3);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + a);
    gain.gain.setValueAtTime(1, t1 - a);
    gain.gain.linearRampToValueAtTime(0, t1);
  }

  const endAt = startTime + duration + 0.02;
  osc.start(startTime);
  osc.stop(endAt);

  let ended = false;
  let cb = null;
  osc.onended = () => {
    ended = true;
    try { osc.disconnect(); gain.disconnect(); } catch { /* ya desconectado */ }
    cb?.();
  };

  return {
    stop(at) {
      if (ended) return;
      const t = Math.max(at ?? c.currentTime, c.currentTime);
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.01);
        osc.stop(t + 0.02);
      } catch { /* ya parado */ }
    },
    onended(fn) { cb = fn; if (ended) fn(); }
  };
}

/** Pitido suelto para probar el tono en Ajustes. */
export function beep(freq, seconds = 0.35) {
  const c = ensureContext();
  if (!c || !busGain) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(busGain);
  const t = c.currentTime + 0.02;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + ATTACK);
  gain.gain.setValueAtTime(1, t + seconds - RELEASE);
  gain.gain.linearRampToValueAtTime(0, t + seconds);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch { /* noop */ } };
}
