/**
 * Preferencia de movimiento reducido, en un solo sitio.
 *
 * Distinción importante en este proyecto: iluminar el símbolo que está sonando
 * NO es decoración, es información — se mantiene siempre. Lo que se reduce es
 * el espectáculo: entradas escalonadas, ciclo ocioso de la llave, arcos de
 * señal, transiciones largas.
 */

const query = matchMedia('(prefers-reduced-motion: reduce)');

export const prefersReduced = () => query.matches;

/** Aplica el atributo raíz que consume el CSS. */
export function syncDocument() {
  const apply = () => {
    document.documentElement.dataset.motion = query.matches ? 'reduced' : 'full';
  };
  apply();
  query.addEventListener('change', apply);
}
