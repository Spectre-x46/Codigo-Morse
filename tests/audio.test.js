/**
 * Motor de audio y llave, contra un AudioContext falso.
 *
 * Aquí se comprueba lo que la pantalla no puede demostrar: que la envolvente
 * agendada corresponde a la timeline, que `stop()` corta de verdad, que la
 * llave no se queda pegada y que el umbral punto/raya cae donde debe — también
 * justo por encima y por debajo del límite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeAudio } from './helpers/fake-audio.js';

const getCtx = installFakeAudio();

const audio = await import('../src/core/audio.js');
const keyer = await import('../src/core/keyer.js');
const player = await import('../src/core/player.js');
const signal = await import('../src/core/signal.js');
const { buildTimeline, resolveSettings, unitSeconds } = await import('../src/core/timing.js');

/** Reinicia el mundo entre casos. */
function reset() {
  keyer.dispose();
  player.stopAll();
  signal.reset();
  const ctx = getCtx();
  if (ctx) ctx.oscillators.length = 0;
}

/* ------------------------------------------------------------ envolvente */

test('la envolvente agendada corresponde a la timeline, elemento a elemento', () => {
  reset();
  audio.ensureContext();
  const ctx = getCtx();
  const settings = resolveSettings({ wpm: 20, farnsworth: false });
  const tl = buildTimeline('SOS', settings);

  const handle = audio.scheduleUtterance(tl, 10);
  assert.ok(handle);

  const osc = ctx.oscillators.at(-1);
  const gain = osc.connections[0];
  // Cuatro puntos de automatización por elemento: 0, rampa a 1, 1, rampa a 0.
  assert.equal(gain.gain.events.length, tl.elements.length * 4);
  assert.equal(osc.started, 10, 'el oscilador arranca en t0');
  assert.equal(osc.frequency.value, settings.freq);

  // Cada elemento empieza y acaba donde dice la timeline.
  tl.elements.forEach((el, i) => {
    const [tipoIni, tIni] = gain.gain.events[i * 4];
    const [tipoFin, tFin] = gain.gain.events[i * 4 + 3];
    assert.equal(tipoIni, 'set');
    assert.equal(tipoFin, 'ramp');
    assert.ok(Math.abs(tIni - (10 + el.t0)) < 1e-9, `elemento ${i}: inicio`);
    assert.ok(Math.abs(tFin - (10 + el.t1)) < 1e-9, `elemento ${i}: fin`);
  });
});

test('un texto vacío no agenda nada', () => {
  reset();
  audio.ensureContext();
  const tl = buildTimeline('', resolveSettings());
  assert.equal(audio.scheduleUtterance(tl, 0), null);
});

/* --------------------------------------------------------- reproducción */

test('playText devuelve un handle con la timeline y resuelve al terminar', async () => {
  reset();
  const ctx = getCtx() ?? (audio.ensureContext(), getCtx());
  ctx.currentTime = 0;

  const pb = player.playText('E', { wpm: 20, farnsworth: false });
  assert.equal(pb.state, 'playing');
  assert.equal(pb.timeline.letters[0].ch, 'E');
  assert.equal(player.current(), pb);

  ctx.advance(pb.timeline.duration + 0.2);
  assert.equal(await pb.finished, 'ended');
  assert.equal(pb.state, 'ended');
  assert.equal(player.current(), null, 'al acabar deja de ser la reproducción vigente');
});

test('stop corta de verdad y resuelve como "stopped"', async () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;

  const pb = player.playText('CQ DE CE3WMJ', { wpm: 13 });
  const osc = ctx.oscillators.at(-1);
  assert.ok(osc.stopAt > 1, 'debería estar agendado largo');

  ctx.advance(0.5);
  pb.stop();
  assert.equal(pb.state, 'stopped');
  assert.equal(await pb.finished, 'stopped');
  assert.ok(osc.stopAt <= 0.6, `el oscilador debe adelantar su parada, quedó en ${osc.stopAt}`);
  assert.equal(player.current(), null);
});

