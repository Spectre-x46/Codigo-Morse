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

/**
 * Abre o cierra el menú.
 *
 * `inert` es lo que de verdad lo saca del orden de tabulación y del árbol de
 * accesibilidad; `opacity: 0` no hacía ni una cosa ni la otra, así que con el
 * menú cerrado el tabulador caía dentro de cuatro enlaces invisibles y —peor—
 * la trampa de foco de más abajo lo dejaba dando vueltas ahí para siempre.
 * El CSS añade `visibility: hidden` como respaldo para navegadores sin `inert`.
 */
function setMenu(open) {
  menu.dataset.open = String(open);
  menu.inert = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector(FOCUSABLE)?.focus();
}
const menuIsOpen = () => menu.dataset.open === 'true';

/* El atributo del HTML deja el menú inerte desde el primer frame; a partir de
   aquí manda la propiedad. */
menu.inert = true;

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
  // El foco debe volver al botón Menu, no al elemento del menú ya cerrado:
  // devolverlo a `menuSettings` lo dejaba sobre un control invisible.
  openSheet({ returnTo: menuBtn });
});

menu.addEventListener('keydown', (e) => {
  if (!menuIsOpen()) return;   // cerrado no atrapa nada
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

/* ------------------------------------------------- navbar sobre secciones oscuras */

const navEl = document.querySelector('.nav');
let navTicking = false;
let navDark = false;

/**
 * Invierte la barra mientras una sección oscura pasa por debajo.
 *
 * Se mide con getBoundingClientRect en un listener de scroll pasivo, no con
 * IntersectionObserver: sobre un elemento de tres pantallas de alto los
 * umbrales de intersección no se cruzan cuando hace falta, y lo que importa
 * aquí es una franja de 40 px, no la visibilidad del bloque.
 */
function measureNav() {
  navTicking = false;
  const probe = navEl.offsetHeight * 0.6;
  let dark = false;
  // Se consulta en cada medición porque las vistas se cargan con import()
  // dinámico: al cambiar de ruta el DOM todavía no existe, y una lista
  // cacheada en ese momento quedaría vacía para siempre.
  for (const el of document.querySelectorAll('[data-nav="dark"]')) {
    const r = el.getBoundingClientRect();
    if (r.top <= probe && r.bottom > probe) { dark = true; break; }
  }
  if (dark === navDark) return;
  navDark = dark;
  if (dark) navEl.dataset.theme = 'dark';
  else navEl.removeAttribute('data-theme');
}

function onNavScroll() {
  if (navTicking) return;
  navTicking = true;
  requestAnimationFrame(measureNav);
}

addEventListener('scroll', onNavScroll, { passive: true });
addEventListener('resize', onNavScroll, { passive: true });

router.onRouteChange(() => {
  navDark = false;
  navEl.removeAttribute('data-theme');
  requestAnimationFrame(measureNav);
});

router.start(document.getElementById('main'), { fallbackPath: '/' });
