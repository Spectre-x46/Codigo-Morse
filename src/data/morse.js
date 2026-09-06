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
 * Divide texto en palabras -> letras transmisibles.
 * Descarta lo que no está en la tabla.
 * @returns {string[][]} palabras, cada una como array de caracteres
 */
export function tokenize(text) {
  return String(text)
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((word) => [...word].filter(isSendable))
    .filter((word) => word.length > 0);
}
