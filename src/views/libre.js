/**
 * Modo libre — la mesa de telegrafía.
 *
 * La diferencia con Aprender es de control: allí el sistema dirige la sesión,
 * aquí el usuario maneja el instrumento. Por eso la llave ocupa la primera
 * vista entera y todo lo demás llega después, al hacer scroll.
 *
 * Hay UN solo pad: el motor `core/keyer` es único y dos superficies se
 * pisarían. Un interruptor de dos posiciones decide qué se hace con lo que se
 * transmite: escribir en la cinta, o responder a un desafío.
 */

import * as keyer from '../core/keyer.js';
import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as frameLoop from '../ui/frame-loop.js';
import { Waveform } from '../ui/waveform.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { observeReveals } from '../ui/reveal.js';
import { MORSE, ORDER, fmt, tokenize } from '../data/morse.js';
import { pick } from '../core/srs.js';

const TX_POOL = 'ETANIMSORHDULCGKWBPF'.split('');

export function mount(root, scope) {
  root.innerHTML = `
  <section class="desk" id="desk" data-mode="free" data-on="false">

    <header class="desk__head">
      <p class="section-label">Modo libre</p>
      <h1 class="desk__title">La mesa.</h1>
      <p class="lede desk__lede">
        Mantén pulsado: corto es punto, largo es raya. Suelta un momento y la
        letra se decodifica sola.
      </p>
    </header>

    <div class="seg" role="group" aria-label="Qué hacer con lo que transmitas">
      <button class="seg__btn" type="button" id="modeFree" aria-pressed="true">Escribir</button>
      <button class="seg__btn" type="button" id="modeTx" aria-pressed="false">Desafío</button>
    </div>

    <div class="desk__challenge" id="txPrompt" hidden>
      <p class="field__hint">Transmite</p>
      <p class="desk__target" id="txLetter">A</p>
      <div class="glyph glyph--lg desk__targetcode" id="txGlyph"></div>
    </div>

    <button class="key" type="button" id="pad"
            aria-label="Mantener pulsado para transmitir. También funciona con la barra espaciadora.">
      <span class="key__ring" aria-hidden="true"></span>
      <span class="key__core" aria-hidden="true"></span>
      <span class="key__label" id="padLabel">Pulsa para transmitir</span>
    </button>

    <p class="key__state" id="padState" role="status" aria-live="off">Reposo</p>

    <div class="desk__signal">
      <div class="wave" id="freeWave"></div>
      <div class="glyph glyph--lg" id="liveGlyph"></div>
    </div>

    <p class="feedback desk__fb" id="txFb" role="status" aria-live="polite"></p>

    <div class="tapewrap" id="tapeWrap">
      <p class="section-label">Transmisión</p>
      <div class="tape" id="tape" aria-live="polite" aria-label="Texto decodificado"><span class="tape__cursor">▌</span></div>
      <div class="desk__actions">
        <button class="btn" type="button" id="tapeBack">Borrar</button>
        <button class="btn" type="button" id="tapeClear">Limpiar</button>
      </div>
    </div>

    <div class="desk__actions" id="txActions" hidden>
      <button class="btn" type="button" id="txSkip">Otra letra</button>
    </div>
  </section>

  <div class="sigline-band" aria-hidden="true" id="deskBand"></div>

  <section class="tool" aria-labelledby="transTitle" data-reveal>
    <p class="section-label">Texto a Morse</p>
    <h2 class="title tool__title" id="transTitle">Escribe y escúchalo.</h2>
    <label class="sr-only" for="transIn">Texto a convertir</label>
    <input class="input input--lg" id="transIn" placeholder="Escribe algo: hola"
           autocomplete="off" spellcheck="false">
    <div class="glyph tool__out" id="transOut"></div>
    <div class="desk__actions">
      <button class="btn btn--primary" type="button" id="transPlay">Reproducir</button>
      <button class="btn" type="button" id="transStop">Detener</button>
    </div>
  </section>

  <section class="tool tool--alpha" aria-labelledby="alphaTitle" data-reveal>
    <p class="section-label">Abecedario</p>
    <h2 class="title tool__title" id="alphaTitle">Toca para oír.</h2>
    <div class="alphabet" id="alphabet"></div>
  </section>
  `;

  const $ = (id) => root.querySelector(`#${id}`);
  const desk = $('desk');
  const pad = $('pad');
  const padState = $('padState');
  const padLabel = $('padLabel');
  const tapeEl = $('tape');
  const txFb = $('txFb');

  scope.add(Waveform($('freeWave'), { bars: 32 }));
  const liveGlyph = scope.add(MorseGlyph($('liveGlyph'), { size: 'lg' }));
  const txGlyph = scope.add(MorseGlyph($('txGlyph'), { size: 'lg' }));

  let mode = 'free';
  let tape = '';
  let txTarget = null;
  const prefs = store.getPrefs();

  /* --------------------------------------------------------------- la llave */

  function vibrate(ms) {
    if (!prefs.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch { /* no soportado */ }
  }

  // El estado visual de la llave sale del MISMO muestreo que el sonido: no hay
  // una animación paralela adivinando cuándo hay contacto.
  let lastOn = null;
  let lastKind = null;
  scope.add(frameLoop.subscribe((s) => {
    const on = s.on && s.source === 'key';
    if (on !== lastOn) {
      desk.dataset.on = String(on);
      pad.dataset.on = String(on);
      if (!on) { padState.textContent = 'Reposo'; padState.dataset.kind = ''; }
      lastOn = on;
      lastKind = null;
    }
    if (on && s.kind !== lastKind) {
      lastKind = s.kind;
      padState.textContent = s.kind === 'dah' ? 'Raya' : 'Punto';
      padState.dataset.kind = s.kind;
      pad.dataset.kind = s.kind;
    }
  }));

  scope.on(pad, 'pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerId != null && pad.setPointerCapture) {
      try { pad.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
    }
    player.stopAll();
    keyer.press(store.getSettings());
    vibrate(16);
  });
  scope.on(pad, 'pointerup', () => keyer.release());
  scope.on(pad, 'pointercancel', () => keyer.forceRelease());
  scope.on(pad, 'lostpointercapture', () => keyer.forceRelease());

  // Barra espaciadora. Se ignora si el foco está en un campo de texto.
  scope.on(window, 'keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    player.stopAll();
    keyer.press(store.getSettings());
  });
  scope.on(window, 'keyup', (e) => {
    if (e.code !== 'Space') return;
    if (e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    keyer.release();
  });

  scope.add(keyer.onKeyerEvent((type, detail) => {
    if (type === 'change') { liveGlyph.setCode(detail.buffer); return; }
    if (type === 'symbol') { vibrate(detail.kind === 'dah' ? 42 : 18); return; }
    if (type === 'letter') {
      liveGlyph.setCode('');
      if (mode === 'tx') return checkTx(detail);
      appendTape(detail.ch);
      flashAlpha(detail.ch);
      return;
    }
    if (type === 'word' && mode === 'free' && tape && !tape.endsWith(' ')) {
      appendTape(' ');
    }
  }));

  /* ------------------------------------------------------------- la cinta */

  /** Cada letra aparece con su propia microtransición, no un typewriter lento. */
  function appendTape(ch) {
    tape += ch;
    const span = document.createElement('span');
    span.className = 'tape__ch';
    span.textContent = ch === ' ' ? ' ' : ch;
    tapeEl.insertBefore(span, tapeEl.lastElementChild);
  }

  function renderTape() {
    tapeEl.replaceChildren();
    for (const ch of tape) {
      const span = document.createElement('span');
      span.className = 'tape__ch';
      span.dataset.settled = 'true';
      span.textContent = ch === ' ' ? ' ' : ch;
      tapeEl.appendChild(span);
    }
    const cur = document.createElement('span');
    cur.className = 'tape__cursor';
    cur.textContent = '▌';
    tapeEl.appendChild(cur);
  }

  scope.on($('tapeBack'), 'click', () => { tape = tape.slice(0, -1); renderTape(); });
  scope.on($('tapeClear'), 'click', () => {
    tape = ''; keyer.clear(); liveGlyph.setCode(''); renderTape();
  });

  /* -------------------------------------------------- desafío de transmisión */

  function newTx() {
    txTarget = pick(TX_POOL.filter((c) => c !== txTarget));
    $('txLetter').textContent = txTarget;
    txGlyph.setCode(MORSE[txTarget]);
    txFb.textContent = '';
    txFb.dataset.tone = '';
  }

  function checkTx({ ch, code }) {
    const correct = code === MORSE[txTarget];
    txFb.textContent = correct
      ? `✓ ${txTarget}`
      : `Recibí ${ch === '?' ? fmt(code) : ch} · ${txTarget} es ${fmt(MORSE[txTarget])}`;
    txFb.dataset.tone = correct ? 'ok' : 'no';
    scope.timeout(newTx, 1250);
  }

  function setMode(next) {
    mode = next;
    const isTx = next === 'tx';
    desk.dataset.mode = next;
    $('modeFree').setAttribute('aria-pressed', String(!isTx));
    $('modeTx').setAttribute('aria-pressed', String(isTx));
    $('txPrompt').hidden = !isTx;
    $('txActions').hidden = !isTx;
    $('tapeWrap').hidden = isTx;
    padLabel.textContent = isTx ? 'Transmite la letra' : 'Pulsa para transmitir';
    txFb.textContent = '';
    txFb.dataset.tone = '';
    keyer.clear();
    liveGlyph.setCode('');
    if (isTx) newTx();
  }

  scope.on($('modeFree'), 'click', () => setMode('free'));
  scope.on($('modeTx'), 'click', () => setMode('tx'));
  scope.on($('txSkip'), 'click', newTx);

  /* ---------------------------------------------------------- traductor */

  const transIn = $('transIn');
  const transOut = $('transOut');

  function renderTranslation() {
    const words = tokenize(transIn.value);
    transOut.replaceChildren();
    if (words.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'tool__placeholder';
      hint.textContent = 'Aquí verás el Morse.';
      transOut.appendChild(hint);
      return;
    }
    words.forEach((word, wi) => {
      for (const ch of word) {
        const g = document.createElement('span');
        g.className = 'tool__grp';
        const sym = document.createElement('span');
        sym.className = 'tool__sym';
        sym.textContent = fmt(MORSE[ch]);
        const lt = document.createElement('span');
        lt.className = 'tool__lt';
        lt.textContent = ch;
        g.append(sym, lt);
        transOut.appendChild(g);
      }
      if (wi < words.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'tool__sep';
        transOut.appendChild(sep);
      }
    });
  }

  scope.on(transIn, 'input', renderTranslation);
  scope.on(transIn, 'keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('transPlay').click(); }
  });
  scope.on($('transPlay'), 'click', async () => {
    if (!transIn.value.trim()) return;
    await audio.resume();
    player.playText(transIn.value, store.getSettings());
  });
  scope.on($('transStop'), 'click', () => player.stopAll());
  renderTranslation();

  /* --------------------------------------------------------- abecedario */

  const alphabet = $('alphabet');
  // ORDER es explícito: Object.keys(MORSE) pondría los dígitos delante porque
  // JS enumera antes las claves con forma de entero.
  for (const ch of ORDER) {
    const cell = document.createElement('button');
    cell.className = 'alpha';
    cell.type = 'button';
    cell.dataset.ch = ch;
    cell.setAttribute('aria-label', `${ch}, ${fmt(MORSE[ch])}`);
    const chEl = document.createElement('span');
    chEl.className = 'alpha__ch';
    chEl.textContent = ch;
    const codeEl = document.createElement('span');
    codeEl.className = 'alpha__code';
    codeEl.textContent = fmt(MORSE[ch]);
    cell.append(chEl, codeEl);
    cell.addEventListener('click', async () => {
      await audio.resume();
      player.playText(ch, store.getSettings());
      flashAlpha(ch);
    });
    alphabet.appendChild(cell);
  }

  function flashAlpha(ch) {
    const cell = alphabet.querySelector(`[data-ch="${CSS.escape(ch)}"]`);
    if (!cell) return;
    cell.dataset.lit = 'true';
    scope.timeout(() => { cell.dataset.lit = 'false'; }, 620);
  }

  /* ---------------------------------------------------------------- resto */

  import('../ui/signal-line.js').then(({ SignalLine }) => {
    if (scope.disposed) return;
    scope.add(SignalLine($('deskBand'), 'SOS'));
  });

  renderTape();
  scope.add(observeReveals(root));
  scope.add(() => keyer.dispose());
}