test('reproducciones encadenadas: la nueva para la anterior y sólo una queda vigente', async () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;

  const a = player.playText('PARIS', { wpm: 10 });
  const b = player.playText('PARIS', { wpm: 10 });
  const c = player.playText('PARIS', { wpm: 10 });

  assert.equal(await a.finished, 'stopped');
  assert.equal(await b.finished, 'stopped');
  assert.equal(player.current(), c);
  assert.notEqual(a.id, c.id);
});

test('stop dos veces no rompe ni resuelve dos veces', async () => {
  reset();
  getCtx().currentTime = 0;
  const pb = player.playText('SOS', { wpm: 15 });
  pb.stop();
  assert.doesNotThrow(() => pb.stop());
  assert.equal(await pb.finished, 'stopped');
});

test('con el contexto suspendido devuelve "blocked" en vez de silencio congelado', () => {
  reset();
  const ctx = getCtx();
  ctx.state = 'suspended';
  const pb = player.playText('E', {});
  assert.equal(pb.state, 'blocked');
  assert.equal(pb.indexAt(0), -1);
  ctx.state = 'running';
});

test('indexAt localiza el elemento que suena en cada instante', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  const pb = player.playText('S', { wpm: 20, farnsworth: false });   // ...
  const { elements, } = pb.timeline;

  assert.equal(pb.indexAt(pb.startTime - 0.01), -1, 'antes de empezar');
  elements.forEach((el, i) => {
    const medio = pb.startTime + (el.t0 + el.t1) / 2;
    assert.equal(pb.indexAt(medio), i, `mitad del elemento ${i}`);
  });
  // En los huecos entre elementos no suena nada.
  const hueco = pb.startTime + (elements[0].t1 + elements[1].t0) / 2;
  assert.equal(pb.indexAt(hueco), -1, 'el hueco intra-carácter no es ningún elemento');
  assert.equal(pb.indexAt(pb.endTime + 1), -1, 'después de acabar');
});

/* ------------------------------------------------------- señal muestreada */

test('signal.sample sigue la reproducción y se apaga al acabar', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  const pb = player.playText('T', { wpm: 20, farnsworth: false });

  const dentro = pb.startTime + pb.timeline.elements[0].t0 + 0.01;
  let s = signal.sample(dentro);
  assert.equal(s.on, true);
  assert.equal(s.kind, 'dah');
  assert.equal(s.source, 'play');
  assert.equal(s.playbackId, pb.id);
  assert.ok(s.level > 0);

  s = signal.sample(pb.endTime + 1);
  assert.equal(s.on, false);
  assert.equal(s.level, 0);
});

test('la llave en vivo tiene prioridad sobre la reproducción', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  const pb = player.playText('T', { wpm: 20, farnsworth: false });
  const dentro = pb.startTime + 0.001 + pb.timeline.elements[0].t0;

  keyer.press({ wpm: 20 });
  const s = signal.sample(dentro);
  assert.equal(s.source, 'key', 'manda la mano del usuario');
  keyer.release();
});

/* -------------------------------------------------------- umbral punto/raya */

test('umbral punto/raya: justo por debajo, justo encima y en el límite', () => {
  const EPS = 1e-4;
  for (const wpm of [5, 13, 20, 25]) {
    const settings = resolveSettings({ wpm });
    const umbral = unitSeconds(settings) * 2;   // DASH_THRESHOLD_UNITS
    keyer.configure(settings);

    const clasificar = (held) => {
      reset();
      const ctx = getCtx();
      ctx.currentTime = 0;
      let visto = null;
      const off = keyer.onKeyerEvent((type, d) => { if (type === 'symbol') visto = d.kind; });
      keyer.press(settings);
      ctx.advance(held);
      keyer.release();
      off();
      return visto;
    };

    assert.equal(clasificar(umbral - EPS), 'dit', `${wpm} PPM: umbral - eps debe ser punto`);
    assert.equal(clasificar(umbral), 'dah', `${wpm} PPM: en el umbral ya es raya (>=)`);
    assert.equal(clasificar(umbral + EPS), 'dah', `${wpm} PPM: umbral + eps debe ser raya`);
    assert.equal(clasificar(0), 'dit', `${wpm} PPM: una pulsación instantánea es punto`);
  }
});

