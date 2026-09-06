/**
 * Pruebas de regresión del timing Morse.
 *
 * Se ejecutan con `node --test` — sin instalar nada.
 *
 * La prueba central compara el motor nuevo contra una reimplementación literal
 * del algoritmo de la versión anterior (`telegrafo.html`). El rediseño podía
 * cambiar cualquier cosa menos cómo suena el Morse, y esto lo demuestra en vez
 * de afirmarlo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, resolveSettings, unitSeconds, charUnitSeconds, spacingFactor }
  from '../src/core/timing.js';
import { MORSE, ORDER, REVERSE, tokenize, fmt } from '../src/data/morse.js';
import { unlockedSet, WINDOW_TARGET, WINDOW_SIZE } from '../src/data/levels.js';
import { shouldLevelUp, pushWindow, buildOptions } from '../src/core/srs.js';

/* ------------------------------------------------------------------------ */
/* Implementación ANTERIOR, copiada de telegrafo.html (líneas 655-676).      */
/* Es la referencia contra la que no se puede regresar.                      */
/* ------------------------------------------------------------------------ */
function legacyDuration(str, wpm, farns) {
  const charWpm = farns ? Math.max(wpm, 18) : wpm;
  const uc = 1200 / charWpm / 1000;
  const f = Math.max(charWpm / wpm, 1);
  let t = 0;
  const words = str.toUpperCase().trim().split(/\s+/).filter(Boolean);
  words.forEach((word, wi) => {
    const letters = word.split('').filter((c) => MORSE[c]);
    letters.forEach((ch, li) => {
      const code = MORSE[ch];
      for (let s = 0; s < code.length; s++) {
        t += code[s] === '.' ? uc : uc * 3;
        if (s < code.length - 1) t += uc;
      }
      if (li < letters.length - 1) t += uc * 3 * f;
    });
    if (wi < words.length - 1) t += uc * 7 * f;
  });
  return t;
}

const SAMPLES = ['E', 'T', 'SOS', 'PARIS', 'HOLA MUNDO', 'CQ CQ DE CE3WMJ K', 'R2D2'];

test('el motor nuevo reproduce exactamente el timing de la versión anterior', () => {
  for (const wpm of [5, 8, 13, 18, 20, 25]) {
    for (const farns of [true, false]) {
      const settings = resolveSettings({ wpm, farnsworth: farns });
      for (const text of SAMPLES) {
        const mine = buildTimeline(text, settings).duration;
        const legacy = legacyDuration(text, wpm, farns);
        assert.ok(
          Math.abs(mine - legacy) < 1e-9,
          `"${text}" @${wpm}ppm farns=${farns}: nuevo ${mine} vs anterior ${legacy}`
        );
      }
    }
  }
});

test('estándar PARIS: un punto dura 1200/PPM ms', () => {
  for (const wpm of [5, 13, 20, 25]) {
    const s = resolveSettings({ wpm, farnsworth: false });
    const dit = buildTimeline('E', s).elements[0];
    assert.equal(Math.round((dit.t1 - dit.t0) * 1e6) / 1e3, Math.round(1200 / wpm * 1e3) / 1e3);
  }
});

test('una raya dura exactamente tres puntos', () => {
  const s = resolveSettings({ wpm: 13, farnsworth: false });
  const dit = buildTimeline('E', s).elements[0];
  const dah = buildTimeline('T', s).elements[0];
  assert.equal((dah.t1 - dah.t0).toFixed(9), ((dit.t1 - dit.t0) * 3).toFixed(9));
});

test('Farnsworth acelera el carácter pero estira sólo los huecos', () => {
  const wpm = 13;
  const on = resolveSettings({ wpm, farnsworth: true });
  const off = resolveSettings({ wpm, farnsworth: false });

  // El carácter va más rápido...
  assert.ok(charUnitSeconds(on) < charUnitSeconds(off));
  assert.equal(charUnitSeconds(on).toFixed(6), (1.2 / 18).toFixed(6));

  // ...pero el hueco entre letras es el mismo que sin Farnsworth,
  // que es justo lo que mantiene la velocidad global percibida.
  const gapOn = charUnitSeconds(on) * 3 * spacingFactor(on);
  const gapOff = charUnitSeconds(off) * 3 * spacingFactor(off);
  assert.equal(gapOn.toFixed(9), gapOff.toFixed(9));
  assert.equal(gapOn.toFixed(6), (unitSeconds(off) * 3).toFixed(6));
});

test('el hueco entre palabras son 7 unidades', () => {
  const s = resolveSettings({ wpm: 13, farnsworth: false });
  const tl = buildTimeline('E E', s);
  const gap = tl.elements[1].t0 - tl.elements[0].t1;
  assert.equal(gap.toFixed(9), (unitSeconds(s) * 7).toFixed(9));
});

