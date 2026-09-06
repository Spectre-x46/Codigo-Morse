/**
 * El ÚNICO requestAnimationFrame de la aplicación.
 *
 * Muestrea `signal.sample(audibleNow())` y reparte el estado. Los componentes
 * no tienen su propio rAF: si cada waveform, glifo y llave abriera el suyo,
 * habría cinco bucles compitiendo y quemando batería en reposo.
 *
 * El bucle es refcontado Y auto-apagable: cuando no hay nada sonando durante
 * medio segundo se detiene solo, y `signal.wake()` lo rearma. En reposo la
 * página consume cero frames.
 */

import * as audio from '../core/audio.js';
import * as signal from '../core/signal.js';

/** Margen de inactividad antes de dormir el bucle. */
const IDLE_MS = 500;

let rafId = 0;
let refs = 0;
let idleSince = 0;
let paused = false;
let coarseTimer = 0;

const subs = new Set();

function tick() {
  rafId = 0;
  const state = signal.sample(audio.audibleNow());

  for (const fn of subs) {
    try { fn(state); } catch { /* un componente roto no para el bucle */ }
  }

  if (signal.isActive()) {
    idleSince = 0;
  } else {
    const t = performance.now();          // sólo para decidir cuándo dormir,
    if (!idleSince) idleSince = t;        // nunca para timing Morse
    if (t - idleSince > IDLE_MS) return;  // duerme
  }
  schedule();
}

function schedule() {
  if (rafId || paused || refs === 0) return;
  rafId = requestAnimationFrame(tick);
}

/** Suscribe un callback por frame. Devuelve la función de baja. */
export function subscribe(fn) {
  subs.add(fn);
  refs++;
  wake();
  return () => {
    if (!subs.delete(fn)) return;
    refs = Math.max(0, refs - 1);
    if (refs === 0 && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  };
}

/** Rearma el bucle porque hay algo que animar. */
export function wake() {
  idleSince = 0;
  schedule();
}

/**
 * Cuántos componentes están escuchando. Si crece al navegar entre rutas hay
 * una fuga: alguien se suscribió sin registrar la baja en el scope de su vista.
 */
export const subscriberCount = () => subs.size;
/** ¿Está el bucle realmente corriendo? En reposo debe ser false. */
export const isRunning = () => rafId !== 0;

/** Una muestra manual, sin esperar al frame (catch-up al volver de background). */
export function pump() {
  signal.sample(audio.audibleNow());
}

function onVisibility() {
  if (document.hidden) {
    paused = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    // Con la pestaña oculta no hay frames, pero el audio sigue. Un pulso
    // grueso mantiene vivos los eventos lógicos (fin de letra, fin de
    // reproducción) sin repartir a los componentes visuales.
    clearInterval(coarseTimer);
    coarseTimer = setInterval(() => { if (signal.isActive()) pump(); }, 250);
  } else {
    paused = false;
    clearInterval(coarseTimer);
    coarseTimer = 0;
    pump();     // emite de golpe todo lo que se cruzó mientras no mirábamos
    wake();
  }
}

/** Arranca la gestión de visibilidad. Se llama una vez desde app.js. */
export function install() {
  document.addEventListener('visibilitychange', onVisibility);
  signal.onWake(wake);
}
