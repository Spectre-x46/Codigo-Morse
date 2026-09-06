/**
 * Panel de ajustes.
 *
 * Los ajustes no son una página: un principiante no debería tener que decidir
 * velocidad, tono ni espaciado Farnsworth antes de oír su primera letra. Viven
 * aquí, a un clic, para quien los busque.
 *
 * Gestión de foco completa: se atrapa el tabulador dentro del panel mientras
 * está abierto y se devuelve el foco al botón que lo abrió al cerrar.
 */

import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as keyer from '../core/keyer.js';
import { LIMITS } from '../core/timing.js';
import { toast } from './toast.js';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

let el = null;
let panel = null;
let lastFocused = null;
let open = false;

function build() {
  el = document.createElement('div');
  el.className = 'sheet';
  el.dataset.open = 'false';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'sheetTitle');

  const s = store.getSettings();
  const prefs = store.getPrefs();

  el.innerHTML = `
    <div class="sheet__panel">
      <div class="sheet__head">
        <h2 class="title" id="sheetTitle" style="font-size:1.5rem">Ajustes</h2>
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
          <span class="field__value" id="setVolVal">${Math.round(s.volume * 250)}%</span>
        </div>
        <input class="range" type="range" id="setVol" min="0" max="100" step="2"
               value="${Math.round(s.volume * 250)}">
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
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
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

  $('setWpm').addEventListener('input', (e) => {
    const wpm = Number(e.target.value);
    $('setWpmVal').textContent = `${wpm} PPM`;
    keyer.configure(store.setSettings({ wpm }));
  });

  $('setFreq').addEventListener('input', (e) => {
    const freq = Number(e.target.value);
    $('setFreqVal').textContent = `${freq} Hz`;
    keyer.configure(store.setSettings({ freq }));
  });

  $('setVol').addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    $('setVolVal').textContent = `${pct}%`;
    // El rango útil llega hasta 0.4: por encima satura sin sonar más alto.
    const volume = (pct / 100) * LIMITS.volume.max;
    store.setSettings({ volume });
    audio.setVolume(volume);
  });

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
    const pct = Math.round(s.volume * 250);
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

export function openSheet() {
  if (!el) build();
  lastFocused = document.activeElement;
  el.dataset.open = 'true';
  open = true;
  panel.querySelector(FOCUSABLE)?.focus();
}

export function close() {
  if (!el || !open) return;
  el.dataset.open = 'false';
  open = false;
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}

export const isOpen = () => open;
