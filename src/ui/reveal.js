/**
 * Apariciones al hacer scroll, con IntersectionObserver.
 *
 * Un solo observador compartido para toda la página: un observador por
 * elemento multiplicaría el trabajo del hilo principal justo cuando el
 * scheduler de audio necesita el hueco.
 *
 * Marca el elemento con `data-revealed="true"` y se desentiende. El CSS decide
 * qué significa eso; aquí no se anima nada a mano.
 */

import { prefersReduced } from './motion.js';

let observer = null;

function ensureObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset.revealed = 'true';
      observer.unobserve(entry.target);   // una sola vez: no re-anima al volver
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  return observer;
}

/**
 * Observa los elementos con `[data-reveal]` dentro de `root`.
 * @returns {() => void} función de baja
 */
export function observeReveals(root) {
  const targets = [...root.querySelectorAll('[data-reveal]')];

  // Con movimiento reducido no hay nada que revelar: se muestran ya.
  if (prefersReduced()) {
    for (const el of targets) el.dataset.revealed = 'true';
    return () => {};
  }

  const io = ensureObserver();
  for (const el of targets) io.observe(el);

  return () => {
    for (const el of targets) io.unobserve(el);
  };
}

/**
 * Sigue el avance de un elemento por el viewport y publica 0..1 en una
 * custom property. Se usa para el bloque cinemático.
 *
 * No usa requestAnimationFrame: se apoya en el evento de scroll pasivo y
 * escribe una sola propiedad, que el CSS consume. Nada de layout thrashing.
 */
export function trackProgress(el, onProgress) {
  if (prefersReduced()) { onProgress(0.5); return () => {}; }

  let ticking = false;
  const measure = () => {
    ticking = false;
    const r = el.getBoundingClientRect();
    const span = r.height - innerHeight;
    if (span <= 0) { onProgress(0); return; }
    onProgress(Math.min(Math.max(-r.top / span, 0), 1));
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(measure);
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  measure();

  return () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onScroll);
  };
}
