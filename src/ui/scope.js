/**
 * Ciclo de vida de una vista.
 *
 * Cada vista monta con un scope y el router lo destruye antes de montar la
 * siguiente. Todo listener, suscripción y componente se registra aquí, así que
 * navegar entre rutas no puede dejar nada colgando.
 *
 * Sin esto, cada visita a Modo libre añadiría un suscriptor más al bucle de
 * frames y la app se iría degradando sin síntoma visible.
 */

export function createScope() {
  let disposers = [];
  let disposed = false;

  return {
    /** addEventListener con limpieza automática. */
    on(target, type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      disposers.push(() => target.removeEventListener(type, handler, options));
    },

    /** Registra una función de limpieza o un objeto con `destroy()`. */
    add(disposable) {
      if (!disposable) return disposable;
      if (typeof disposable === 'function') disposers.push(disposable);
      else if (typeof disposable.destroy === 'function') disposers.push(() => disposable.destroy());
      return disposable;
    },

    /** setTimeout con limpieza automática. */
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      disposers.push(() => clearTimeout(id));
      return id;
    },

    get disposed() { return disposed; },

    /** Idempotente: se puede llamar varias veces sin efecto extra. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let i = disposers.length - 1; i >= 0; i--) {
        try { disposers[i](); } catch { /* una limpieza rota no impide las demás */ }
      }
      disposers = [];
    }
  };
}
