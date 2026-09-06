/**
 * Arranque y cableado.
 *
 * Las vistas se cargan con `import()` dinámico: el navegador sólo descarga el
 * módulo de la ruta que se visita. Es partición de código sin bundler.
 */

import * as router from './ui/router.js';
import * as frameLoop from './ui/frame-loop.js';
import * as audio from './core/audio.js';
import * as keyer from './core/keyer.js';
import * as store from './core/store.js';
import { syncDocument } from './ui/motion.js';
import { openSheet, close as closeSheet, isOpen as sheetOpen } from './ui/sheet.js';

syncDocument();
frameLoop.install();

/* Estado inicial desde el almacenamiento. */
const settings = store.getSettings();
keyer.configure(settings);
audio.setVolume(settings.volume);

/* ------------------------------------------------------------------ audio */

/**
 * Reanudar en CADA gesto, no sólo en el primero: iOS vuelve a suspender el
 * contexto al regresar de segundo plano o al bloquear la pantalla. En fase de
 * captura para adelantarse a cualquier handler que quiera sonar.
 */
const resumeAudio = () => { audio.resume(); };
for (const type of ['pointerdown', 'keydown', 'touchstart']) {
  document.addEventListener(type, resumeAudio, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) audio.resume();
});

/* La llave nunca debe quedarse trabada si se pierde el foco o el puntero. */
for (const type of ['blur', 'pointerup', 'pointercancel']) {
  window.addEventListener(type, () => keyer.forceRelease());
}

/* ------------------------------------------------------------------- menú */

const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
const FOCUSABLE = 'a[href],button:not([disabled])';

function setMenu(open) {
  menu.dataset.open = String(open);
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector(FOCUSABLE)?.focus();
}
const menuIsOpen = () => menu.dataset.open === 'true';

menuBtn.addEventListener('click', () => {
  const next = !menuIsOpen();
  setMenu(next);
  if (!next) menuBtn.focus();
});

menu.addEventListener('click', (e) => {
  if (e.target === menu) { setMenu(false); menuBtn.focus(); return; }
  if (e.target.closest('a')) setMenu(false);
});

document.getElementById('menuSettings').addEventListener('click', () => {
  setMenu(false);
  openSheet();
});

menu.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const items = [...menu.querySelectorAll(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (sheetOpen()) { closeSheet(); return; }
  if (menuIsOpen()) { setMenu(false); menuBtn.focus(); }
});

/* ----------------------------------------------------------------- rutas */

const view = (loader) => (root, scope, params) =>
  loader().then((mod) => { if (!scope.disposed) mod.mount(root, scope, params); });

router.define('/', view(() => import('./views/home.js')));
router.define('/aprender', view(() => import('./views/aprender.js')));
router.define('/libre', view(() => import('./views/libre.js')));
router.define('/acerca', view(() => import('./views/acerca.js')));

router.onRouteChange((path) => {
  for (const link of menu.querySelectorAll('a[href]')) {
    const target = link.getAttribute('href').replace(/^#/, '');
    if (target === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const titles = {
    '/': 'Código Morse Online — aprende Morse de oído',
    '/aprender': 'Aprender — Código Morse Online',
    '/libre': 'Modo libre — Código Morse Online',
    '/acerca': 'Acerca de — Código Morse Online'
  };
  document.title = titles[path] ?? titles['/'];
});

router.start(document.getElementById('main'), { fallbackPath: '/' });
