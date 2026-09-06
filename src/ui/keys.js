/**
 * Reglas de teclado compartidas.
 *
 * Space y Enter pertenecen al elemento enfocado. En HTML nativo Space activa
 * un botón y Enter sigue un enlace; un atajo global que haga `preventDefault()`
 * sobre ellos rompe esa promesa sin avisar. Pasaba en las dos vistas: con el
 * foco en una opción de Aprender, Space repetía la señal en vez de responder;
 * con el foco en "Limpiar" del Modo libre, Space transmitía en vez de limpiar.
 *
 * Un `e.target instanceof HTMLInputElement` no basta: deja fuera botones,
 * enlaces, selects, textareas y cualquier cosa con `contenteditable` o un rol
 * interactivo.
 */

/**
 * Controles que ya tienen semántica propia para Space/Enter.
 * `[tabindex]:not([tabindex="-1"])` cubre lo hecho a mano; se excluye -1
 * porque `<main tabindex="-1">` sólo existe para recibir foco programático.
 */
const INTERACTIVE = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
  '[contenteditable=""]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="switch"]',
  '[role="radio"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="slider"]', '[role="spinbutton"]', '[role="textbox"]'
].join(',');

/**
 * ¿El evento va dirigido a un control interactivo real?
 * @param {EventTarget|null} target
 * @param {Element} [except] control para el que el atajo SÍ es el
 *   comportamiento esperado (la llave del Modo libre).
 */
export function isInteractive(target, except) {
  if (!(target instanceof Element)) return false;
  const el = target.closest(INTERACTIVE);
  if (!el) return false;
  if (except && (el === except || except.contains(el))) return false;
  return true;
}

/** ¿Se está escribiendo en un campo de texto? */
export function isTyping(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input,textarea,[contenteditable=""],[contenteditable="true"]');
}
