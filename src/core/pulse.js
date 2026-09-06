/**
 * Aviso mínimo de "ha empezado algo que hay que animar".
 *
 * Vive en su propio módulo, sin importar nada, para romper el ciclo: el bucle
 * de frames se apaga solo cuando no hay señal, y quien la origina —la llave y
 * el reproductor— tiene que poder despertarlo. Si `keyer` o `player`
 * importaran `signal` para eso, se formaría una dependencia circular, porque
 * `signal` ya los importa a ellos.
 */

const subs = new Set();

/** @param {() => void} fn */
export function onPulse(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function pulse() {
  for (const fn of subs) {
    try { fn(); } catch { /* un suscriptor roto no bloquea a los demás */ }
  }
}
