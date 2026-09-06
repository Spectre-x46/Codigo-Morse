/**
 * Tabla Morse internacional (ITU-R M.1677-1).
 * Sin dependencias del DOM.
 */

export const MORSE = {
  A: '.-',    B: '-...',  C: '-.-.',  D: '-..',   E: '.',     F: '..-.',
  G: '--.',   H: '....',  I: '..',    J: '.---',  K: '-.-',   L: '.-..',
  M: '--',    N: '-.',    O: '---',   P: '.--.',  Q: '--.-',  R: '.-.',
  S: '...',   T: '-',     U: '..-',   V: '...-',  W: '.--',   X: '-..-',
  Y: '-.--',  Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.',
  '=': '-...-',  '+': '.-.-.'
};

/**
 * Orden de presentación explícito.
 *
 * Necesario porque `Object.keys(MORSE)` NO respeta el orden de escritura: la
 * especificación de JS enumera primero las claves con forma de entero, así que
 * '0'..'9' saldrían antes que 'A'..'Z' y el abecedario empezaría en dígitos.
 */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const DIGITS = '0123456789'.split('');
export const PUNCT = ['.', ',', '?', '/', '=', '+'];
export const ORDER = [...LETTERS, ...DIGITS, ...PUNCT];

/** Código Morse -> carácter. */
export const REVERSE = Object.fromEntries(
  Object.entries(MORSE).map(([ch, code]) => [code, ch])
);

/** '.-' -> '·—' para mostrar en pantalla. */
export const fmt = (code) => code.replace(/\./g, '·').replace(/-/g, '—');

/** ¿Se puede transmitir este carácter? */
export const isSendable = (ch) => Object.hasOwn(MORSE, ch);

/**
 * Normaliza texto en español a los caracteres de la tabla ITU.
 *
 * La aplicación está en español y la tabla internacional no tiene tildes ni Ñ.
 * Sin este paso, "CÓMO ESTÁS" se transmitía como "CMO ESTS" y "AÑO" como "AO":
 * las letras acentuadas no se sustituían, desaparecían.
 *
 * La regla es descomponer en NFD y quitar los diacríticos combinantes, lo que
 * resuelve de una vez Á É Í Ó Ú, Ü, Ç y también Ñ -> N (la virgulilla es un
 * diacrítico como cualquier otro).
 *
 * **Ñ se transmite como N, a propósito.** Existe una extensión nacional muy
 * usada (`--.--`) pero no está en ITU-R M.1677-1, que es la tabla que declara
 * este proyecto y de la que salen el abecedario, los niveles y el decodificador
 * de la llave. Añadirla obligaría a que la llave decodificase `--.--` como Ñ y
 * a meter una celda no-ITU en el abecedario. Un operador que reciba esto copia
 * "ANO"; la alternativa —borrar la letra— no la copia nadie.
 *
 * Los signos que abren (¿ ¡) se descartan: no tienen equivalente Morse y su
 * pareja de cierre sí se transmite cuando está en la tabla.
 */
export function normalizeText(text) {
  // Sólo texto y números se convierten. `String(null)` da "null" y
  // `String({})` da "[object Object]": ambos son palabras transmisibles, así
  // que un valor ausente acababa sonando como la palabra NULL.
  const raw = typeof text === 'string' ? text
    : typeof text === 'number' && Number.isFinite(text) ? String(text)
    : '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita los diacríticos ya separados
    .toUpperCase();
}

/**
 * Divide texto en palabras -> letras transmisibles.
 * Normaliza primero (ver `normalizeText`) y descarta lo que sigue sin estar
 * en la tabla.
 * @returns {string[][]} palabras, cada una como array de caracteres
 */
export function tokenize(text) {
  return normalizeText(text)
    .trim()
    .split(/\s+/)
    .map((word) => [...word].filter(isSendable))
    .filter((word) => word.length > 0);
}
