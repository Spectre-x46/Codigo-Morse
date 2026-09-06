/**
 * Almacenamiento: migración v1 → v2, acotado y respaldo en memoria.
 *
 * `core/store.js` carga al importarse, así que cada caso instala su propio
 * localStorage falso y vuelve a importar el módulo con una query distinta para
 * saltarse la caché de módulos de Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Esquema v1 REAL, copiado de `telegrafo.html` en el commit V3.0 (b2a2034):
 *
 *   const KEY = 'telegrafo_v1';
 *   const DEF_SETTINGS = {freq:600, wpm:13, vol:25, farns:true, vib:true};
 *   const DEF_PROGRESS = {level:0, xp:0, bestStreak:0, totalCorrect:0,
 *     totalAttempts:0, qso:0, letter:{}, lvlWindow:[], ach:[]};
 *   const VOL = () => S.vol/100;      // el volumen se guardaba 0..40
 *
 * No es un fixture inventado para que la migración cuadre: es el objeto que
 * aquella versión escribía.
 */
const V1_FIXTURE = {
  settings: { freq: 700, wpm: 9, vol: 32, farns: false, vib: false },
  progress: {
    level: 3,
    xp: 1240,
    bestStreak: 14,
    totalCorrect: 208,
    totalAttempts: 260,
    qso: 5,
    letter: { E: { c: 30, t: 31 }, T: { c: 28, t: 30 }, R: { c: 4, t: 12 } },
    lvlWindow: [true, true, false, true, true],
    ach: ['first', 'lvl', 'streak10']
  }
};

let seq = 0;
async function freshStore(initial = {}) {
  const backing = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
    clear: () => backing.clear()
  };
  const mod = await import(`../src/core/store.js?case=${++seq}`);
  return { store: mod, backing };
}

/* ------------------------------------------------------------ migración */

test('migración v1 → v2: se conserva lo que sigue existiendo', async () => {
  const { store } = await freshStore({ telegrafo_v1: JSON.stringify(V1_FIXTURE) });

  const s = store.getSettings();
  assert.equal(s.wpm, 9);
  assert.equal(s.freq, 700);
  assert.equal(s.farnsworth, false);
  assert.equal(s.volume.toFixed(2), '0.32', 'v1 guardaba 0..40 y dividía por 100');

  const p = store.getProgress();
  assert.equal(p.level, 3);
  assert.equal(p.correct, 208);
  assert.equal(p.attempts, 260);
  assert.equal(p.bestStreak, 14);
  assert.deepEqual(p.letter, V1_FIXTURE.progress.letter);
  assert.deepEqual(p.window, [true, true, false, true, true]);

  assert.equal(store.getPrefs().haptics, false, 'vib -> haptics');
  assert.equal(store.getPrefs().introDone, true, 'quien ya usó v1 no ve la presentación');
});

test('migración v1 → v2: la gamificación retirada se descarta a propósito', async () => {
  const { store } = await freshStore({ telegrafo_v1: JSON.stringify(V1_FIXTURE) });
  const p = store.getProgress();
  for (const clave of ['xp', 'qso', 'ach']) {
    assert.ok(!(clave in p), `${clave} no debería sobrevivir a la migración`);
  }
  assert.deepEqual(
    Object.keys(p).sort(),
    ['attempts', 'bestStreak', 'correct', 'letter', 'level', 'sessions', 'window']
  );
});

test('migración v1 → v2: v1 NO se destruye y v2 queda escrito', async () => {
  const { store, backing } = await freshStore({ telegrafo_v1: JSON.stringify(V1_FIXTURE) });
  store.getSettings();
  assert.equal(backing.get('telegrafo_v1'), JSON.stringify(V1_FIXTURE),
    'la política es no romperle el progreso a quien vuelva a la versión antigua');
  assert.ok(backing.has('telegrafo_v2'), 'la migración debe persistirse');
  const v2 = JSON.parse(backing.get('telegrafo_v2'));
  assert.equal(v2.progress.level, 3);
});

test('si ya existe v2 se ignora v1', async () => {
  const { store } = await freshStore({
    telegrafo_v1: JSON.stringify(V1_FIXTURE),
    telegrafo_v2: JSON.stringify({ settings: { wpm: 20 }, progress: { level: 7 }, prefs: {} })
  });
  assert.equal(store.getSettings().wpm, 20);
  assert.equal(store.getProgress().level, 7);
});

test('un v1 parcial o vacío no rompe nada', async () => {
  for (const raw of ['{}', '{"settings":{}}', '{"progress":{"level":2}}']) {
    const { store } = await freshStore({ telegrafo_v1: raw });
    assert.equal(store.getSettings().wpm, 13, `defaults con ${raw}`);
    assert.ok(Number.isFinite(store.getSettings().volume));
  }
});

test('datos corruptos caen a los valores por defecto sin lanzar', async () => {
  for (const raw of ['no es json', '[1,2,3]', 'null']) {
    const { store } = await freshStore({ telegrafo_v2: raw });
    assert.equal(store.getSettings().wpm, 13);
    assert.equal(store.getProgress().level, 0);
  }
});

/* ------------------------------------------------------------ operación */

test('recordAnswer acumula por carácter y en el total', async () => {
  const { store } = await freshStore();
  store.recordAnswer('E', true);
  store.recordAnswer('E', false);
  store.recordAnswer('T', true);
  const p = store.getProgress();
  assert.deepEqual(p.letter.E, { c: 1, t: 2 });
  assert.deepEqual(p.letter.T, { c: 1, t: 1 });
  assert.equal(p.attempts, 3);
  assert.equal(p.correct, 2);
  assert.deepEqual(store.letterStat('Z'), { c: 0, t: 0 }, 'sin datos no lanza');
});

test('getProgress devuelve copias: mutar el resultado no toca el estado', async () => {
  const { store } = await freshStore();
  const p = store.getProgress();
  p.level = 99;
  p.letter.E = { c: 1, t: 1 };
  assert.equal(store.getProgress().level, 0);
  assert.deepEqual(store.getProgress().letter, {});
});

test('resetAll borra v2 y respeta v1', async () => {
  const { store, backing } = await freshStore({ telegrafo_v1: JSON.stringify(V1_FIXTURE) });
  assert.equal(store.getProgress().level, 3);
  store.resetAll();
  assert.equal(store.getProgress().level, 0);
  assert.deepEqual(store.getProgress().letter, {});
  assert.equal(backing.get('telegrafo_v1'), JSON.stringify(V1_FIXTURE));
});

test('sin localStorage todo sigue funcionando en memoria', async () => {
  globalThis.localStorage = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); }
  };
  const store = await import(`../src/core/store.js?case=blocked${++seq}`);
  assert.equal(store.isAvailable(), false);
  store.setProgress({ level: 2 });
  assert.equal(store.getProgress().level, 2, 'el respaldo en memoria debe funcionar');
  assert.doesNotThrow(() => store.setSettings({ wpm: 20 }));
  assert.equal(store.getSettings().wpm, 20);
});

test('los ajustes guardados se acotan al leerlos', async () => {
  const { store } = await freshStore({
    telegrafo_v2: JSON.stringify({ settings: { wpm: 900, freq: -1, volume: 'x' }, progress: {}, prefs: {} })
  });
  const s = store.getSettings();
  assert.equal(s.wpm, 25);
  assert.equal(s.freq, 300);
  assert.ok(Number.isFinite(s.volume) && s.volume > 0, 'un volumen corrupto no puede dejar la app muda');
});
