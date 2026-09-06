/**
 * Progresión de niveles y selección adaptativa.
 *
 * El punto central: la LÓGICA que decide subir de nivel y el TEXTO que anuncia
 * la meta tienen que ser la misma regla. La suite anterior sólo comprobaba
 * ventanas llenas de 12, así que no veía que con `WINDOW_MIN = 10` bastaban
 * 9 de 10 mientras el texto anunciaba 11 de 12.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS, MAX_LEVEL, unlockedSet, levelChars, levelGoalText,
  targetFor, goalSize, WINDOW_SIZE, WINDOW_MIN, WINDOW_ACCURACY
} from '../src/data/levels.js';
import { shouldLevelUp, pushWindow, buildOptions } from '../src/core/adaptive.js';

const window = (hits, size) =>
  Array(hits).fill(true).concat(Array(size - hits).fill(false));

/* ---------------------------------------------------------------- niveles */

test('la progresión Koch acumula y empieza por E y T', () => {
  assert.deepEqual(unlockedSet(0), ['E', 'T']);
  assert.deepEqual(unlockedSet(1), ['E', 'T', 'A', 'N', 'I', 'M']);
  assert.ok(unlockedSet(99).length > unlockedSet(2).length, 'un nivel alto se acota');
  assert.deepEqual(unlockedSet(-5), unlockedSet(0), 'un nivel negativo se acota');
});

test('cada nivel sólo introduce caracteres nuevos y al final están todos', () => {
  const vistos = new Set();
  for (let i = 0; i <= MAX_LEVEL; i++) {
    for (const ch of levelChars(i)) {
      assert.ok(!vistos.has(ch), `${ch} se repite en el nivel ${i}`);
      vistos.add(ch);
    }
  }
  assert.equal(vistos.size, unlockedSet(MAX_LEVEL).length);
  assert.equal(vistos.size, LEVELS.flat().length);
});

/* ------------------------------------------------------------- promoción */

test('la meta anunciada coincide con la lógica en TODAS las ventanas posibles', () => {
  let comprobadas = 0;
  for (let size = 0; size <= WINDOW_SIZE; size++) {
    for (let hits = 0; hits <= size; hits++) {
      const w = window(hits, size);
      const logica = shouldLevelUp(w, 0);
      const copy = size >= WINDOW_MIN && hits >= targetFor(size);
      assert.equal(logica, copy,
        `ventana de ${size} con ${hits} aciertos: lógica ${logica} vs texto ${copy}`);
      comprobadas++;
    }
  }
  assert.equal(comprobadas, 91);
});

test('el mínimo real es 9 de 10, y el texto lo dice', () => {
  // Éste es el caso que la suite anterior no cubría.
  assert.equal(shouldLevelUp(window(9, 10), 0), true);
  assert.equal(shouldLevelUp(window(8, 10), 0), false);
  assert.equal(targetFor(WINDOW_MIN), 9);
  assert.match(levelGoalText(0, window(4, 6)), /Acierta 9 de tus últimas 10/);
});

test('con la ventana llena hacen falta 11 de 12', () => {
  assert.equal(targetFor(WINDOW_SIZE), 11);
  assert.equal(shouldLevelUp(window(11, 12), 0), true);
  assert.equal(shouldLevelUp(window(10, 12), 0), false, '10/12 es 83%, por debajo del 85%');
  assert.match(levelGoalText(0, window(10, 12)), /Acierta 11 de tus últimas 12/);
});

test('sin muestra suficiente no se sube aunque el porcentaje sea perfecto', () => {
  for (let n = 0; n < WINDOW_MIN; n++) {
    assert.equal(shouldLevelUp(window(n, n), 0), false, `${n}/${n} no debe promocionar`);
  }
});

test('en el último nivel no se sube más', () => {
  assert.equal(shouldLevelUp(window(12, 12), MAX_LEVEL), false);
  assert.match(levelGoalText(MAX_LEVEL, window(12, 12)), /Último nivel/);
});

test('targetFor es exactamente el umbral de porcentaje, sin redondeos raros', () => {
  for (let size = 1; size <= WINDOW_SIZE; size++) {
    const need = targetFor(size);
    assert.ok(need / size >= WINDOW_ACCURACY, `${need}/${size} debe llegar al umbral`);
    if (need > 0) {
      assert.ok((need - 1) / size < WINDOW_ACCURACY, `${need - 1}/${size} no debe llegar`);
    }
  }
});

test('la meta se anuncia sobre el mínimo mientras la ventana es corta', () => {
  assert.equal(goalSize(0), WINDOW_MIN);
  assert.equal(goalSize(3), WINDOW_MIN);
  assert.equal(goalSize(11), 11);
  assert.equal(goalSize(WINDOW_SIZE), WINDOW_SIZE);
});

test('la ventana deslizante no crece más allá de su tamaño', () => {
  let w = [];
  for (let i = 0; i < 40; i++) w = pushWindow(w, i % 2 === 0);
  assert.equal(w.length, WINDOW_SIZE);
});

test('pushWindow conserva el orden y no muta la entrada', () => {
  const original = [true, false];
  const siguiente = pushWindow(original, true);
  assert.deepEqual(original, [true, false], 'no debe mutar');
  assert.deepEqual(siguiente, [true, false, true]);
  // Al desbordar se pierde el más antiguo, no el más nuevo.
  let w = Array(WINDOW_SIZE).fill(false);
  w = pushWindow(w, true);
  assert.equal(w.at(-1), true);
  assert.equal(w.length, WINDOW_SIZE);
});

/* -------------------------------------------------------------- opciones */

test('las opciones incluyen siempre la respuesta correcta y no se repiten', () => {
  const pool = unlockedSet(4);
  for (let i = 0; i < 300; i++) {
    const opts = buildOptions('E', pool, 4);
    assert.ok(opts.includes('E'));
    assert.equal(opts.length, new Set(opts).size);
    assert.ok(opts.every((c) => pool.includes(c)), 'no puede colarse algo sin desbloquear');
  }
});

test('un conjunto de dos caracteres no pide más distractores de los que hay', () => {
  const opts = buildOptions('E', ['E', 'T'], 4);
  assert.deepEqual([...opts].sort(), ['E', 'T']);
});

test('la posición de la respuesta correcta se baraja', () => {
  const posiciones = new Set();
  const pool = unlockedSet(2);
  for (let i = 0; i < 400; i++) {
    posiciones.add(buildOptions('E', pool, 3).indexOf('E'));
  }
  assert.ok(posiciones.size >= 3, `la correcta salió sólo en ${posiciones.size} posiciones`);
});
