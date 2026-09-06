/**
 * Pruebas del motor de timing Morse.
 *
 * Se ejecutan con `node --test` — sin instalar nada.
 *
 * Estas pruebas comprueban la ESPECIFICACIÓN, no el comportamiento heredado.
 * La versión anterior de este archivo comparaba el motor contra una copia
 * literal del algoritmo antiguo; el algoritmo antiguo estaba mal, así que la
 * prueba certificaba el error (a 5 PPM pedidos se emitían 9,05 PPM reales).
 * Ahora se mide la velocidad efectiva contra la definición de PARIS.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimeline, resolveSettings, unitSeconds, charUnitSeconds, spacingFactor,
  effectiveWpm, charWpm, PARIS_CHAR_UNITS, PARIS_GAP_UNITS, FARNSWORTH_CHAR_WPM
} from '../src/core/timing.js';

/* ------------------------------------------------------------------------ */
/* Utilidades de medida: nada de constantes mágicas, todo sale de la timeline */
/* ------------------------------------------------------------------------ */

/**
 * Velocidad efectiva MEDIDA sobre una timeline real de PARIS repetido.
 *
 * Se toma el intervalo entre inicios de palabra consecutivos, que por
 * definición es el tiempo de una palabra estándar completa (incluido el hueco
 * de palabra que la cierra). No usa `effectiveWpm()`: si lo hiciera estaría
 * comprobando la fórmula contra sí misma.
 */
function measuredWpm(settings, repeats = 40) {
  const tl = buildTimeline(Array(repeats).fill('PARIS').join(' '), settings);
  const starts = tl.letters.filter((l) => l.ch === 'P').map((l) => l.t0);
  const perWord = (starts.at(-1) - starts[0]) / (starts.length - 1);
  return 60 / perWord;
}

const TARGETS = [5, 8, 10, 13, 15, 18, 20, 25];

/* ------------------------------------------------------------ elementos */

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

test('el hueco entre elementos de una letra es 1 unidad de carácter', () => {
  for (const farnsworth of [true, false]) {
    const s = resolveSettings({ wpm: 10, farnsworth });
    const tl = buildTimeline('A', s);   // .-
    const gap = tl.elements[1].t0 - tl.elements[0].t1;
    assert.equal(gap.toFixed(9), charUnitSeconds(s).toFixed(9),
      `farnsworth=${farnsworth}: el hueco intra-carácter no se estira nunca`);
  }
});

test('el hueco entre letras son 3 unidades y el de palabra 7, ambos estirados igual', () => {
  const s = resolveSettings({ wpm: 10, farnsworth: true });
  const uc = charUnitSeconds(s);
  const f = spacingFactor(s);

  const letters = buildTimeline('EE', s);
  assert.equal((letters.elements[1].t0 - letters.elements[0].t1).toFixed(9), (uc * 3 * f).toFixed(9));

  const words = buildTimeline('E E', s);
  assert.equal((words.elements[1].t0 - words.elements[0].t1).toFixed(9), (uc * 7 * f).toFixed(9));
});

test('sin Farnsworth los huecos son 3 y 7 unidades globales', () => {
  const s = resolveSettings({ wpm: 13, farnsworth: false });
  assert.equal(spacingFactor(s), 1);
  const tl = buildTimeline('E E', s);
  assert.equal((tl.elements[1].t0 - tl.elements[0].t1).toFixed(9), (unitSeconds(s) * 7).toFixed(9));
});

/* ---------------------------------------------------------- Farnsworth */

test('PARIS son 31 unidades de carácter y 19 de espaciado', () => {
  // Se cuenta sobre la timeline real, sin Farnsworth (factor 1), en unidades.
  const s = resolveSettings({ wpm: 20, farnsworth: false });
  const u = unitSeconds(s);
  const tl = buildTimeline('PARIS PARIS', s);

  const primera = tl.letters.slice(0, 5);
  const contenido = primera.reduce((acc, l) => acc + (l.t1 - l.t0), 0) / u;
  const huecosLetra = 4 * 3;
  const huecoPalabra = (tl.letters[5].t0 - tl.letters[4].t1) / u;

  assert.equal(Math.round(contenido), PARIS_CHAR_UNITS, 'contenido de carácter');
  assert.equal(Math.round(huecosLetra + huecoPalabra), PARIS_GAP_UNITS, 'espaciado');
  assert.equal(PARIS_CHAR_UNITS + PARIS_GAP_UNITS, 50);
});

test('ESPECIFICACIÓN Farnsworth: la velocidad efectiva es la pedida', () => {
  for (const wpm of TARGETS) {
    const s = resolveSettings({ wpm, farnsworth: true });
    const medida = measuredWpm(s);
    assert.ok(Math.abs(medida - wpm) < 1e-6,
      `objetivo ${wpm} PPM: PARIS repetido sale a ${medida.toFixed(4)} PPM`);
  }
});

test('los caracteres se emiten a >= 18 PPM aunque la efectiva sea menor', () => {
  for (const wpm of TARGETS) {
    const s = resolveSettings({ wpm, farnsworth: true });
    assert.equal(charWpm(s), Math.max(wpm, FARNSWORTH_CHAR_WPM));
    const dit = buildTimeline('E', s).elements[0];
    assert.equal((dit.t1 - dit.t0).toFixed(9), (1.2 / Math.max(wpm, 18)).toFixed(9));
  }
});

