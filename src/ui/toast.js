/** Aviso efímero. `role="status"` ya está en el HTML, así que se anuncia solo. */

let timer = 0;

export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.show = 'true';
  clearTimeout(timer);
  timer = setTimeout(() => { el.dataset.show = 'false'; }, ms);
}