test('sampleKeyer clasifica igual que release, sin adelantarse', () => {
  reset();
  const settings = resolveSettings({ wpm: 13 });
  keyer.configure(settings);
  const umbral = unitSeconds(settings) * 2;
  const ctx = getCtx();
  ctx.currentTime = 0;

  keyer.press(settings);
  assert.equal(keyer.sampleKeyer(umbral / 2).kind, 'dit');
  assert.ok(keyer.sampleKeyer(umbral / 2).progress > 0.4);
  assert.equal(keyer.sampleKeyer(umbral).kind, 'dah');
  assert.equal(keyer.sampleKeyer(umbral * 3).progress, 1, 'el progreso se acota a 1');
  keyer.release();
  assert.equal(keyer.sampleKeyer(0), null, 'suelta: no hay muestra');
});

/* ------------------------------------------------------ la llave no se pega */

test('forceRelease cierra la llave y emite el símbolo aunque nadie suelte', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  let simbolos = 0;
  const off = keyer.onKeyerEvent((t) => { if (t === 'symbol') simbolos++; });

  keyer.press({ wpm: 13 });
  assert.equal(keyer.isKeying(), true);
  keyer.forceRelease();
  assert.equal(keyer.isKeying(), false, 'el tono SIEMPRE debe poder apagarse');
  assert.equal(simbolos, 1);

  // Idempotente: soltar dos veces no emite un símbolo fantasma.
  keyer.forceRelease();
  assert.equal(simbolos, 1);
  off();
});

test('press repetido sin soltar no reinicia la medición', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  const settings = resolveSettings({ wpm: 13 });
  keyer.configure(settings);

  keyer.press(settings);
  ctx.advance(unitSeconds(settings) * 2 + 0.01);
  keyer.press(settings);            // repetición de teclado: debe ignorarse
  let visto = null;
  const off = keyer.onKeyerEvent((t, d) => { if (t === 'symbol') visto = d.kind; });
  keyer.release();
  off();
  assert.equal(visto, 'dah', 'si press reiniciase el cronómetro saldría punto');
});

test('dispose deja el motor limpio y sin temporizadores', () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  keyer.press({ wpm: 13 });
  keyer.release();
  let letras = 0;
  const off = keyer.onKeyerEvent((t) => { if (t === 'letter') letras++; });
  keyer.dispose();
  assert.equal(keyer.isKeying(), false);
  off();
  assert.equal(letras, 0, 'dispose no debe publicar la letra a medias');
});

test('una secuencia real se decodifica: ...  ---  ... -> SOS', async () => {
  reset();
  const ctx = getCtx();
  ctx.currentTime = 0;
  const settings = resolveSettings({ wpm: 13 });
  keyer.configure(settings);
  const umbral = unitSeconds(settings) * 2;

  const recibidas = [];
  const off = keyer.onKeyerEvent((t, d) => { if (t === 'letter') recibidas.push(d.ch); });

  const enviar = (codigo) => {
    for (const sym of codigo) {
      keyer.press(settings);
      ctx.advance(sym === '-' ? umbral * 1.5 : umbral * 0.3);
      keyer.release();
      ctx.advance(0.01);
    }
  };

  for (const codigo of ['...', '---', '...']) {
    enviar(codigo);
    // El cierre de letra es un setTimeout real: se espera a que caiga.
    await new Promise((r) => setTimeout(r, 700));
  }
  off();
  keyer.dispose();
  assert.deepEqual(recibidas, ['S', 'O', 'S']);
});
