/**
 * Tabla Morse y normalización del texto en español.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MORSE, ORDER, REVERSE, tokenize, normalizeText, fmt, isSendable }
  from '../src/data/morse.js';

test('el abecedario no empieza por dígitos', () => {
  // Object.keys(MORSE) enumeraría '0'..'9' primero: las claves con forma de
  // entero van antes por especificación. ORDER existe para evitarlo.
  assert.equal(ORDER[0], 'A');
  assert.equal(ORDER[25], 'Z');
  assert.equal(ORDER[26], '0');
  assert.ok(Object.keys(MORSE)[0] === '0', 'si esto falla, el motivo de ORDER cambió');
  assert.equal(ORDER.length, new Set(ORDER).size, 'sin duplicados');
});

test('ORDER y MORSE contienen exactamente lo mismo', () => {
  assert.deepEqual([...ORDER].sort(), Object.keys(MORSE).sort());
});

test('la tabla Morse es reversible y sin códigos repetidos', () => {
  const codes = Object.values(MORSE);
  assert.equal(codes.length, new Set(codes).size, 'dos caracteres comparten código');
  for (const [ch, code] of Object.entries(MORSE)) assert.equal(REVERSE[code], ch);
});

test('la tabla sólo usa puntos y rayas', () => {
  for (const [ch, code] of Object.entries(MORSE)) {
    assert.match(code, /^[.-]+$/, `${ch} tiene un código inválido: ${code}`);
    assert.ok(code.length <= 6, `${ch} es demasiado largo`);
  }
});

test('fmt convierte a símbolos legibles', () => {
  assert.equal(fmt('.-'), '·—');
  assert.equal(fmt('...'), '···');
});

/* -------------------------------------------------------- normalización */

test('las vocales acentuadas se transmiten sin acento, no se borran', () => {
  const casos = {
    'CÓMO ESTÁS': 'COMO ESTAS',
    'ÁRBOL': 'ARBOL',
    'CANCIÓN': 'CANCION',
    'PINGÜINO': 'PINGUINO',
    'ÉL VIVIÓ AQUÍ': 'EL VIVIO AQUI'
  };
  for (const [entrada, esperado] of Object.entries(casos)) {
    const salida = tokenize(entrada).map((w) => w.join('')).join(' ');
    assert.equal(salida, esperado, `"${entrada}"`);
  }
});

test('la Ñ se transmite como N, deliberadamente', () => {
  // ITU-R M.1677-1 no tiene Ñ. La extensión nacional `--.--` existe, pero
  // añadirla obligaría a que la llave decodificase ese código como Ñ y a meter
  // una celda no-ITU en el abecedario. Un receptor copia "ANO"; borrar la letra
  // no lo copia nadie. Si algún día se añade, este test debe cambiarse a mano.
  assert.equal(tokenize('SEÑAL')[0].join(''), 'SENAL');
  assert.equal(tokenize('AÑO')[0].join(''), 'ANO');
  assert.equal(tokenize('NIÑO')[0].join(''), 'NINO');
  assert.ok(!Object.hasOwn(MORSE, 'Ñ'), 'si se añade Ñ hay que revisar ORDER, REVERSE y este test');
});

test('los signos de apertura se descartan y los de cierre se conservan', () => {
  assert.equal(tokenize('¿QUÉ TAL?').map((w) => w.join('')).join(' '), 'QUE TAL?');
  assert.equal(tokenize('¡HOLA!')[0].join(''), 'HOLA');
});

test('normalizeText es idempotente y no toca lo que ya es ASCII', () => {
  for (const t of ['HOLA', 'CQ DE CE3WMJ', '123', '.,?/=+']) {
    assert.equal(normalizeText(t), t);
    assert.equal(normalizeText(normalizeText(t)), normalizeText(t));
  }
  assert.equal(normalizeText(normalizeText('CÓMO')), normalizeText('CÓMO'));
});

test('tokenize descarta lo intransmisible y separa palabras', () => {
  assert.deepEqual(tokenize('hola  mundo!'), [['H', 'O', 'L', 'A'], ['M', 'U', 'N', 'D', 'O']]);
  assert.deepEqual(tokenize('   '), []);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('@@@'), []);
});

test('tokenize no lanza con entradas raras', () => {
  for (const v of [null, undefined, 0, {}, []]) {
    assert.doesNotThrow(() => tokenize(v), `entrada ${String(v)}`);
  }
});

test('todo lo que sale de tokenize se puede transmitir', () => {
  const texto = 'CÓMO ESTÁS, PINGÜINO? SEÑAL 123 + = /';
  for (const palabra of tokenize(texto)) {
    for (const ch of palabra) {
      assert.ok(isSendable(ch), `${ch} salió de tokenize pero no está en la tabla`);
      assert.ok(MORSE[ch], `${ch} no tiene código`);
    }
  }
});
