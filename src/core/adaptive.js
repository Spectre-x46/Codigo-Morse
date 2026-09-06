/**
 * Selección adaptativa de ítems por debilidad. Sin DOM.
 *
 * En la versión anterior esto era una pestaña llamada "Recuperar" que el
 * usuario tenía que elegir. Ahora es invisible: Aprender siempre insiste en
 * los caracteres flojos sin pedirle permiso a nadie.
 *
 * El peso de un carácter sube cuando se falla y cuando apenas se ha visto,
 * así que los recién desbloqueados salen pronto y los ya dominados se
 * espacian solos.
 *
 * **Esto NO es repetición espaciada.** El archivo se llamaba `srs.js`, que
 * anuncia un sistema que aquí no existe: no hay marcas de tiempo, ni
 * intervalos, ni fechas de próxima revisión. Es muestreo ponderado por
 * precisión — un carácter flojo sale más a menudo dentro de la misma sesión,
 * y nada más. El nombre ahora dice lo que hace.
 */

import { letterStat } from './store.js';
import { unlockedSet, LEVELS, MAX_LEVEL, WINDOW_SIZE, WINDOW_MIN, WINDOW_ACCURACY } from '../data/levels.js';

/** Suelo de peso: incluso un carácter perfecto sigue apareciendo de vez en cuando. */
const BASE_WEIGHT = 0.15;
/** Empuje extra para caracteres casi sin datos. */
const NOVELTY_BOOST = 0.8;
const NOVELTY_THRESHOLD = 3;

/** Precisión de un carácter, 0..1. Sin datos cuenta como 0. */
export function accuracyOf(ch) {
  const { c, t } = letterStat(ch);
  return t > 0 ? c / t : 0;
}

/** Peso de muestreo de un carácter. Mayor = sale más. */
export function weightOf(ch) {
  const { t } = letterStat(ch);
  let w = (1 - accuracyOf(ch)) + BASE_WEIGHT;
  if (t < NOVELTY_THRESHOLD) w += NOVELTY_BOOST;
  return w;
}

/** Elige un carácter del conjunto ponderando por debilidad. */
export function pickWeighted(pool, avoid) {
  const candidates = pool.length > 1 && avoid
    ? pool.filter((c) => c !== avoid)
    : pool.slice();
  if (candidates.length === 0) return pool[0];

  const weights = candidates.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Elección uniforme. */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Genera opciones de respuesta: la correcta más `n` distractores, barajadas.
 * Prefiere distractores que se confundan de verdad (los del mismo nivel).
 */
export function buildOptions(correct, pool, n) {
  const others = pool.filter((c) => c !== correct);
  const chosen = [];
  while (chosen.length < n && chosen.length < others.length) {
    const c = others[Math.floor(Math.random() * others.length)];
    if (!chosen.includes(c)) chosen.push(c);
  }
  const all = [correct, ...chosen];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Conjunto activo para el nivel dado. */
export function activeSet(level) {
  return unlockedSet(level);
}

/**
 * ¿Toca subir de nivel?
 * Ventana deslizante de los últimos intentos: hacen falta al menos
 * WINDOW_MIN respuestas y WINDOW_ACCURACY de acierto.
 *
 * @param {boolean[]} recent
 * @param {number} level
 */
export function shouldLevelUp(recent, level) {
  if (level >= MAX_LEVEL) return false;
  if (recent.length < WINDOW_MIN) return false;
  const hits = recent.filter(Boolean).length;
  return hits / recent.length >= WINDOW_ACCURACY;
}

/** Añade un resultado a la ventana, recortando al tamaño máximo. */
export function pushWindow(recent, correct) {
  const next = [...recent, correct];
  return next.length > WINDOW_SIZE ? next.slice(next.length - WINDOW_SIZE) : next;
}

export { LEVELS, MAX_LEVEL };