test('sin Farnsworth la velocidad efectiva también es la pedida', () => {
  for (const wpm of TARGETS) {
    const s = resolveSettings({ wpm, farnsworth: false });
    assert.ok(Math.abs(measuredWpm(s) - wpm) < 1e-6, `objetivo ${wpm} PPM sin Farnsworth`);
  }
});

test('REGRESIÓN: el factor C/S de la versión anterior queda descartado', () => {
  // El motor viejo usaba spacingFactor = charWpm/wpm. Eso dejaba los huecos a 3
  // y 7 unidades de la velocidad efectiva en vez de repartir el tiempo sobrante,
  // y producía estas velocidades reales. Ninguna debe volver a aparecer.
  const ANTES = { 5: 9.054, 10: 13.804, 13: 15.705, 15: 16.729 };
  for (const [wpm, malo] of Object.entries(ANTES)) {
    const s = resolveSettings({ wpm: Number(wpm), farnsworth: true });
    const medida = measuredWpm(s);
    assert.ok(Math.abs(medida - malo) > 0.5,
      `a ${wpm} PPM se vuelve a medir ${medida.toFixed(3)}, el valor del motor roto`);
    // Y el factor viejo se distingue del nuevo salvo cuando ambos valen 1.
    const viejo = Math.max(charWpm(s) / s.wpm, 1);
    assert.ok(spacingFactor(s) > viejo, `a ${wpm} PPM el espaciado debe ser MAYOR que antes`);
  }
});

test('el espaciado nunca baja de 1 unidad ni se vuelve negativo', () => {
  for (const wpm of [5, 13, 17, 18, 19, 25]) {
    for (const farnsworth of [true, false]) {
      const s = resolveSettings({ wpm, farnsworth });
      const f = spacingFactor(s);
      assert.ok(f >= 1 && Number.isFinite(f), `wpm=${wpm} farns=${farnsworth} -> factor ${f}`);
    }
  }
  // Con la velocidad objetivo por encima de la de carácter el factor es 1 clavado.
  for (const wpm of [18, 20, 25]) {
    assert.equal(spacingFactor(resolveSettings({ wpm, farnsworth: true })), 1);
  }
});

test('effectiveWpm coincide con lo que produce la timeline', () => {
  for (const wpm of TARGETS) {
    for (const farnsworth of [true, false]) {
      const s = resolveSettings({ wpm, farnsworth });
      assert.ok(Math.abs(effectiveWpm(s) - measuredWpm(s)) < 1e-9,
        `wpm=${wpm} farns=${farnsworth}`);
    }
  }
});

test('el tiempo total de una frase escala con la velocidad efectiva', () => {
  const lento = resolveSettings({ wpm: 5, farnsworth: true });
  const rapido = resolveSettings({ wpm: 20, farnsworth: true });
  const t1 = buildTimeline('CQ DE CE3WMJ', lento).duration;
  const t2 = buildTimeline('CQ DE CE3WMJ', rapido).duration;
  assert.ok(t1 > t2 * 2.5, `5 PPM (${t1.toFixed(2)}s) debe ser mucho más lento que 20 (${t2.toFixed(2)}s)`);
});

/* ------------------------------------------------------- estructura */

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
  tl.elements.forEach((el, i) => {
    assert.equal(tl.t0s[i], el.t0);
    assert.equal(tl.t1s[i], el.t1);
  });
});

test('los elementos nunca se solapan y avanzan en el tiempo', () => {
  for (const wpm of TARGETS) {
    const tl = buildTimeline('CQ DE CE3WMJ K', resolveSettings({ wpm }));
    for (let i = 1; i < tl.elements.length; i++) {
      assert.ok(tl.elements[i].t0 >= tl.elements[i - 1].t1,
        `a ${wpm} PPM el elemento ${i} empieza antes de acabar el anterior`);
    }
  }
});

test('un texto sin caracteres transmisibles da una timeline vacía y no lanza', () => {
  const s = resolveSettings();
  // null y undefined incluidos a propósito: `String(null)` es "null", cuatro
  // letras perfectamente transmisibles, y un valor ausente llegó a sonar como
  // la palabra NULL.
  for (const texto of ['', '   ', '¿¡', '@@', null, undefined, {}, []]) {
    const tl = buildTimeline(texto, s);
    assert.equal(tl.elements.length, 0, `entrada ${JSON.stringify(texto)}`);
    assert.equal(tl.duration, 0);
  }
  // Un número sí es contenido legítimo.
  assert.equal(buildTimeline(123, s).letters.map((l) => l.ch).join(''), '123');
});

test('los ajustes se acotan en vez de romper', () => {
  assert.equal(resolveSettings({ wpm: 999 }).wpm, 25);
  assert.equal(resolveSettings({ wpm: -5 }).wpm, 5);
  assert.equal(resolveSettings({ freq: 99999 }).freq, 1000);
  assert.equal(resolveSettings({}).wpm, 13);
  assert.equal(resolveSettings({ wpm: 'no es un número' }).wpm, 13);
  assert.equal(resolveSettings({ volume: 10 }).volume, 0.4);
});
