/**
 * Progresión Koch: se aprende de oído, a velocidad real, sumando caracteres
 * de a poco. Cada nivel añade un grupo al conjunto ya desbloqueado.
 */

export const LEVELS = [
  ['E', 'T'],
  ['A', 'N', 'I', 'M'],
  ['S', 'O'],
  ['R', 'H'],
  ['D', 'U', 'L'],
  ['C', 'G', 'K'],
  ['W', 'B', 'P', 'F'],
  ['V', 'X', 'Y', 'Z', 'J', 'Q'],
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  ['.', ',', '?', '/']
];

export const MAX_LEVEL = LEVELS.length - 1;

/** Todos los caracteres disponibles hasta `levelIdx` incluido. */
export function unlockedSet(levelIdx) {
  const out = [];
  const top = Math.min(Math.max(levelIdx, 0), MAX_LEVEL);
  for (let i = 0; i <= top; i++) out.push(...LEVELS[i]);
  return out;
}

/** Caracteres que introduce este nivel (los nuevos, no los heredados). */
export function levelChars(levelIdx) {
  return LEVELS[Math.min(Math.max(levelIdx, 0), MAX_LEVEL)].slice();
}

/* Umbral de promoción: ventana deslizante de intentos recientes. */
export const WINDOW_SIZE = 12;
export const WINDOW_MIN = 10;
export const WINDOW_ACCURACY = 0.85;

/**
 * Aciertos necesarios sobre la ventana llena.
 *
 * Se calcula, no se escribe a mano. La versión anterior rotulaba "acierta 10
 * de los últimos 12 (≥85%)", pero 10/12 es 83%: con ese texto el usuario
 * cumplía la meta anunciada y el nivel no se abría nunca.
 */
export const WINDOW_TARGET = Math.ceil(WINDOW_SIZE * WINDOW_ACCURACY);   // 11

/** Texto de meta derivado de la lógica real, nunca de una constante escrita a mano. */
export function levelGoalText(level, hits, total) {
  if (level >= MAX_LEVEL) {
    return `Último nivel: ya tienes todo el set. Vas ${hits}/${total}.`;
  }
  return `Acierta ${WINDOW_TARGET} de los últimos ${WINDOW_SIZE} para abrir el nivel ${level + 2}. Vas ${hits}/${total}.`;
}
