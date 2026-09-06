/**
 * Mnemotecnias por carácter. Se muestran como apoyo, nunca como sustituto
 * del oído: la idea del método Koch es reconocer el ritmo, no memorizar tabla.
 */
export const TIPS = {
  E: 'E es el destello más corto: un punto.',
  T: 'T es su opuesto: una raya.',
  A: 'A = E seguido de T. La N es su espejo.',
  N: 'N es el espejo de A.',
  I: 'I es la E repetida. La M es la T repetida.',
  M: 'M es la T doble.',
  S: 'S son tres puntos. La O son tres rayas.',
  O: 'O son tres rayas. Piensa en algo largo.',
  R: 'R tiene ritmo de vaivén: punto, raya, punto.',
  H: 'H son cuatro puntos seguidos.',
  D: 'D es raya y dos puntos. La B la extiende.',
  U: 'U sube al final.',
  L: 'L: punto, raya, dos puntos.',
  C: 'C tiene ritmo alterno.',
  G: 'G: dos rayas y un punto.',
  K: 'K es simétrica: raya, punto, raya.',
  W: 'W es como una A que sigue subiendo.',
  B: 'B: raya y tres puntos.',
  P: 'P encierra dos rayas entre puntos.',
  F: 'F: dos puntos, raya, punto.',
  V: 'V son tres puntos y un golpe. Como Beethoven.',
  X: 'X abre y cierra con raya.',
  Y: 'Y: raya, punto, dos rayas.',
  Z: 'Z: dos rayas y dos puntos.',
  J: 'J: un punto y tres rayas.',
  Q: 'Q: dos rayas, punto, raya.'
};

/** Primera pista disponible del conjunto de caracteres dado. */
export function tipFor(chars) {
  for (const ch of chars) if (TIPS[ch]) return TIPS[ch];
  return '';
}
