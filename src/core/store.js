/**
 * Persistencia local. Sin DOM.
 *
 * Dos claves: `telegrafo_v2` es la actual, `telegrafo_v1` es la de la versión
 * anterior. Al arrancar, si existe v1 y no v2, se migra. **v1 no se borra**:
 * si alguien vuelve a una versión antigua, su progreso sigue ahí.
 *
 * Si el navegador bloquea localStorage (modo privado, cookies desactivadas),
 * todo sigue funcionando contra un objeto en memoria y `available` queda en
 * false para poder avisarlo en Ajustes.
 */

import { DEFAULT_SETTINGS, resolveSettings } from './timing.js';

const KEY_V2 = 'telegrafo_v2';
const KEY_V1 = 'telegrafo_v1';

export const DEFAULT_PROGRESS = Object.freeze({
  level: 0,
  correct: 0,
  attempts: 0,
  bestStreak: 0,
  /** @type {Record<string,{c:number,t:number}>} aciertos/intentos por carácter */
  letter: {},
  /** Ventana deslizante de la sesión de nivel. */
  window: [],
  sessions: 0
});

export const DEFAULT_PREFS = Object.freeze({ haptics: true });

let available = true;
let data = { settings: {}, progress: {}, prefs: {} };

function readRaw(key) {
  try { return localStorage.getItem(key); } catch { available = false; return null; }
}
function writeRaw(key, value) {
  if (!available) return;
  try { localStorage.setItem(key, value); } catch { available = false; }
}

/** Convierte el esquema v1 al v2. */
function migrateV1(v1) {
  const s = v1.settings ?? {};
  const p = v1.progress ?? {};
  return {
    settings: {
      wpm: s.wpm ?? DEFAULT_SETTINGS.wpm,
      freq: s.freq ?? DEFAULT_SETTINGS.freq,
      // v1 guardaba el volumen como 0..40 y lo dividía por 100 al reproducir.
      volume: typeof s.vol === 'number' ? s.vol / 100 : DEFAULT_SETTINGS.volume,
      farnsworth: s.farns ?? DEFAULT_SETTINGS.farnsworth
    },
    prefs: { haptics: s.vib ?? true },
    progress: {
      level: p.level ?? 0,
      correct: p.totalCorrect ?? 0,
      attempts: p.totalAttempts ?? 0,
      bestStreak: p.bestStreak ?? 0,
      letter: p.letter ?? {},
      window: Array.isArray(p.lvlWindow) ? p.lvlWindow : [],
      sessions: 0
    }
    // xp, qso y ach se descartan a propósito: la gamificación pesada se retiró.
  };
}

function load() {
  const rawV2 = readRaw(KEY_V2);
  if (rawV2) {
    try {
      const parsed = JSON.parse(rawV2);
      data = {
        settings: parsed.settings ?? {},
        progress: { ...DEFAULT_PROGRESS, ...(parsed.progress ?? {}) },
        prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) }
      };
      return;
    } catch { /* corrupto: se cae a los defaults */ }
  }

  const rawV1 = readRaw(KEY_V1);
  if (rawV1) {
    try {
      const migrated = migrateV1(JSON.parse(rawV1));
      data = {
        settings: migrated.settings,
        progress: { ...DEFAULT_PROGRESS, ...migrated.progress },
        prefs: { ...DEFAULT_PREFS, ...migrated.prefs }
      };
      save();   // se escribe v2; v1 queda intacta
      return;
    } catch { /* v1 ilegible: defaults */ }
  }

  data = {
    settings: { ...DEFAULT_SETTINGS },
    progress: { ...DEFAULT_PROGRESS, letter: {}, window: [] },
    prefs: { ...DEFAULT_PREFS }
  };
}

function save() {
  writeRaw(KEY_V2, JSON.stringify(data));
}

load();

export const isAvailable = () => available;

/* -------------------------------------------------------------- ajustes */

export function getSettings() {
  return resolveSettings(data.settings);
}
export function setSettings(patch) {
  data.settings = resolveSettings({ ...data.settings, ...patch });
  save();
  return data.settings;
}

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...data.prefs };
}
export function setPrefs(patch) {
  data.prefs = { ...getPrefs(), ...patch };
  save();
  return data.prefs;
}

/* ------------------------------------------------------------- progreso */

export function getProgress() {
  return { ...DEFAULT_PROGRESS, ...data.progress };
}
export function setProgress(patch) {
  data.progress = { ...getProgress(), ...patch };
  save();
  return data.progress;
}

/** Estadística de un carácter: `{c: aciertos, t: intentos}`. */
export function letterStat(ch) {
  const p = getProgress();
  return p.letter[ch] ?? { c: 0, t: 0 };
}

/** Registra una respuesta y devuelve el progreso actualizado. */
export function recordAnswer(ch, correct) {
  const p = getProgress();
  const letter = { ...p.letter };
  const st = { ...(letter[ch] ?? { c: 0, t: 0 }) };
  st.t += 1;
  if (correct) st.c += 1;
  letter[ch] = st;

  return setProgress({
    letter,
    attempts: p.attempts + 1,
    correct: p.correct + (correct ? 1 : 0)
  });
}

/** Borra progreso y ajustes de v2. No toca v1. */
export function resetAll() {
  data = {
    settings: { ...DEFAULT_SETTINGS },
    progress: { ...DEFAULT_PROGRESS, letter: {}, window: [] },
    prefs: { ...DEFAULT_PREFS }
  };
  save();
}
