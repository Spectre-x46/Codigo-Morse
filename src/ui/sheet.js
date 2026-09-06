/**
 * Panel de ajustes.
 *
 * Los ajustes no son una página: un principiante no debería tener que decidir
 * velocidad, tono ni espaciado Farnsworth antes de oír su primera letra. Viven
 * aquí, a un clic, para quien los busque.
 *
 * Gestión de foco completa: mientras está abierto el resto de la página queda
 * `inert` (fuera del tabulador Y del árbol de accesibilidad, que es lo que
 * `aria-modal` promete y por sí solo no cumple), el tabulador se atrapa dentro
 * del panel, y al cerrar el foco vuelve a donde estaba.
 *
 * Cerrado, el panel también es `inert`: con sólo `opacity: 0` sus cinco
 * controles seguían siendo tabulables desde el resto de la página.
 */

import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as keyer from '../core/keyer.js';
import { LIMITS } from '../core/timing.js';
import { toast } from './toast.js';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/* El deslizador va de 0 a 100; el rango útil de ganancia acaba en
   LIMITS.volume.max (por encima satura sin sonar más alto). Las dos
   conversiones salen de la misma constante: escritas a mano se desincronizaban
   en cuanto el límite cambiase. */
const volToPct = (v) => Math.round((v / LIMITS.volume.max) * 100);
const pctToVol = (p) => (p / 100) * LIMITS.volume.max;

let el = null;
let panel = null;
let lastFocused = null;
let open = false;

/**
 * Hermanos del <body> que se vuelven inertes mientras el panel está abierto.
 *
 * El toast queda FUERA: `inert` lo sacaría del árbol de accesibilidad y
 * "Progreso borrado" —el único acuse de una acción destructiva que se dispara
 * desde dentro de este panel— no se anunciaría nunca.
 */
function backgroundNodes() {
  return [...document.body.children].filter((n) => n !== el && n.id !== 'toast');
}

/**
 * Guarda el `inert` previo de cada nodo para poder devolverlo tal cual.
 * Sin esto, cerrar Ajustes dejaba `#menu` con `inert = false` estando cerrado,
 * o sea: volvía a ser tabulable el menú invisible.
 */
const previousInert = new Map();

function setBackgroundInert(on) {
  if (on) {
    previousInert.clear();
    for (const n of backgroundNodes()) {
      previousInert.set(n, n.inert);
      n.inert = true;
    }
  } else {
    for (const [n, was] of previousInert) n.inert = was;
    previousInert.clear();
  }
}

