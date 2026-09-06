/**
 * Router hash mínimo. Sin dependencias.
 *
 * Hash y no History API porque el proyecto se despliega como estático puro:
 * con rutas reales haría falta una regla de reescritura en el servidor, y el
 * objetivo es que `git push` a Netlify baste.
 *
 * Antes de montar una ruta se destruye el scope de la anterior, lo que libera
 * listeners, suscripciones al bucle de frames y la llave si quedó pulsada.
 */

import { createScope } from './scope.js';
import * as keyer from '../core/keyer.js';
import * as player from '../core/player.js';
import * as signal from '../core/signal.js';

/** @type {Map<string, (root:HTMLElement, scope:ReturnType<createScope>, params:object)=>void>} */
const routes = new Map();

let outlet = null;
let currentScope = null;
let currentPath = null;
let fallback = '/';
const changeSubs = new Set();

export function define(path, mount) {
  routes.set(path, mount);
}

export function onRouteChange(fn) {
  changeSubs.add(fn);
  return () => changeSubs.delete(fn);
}

/** Ruta actual normalizada: '/', '/aprender', ... */
export function currentRoute() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) { render(); return; }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

function render() {
  const path = currentRoute();
  const mount = routes.get(path) ?? routes.get(fallback);
  if (!mount) return;

  // Orden importante: primero se apaga lo anterior, luego se monta lo nuevo.
  player.stopAll();
  keyer.dispose();
  signal.reset();
  currentScope?.dispose();

  outlet.replaceChildren();
  currentScope = createScope();
  currentPath = routes.has(path) ? path : fallback;

  mount(outlet, currentScope, {});

  for (const fn of changeSubs) {
    try { fn(currentPath); } catch { /* aislado */ }
  }

  // El foco vuelve al principio del contenido: sin esto, tras navegar el
  // lector de pantalla se queda donde estaba y la ruta nueva pasa inadvertida.
  outlet.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function start(outletEl, { fallbackPath = '/' } = {}) {
  outlet = outletEl;
  fallback = fallbackPath;
  if (!location.hash) history.replaceState(null, '', '#/');
  window.addEventListener('hashchange', render);
  render();
}

export const activePath = () => currentPath;