test('la timeline indexa letras y elementos de forma coherente', () => {
  const tl = buildTimeline('SOS', resolveSettings({ wpm: 20 }));
  assert.equal(tl.letters.length, 3);
  assert.equal(tl.elements.length, 9);
  assert.deepEqual(tl.letters.map((l) => l.ch), ['S', 'O', 'S']);
  for (const letter of tl.letters) {
    assert.equal(letter.lastEl - letter.firstEl + 1, letter.code.length);
    assert.equal(tl.elements[letter.firstEl].t0, letter.t0);
    assert.equal(tl.elements[letter.lastEl].t1, letter.t1);
  }
  // Los arrays tipados deben coincidir con los objetos
  tl.elements.forEach((el, i) => {
    assert.equal(tl.t0s[i], el.t0);
    assert.equal(tl.t1s[i], el.t1);
  });
});

test('los elementos nunca se solapan y avanzan en el tiempo', () => {
  const tl = buildTimeline('CQ DE CE3WMJ', resolveSettings({ wpm: 13 }));
  for (let i = 1; i < tl.elements.length; i++) {
    assert.ok(tl.elements[i].t0 >= tl.elements[i - 1].t1,
      `elemento ${i} empieza antes de acabar el anterior`);
  }
});

test('el abecedario no empieza por dígitos', () => {
  // Object.keys(MORSE) enumeraría '0'..'9' primero: las claves con forma de
  // entero van antes por especificación. ORDER existe para evitarlo.
  assert.equal(ORDER[0], 'A');
  assert.equal(ORDER[25], 'Z');
  assert.equal(ORDER[26], '0');
  assert.ok(Object.keys(MORSE)[0] === '0', 'si esto falla, el motivo de ORDER cambió');
  assert.equal(ORDER.length, new Set(ORDER).size, 'sin duplicados');
});

test('la tabla Morse es reversible y sin códigos repetidos', () => {
  const codes = Object.values(MORSE);
  assert.equal(codes.length, new Set(codes).size, 'dos caracteres comparten código');
  for (const [ch, code] of Object.entries(MORSE)) assert.equal(REVERSE[code], ch);
});

test('tokenize descarta lo intransmisible y separa palabras', () => {
  assert.deepEqual(tokenize('hola  mundo!'), [['H','O','L','A'], ['M','U','N','D','O']]);
  assert.deepEqual(tokenize('   '), []);
  assert.deepEqual(tokenize('¡ñ!'), []);
});

test('fmt convierte a símbolos legibles', () => {
  assert.equal(fmt('.-'), '·—');
  assert.equal(fmt('...'), '···');
});

test('los ajustes se acotan en vez de romper', () => {
  assert.equal(resolveSettings({ wpm: 999 }).wpm, 25);
  assert.equal(resolveSettings({ wpm: -5 }).wpm, 5);
  assert.equal(resolveSettings({ freq: 99999 }).freq, 1000);
  assert.equal(resolveSettings({}).wpm, 13);
  assert.equal(resolveSettings({ wpm: 'no es un número' }).wpm, 13);
});

test('la progresión Koch acumula y empieza por E y T', () => {
  assert.deepEqual(unlockedSet(0), ['E', 'T']);
  assert.deepEqual(unlockedSet(1), ['E', 'T', 'A', 'N', 'I', 'M']);
  assert.ok(unlockedSet(99).length > unlockedSet(2).length, 'un nivel alto se acota');
});

test('la meta de nivel coincide con la lógica que la evalúa', () => {
  // El texto anunciaba "10 de 12 (>=85%)", pero 10/12 es 83%: se cumplía la
  // meta anunciada y el nivel no se abría. WINDOW_TARGET se calcula.
  const win = (hits) => Array(hits).fill(true).concat(Array(WINDOW_SIZE - hits).fill(false));
  assert.equal(shouldLevelUp(win(WINDOW_TARGET - 1), 0), false);
  assert.equal(shouldLevelUp(win(WINDOW_TARGET), 0), true);
  assert.equal(shouldLevelUp(Array(3).fill(true), 0), false, 'muestra insuficiente');
});

test('la ventana deslizante no crece más allá de su tamaño', () => {
  let w = [];
  for (let i = 0; i < 40; i++) w = pushWindow(w, i % 2 === 0);
  assert.equal(w.length, WINDOW_SIZE);
});

test('las opciones incluyen siempre la respuesta correcta y no se repiten', () => {
  const pool = unlockedSet(4);
  for (let i = 0; i < 200; i++) {
    const opts = buildOptions('E', pool, 4);
    assert.ok(opts.includes('E'));
    assert.equal(opts.length, new Set(opts).size);
  }
});

test('un conjunto de dos caracteres no pide más distractores de los que hay', () => {
  const opts = buildOptions('E', ['E', 'T'], 4);
  assert.deepEqual([...opts].sort(), ['E', 'T']);
});