function build() {
  el = document.createElement('div');
  el.className = 'sheet';
  el.dataset.open = 'false';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'sheetTitle');
  el.inert = true;

  const s = store.getSettings();
  const prefs = store.getPrefs();

  el.innerHTML = `
    <div class="sheet__panel">
      <div class="sheet__head">
        <h2 class="title sheet__title" id="sheetTitle">Ajustes</h2>
        <button class="sheet__close" type="button" aria-label="Cerrar ajustes">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
          </svg>
        </button>
      </div>

      <div class="field">
        <div class="field__top">
          <label class="field__label" for="setWpm">Velocidad</label>
          <span class="field__value" id="setWpmVal">${s.wpm} PPM</span>
        </div>
        <input class="range" type="range" id="setWpm"
               min="${LIMITS.wpm.min}" max="${LIMITS.wpm.max}" step="1" value="${s.wpm}">
        <p class="field__hint">Palabras por minuto. Para empezar, entre 10 y 15.</p>
      </div>

      <div class="field">
        <div class="field__top">
          <label class="field__label" for="setFreq">Tono</label>
          <span class="field__value" id="setFreqVal">${s.freq} Hz</span>
        </div>
        <input class="range" type="range" id="setFreq"
               min="${LIMITS.freq.min}" max="${LIMITS.freq.max}" step="10" value="${s.freq}">
      </div>

      <div class="field">
        <div class="field__top">
          <label class="field__label" for="setVol">Volumen</label>
          <span class="field__value" id="setVolVal">${volToPct(s.volume)}%</span>
        </div>
        <input class="range" type="range" id="setVol" min="0" max="100" step="2"
               value="${volToPct(s.volume)}">
      </div>

      <div class="field field--row">
        <div>
          <div class="field__label"><label for="setFarns">Espaciado Farnsworth</label></div>
          <p class="field__hint">Cada letra suena rápido, con más pausa entre ellas. Recomendado.</p>
        </div>
        <span class="switch">
          <input type="checkbox" id="setFarns" ${s.farnsworth ? 'checked' : ''}>
          <span class="switch__track"></span><span class="switch__knob"></span>
        </span>
      </div>

      <div class="field field--row">
        <div class="field__label"><label for="setHaptics">Vibración en móvil</label></div>
        <span class="switch">
          <input type="checkbox" id="setHaptics" ${prefs.haptics ? 'checked' : ''}>
          <span class="switch__track"></span><span class="switch__knob"></span>
        </span>
      </div>

      <div class="field">
        <p class="field__hint" id="setStorage"></p>
        <div class="sheet__buttons">
          <button class="btn" type="button" id="setTest">Probar tono</button>
          <button class="btn" type="button" id="setReset">Borrar progreso</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  panel = el.querySelector('.sheet__panel');
  wire();
}

function wire() {
  const $ = (id) => el.querySelector(`#${id}`);

  $('setStorage').textContent = store.isAvailable()
    ? 'Tu progreso se guarda en este dispositivo, en tu navegador.'
    : 'Este navegador bloquea el almacenamiento: el progreso no se conservará al cerrar.';

  /**
   * `input` refresca la etiqueta y el efecto audible; `change` es el que
   * persiste. Arrastrar un deslizador dispara `input` decenas de veces por
   * segundo, y cada una hacía un `JSON.stringify` + `localStorage.setItem`
   * síncronos en el hilo principal — justo el tipo de trabajo que este
   * proyecto evita para no meter jitter en el agendado de audio.
   * En un `<input type="range">` `change` siempre llega al soltar, así que no
   * se pierde ningún ajuste.
   */
  const bindRange = (id, valueId, format, onLive, onCommit) => {
    const input = $(id);
    const label = $(valueId);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      label.textContent = format(v);
      onLive?.(v);
    });
    input.addEventListener('change', () => onCommit(Number(input.value)));
  };

  bindRange('setWpm', 'setWpmVal', (v) => `${v} PPM`, null,
    (wpm) => keyer.configure(store.setSettings({ wpm })));

  bindRange('setFreq', 'setFreqVal', (v) => `${v} Hz`, null,
    (freq) => keyer.configure(store.setSettings({ freq })));

  bindRange('setVol', 'setVolVal', (v) => `${v}%`,
    (pct) => audio.setVolume(pctToVol(pct)),
    (pct) => store.setSettings({ volume: pctToVol(pct) }));

  $('setFarns').addEventListener('change', (e) => {
    keyer.configure(store.setSettings({ farnsworth: e.target.checked }));
  });

  $('setHaptics').addEventListener('change', (e) => {
    store.setPrefs({ haptics: e.target.checked });
  });

  $('setTest').addEventListener('click', () => {
    audio.resume();
    audio.beep(store.getSettings().freq);
  });

  $('setReset').addEventListener('click', () => {
    if (!confirm('¿Borrar tu progreso y volver a los ajustes por defecto?')) return;
    store.resetAll();
    const s = store.getSettings();
    $('setWpm').value = s.wpm; $('setWpmVal').textContent = `${s.wpm} PPM`;
    $('setFreq').value = s.freq; $('setFreqVal').textContent = `${s.freq} Hz`;
    const pct = volToPct(s.volume);
    $('setVol').value = pct; $('setVolVal').textContent = `${pct}%`;
    $('setFarns').checked = s.farnsworth;
    $('setHaptics').checked = store.getPrefs().haptics;
    audio.setVolume(s.volume);
    keyer.configure(s);
    toast('Progreso borrado');
  });

  el.querySelector('.sheet__close').addEventListener('click', close);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/**
 * Abre el panel.
 * @param {{returnTo?: HTMLElement}} [opts] a dónde devolver el foco al cerrar.
 *   Hace falta explícito porque quien abre suele cerrar antes su propio menú,
 *   y `document.activeElement` acabaría siendo un control ya invisible.
 */
export function openSheet({ returnTo } = {}) {
  if (!el) build();
  const active = document.activeElement;
  lastFocused = returnTo ?? (active instanceof HTMLElement ? active : null);
  el.dataset.open = 'true';
  el.inert = false;
  setBackgroundInert(true);
  open = true;
  panel.querySelector(FOCUSABLE)?.focus();
}

export function close() {
  if (!el || !open) return;
  el.dataset.open = 'false';
  open = false;
  // Orden: primero se devuelve el fondo, si no el foco no puede aterrizar ahí.
  setBackgroundInert(false);
  el.inert = true;
  if (lastFocused instanceof HTMLElement && lastFocused.isConnected) lastFocused.focus();
  lastFocused = null;
}

export const isOpen = () => open;
