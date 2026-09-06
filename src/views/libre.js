/**
 * Modo libre — las herramientas, en una sola página.
 *
 * La llave es la protagonista: es la parte técnicamente más interesante del
 * proyecto y la única que no se encuentra en cualquier otra web de Morse.
 *
 * Hay UN solo pad de llave, no dos. El motor `core/keyer` es único, así que
 * dos superficies compitiendo por él se pisarían; en su lugar el pad tiene dos
 * modos y un interruptor de dos posiciones decide qué hacer con lo que se
 * teclea.
 */

import * as keyer from '../core/keyer.js';
import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as frameLoop from '../ui/frame-loop.js';
import { Waveform } from '../ui/waveform.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { MORSE, ORDER, fmt, tokenize } from '../data/morse.js';
import { pick } from '../core/srs.js';

const TX_POOL = 'ETANIMSORHDULCGKWBPF'.split('');

export function mount(root, scope) {
  root.innerHTML = `
  <section class="shell shell--narrow section" aria-labelledby="freeTitle">
    <div class="stack">

      <div>
        <p class="section-label">Modo libre</p>
        <h1 class="title" id="freeTitle">La llave.</h1>
        <p class="lede" style="margin-top:10px">
          Mantén pulsado: corto es punto, largo es raya. Suelta un momento y la
          letra se traduce sola. También funciona con la barra espaciadora.
        </p>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:center;margin-bottom:18px">
          <div class="pill pill--group" role="group" aria-label="Qué hacer con lo que transmitas">
            <button class="btn btn--ghost" type="button" id="modeFree"
                    aria-pressed="true" style="min-height:40px;border:none;font-size:13px">Escribir</button>
            <button class="btn btn--ghost" type="button" id="modeTx"
                    aria-pressed="false" style="min-height:40px;border:none;font-size:13px">Practicar letra</button>
          </div>
        </div>

        <div id="txPrompt" hidden style="text-align:center;margin-bottom:18px">
          <p class="field__hint">Transmite esta letra</p>
          <p class="title" id="txLetter" style="font-size:3.4rem;line-height:1">A</p>
          <div class="glyph glyph--lg" id="txGlyph" style="justify-content:center"></div>
        </div>

        <div class="keypad">
          <div class="wave" id="freeWave"></div>
          <button class="keypad__btn" type="button" id="pad">
            Mantén pulsado para transmitir
          </button>
          <p class="keypad__state" id="padState" role="status" aria-live="off">Reposo</p>
          <div class="glyph glyph--lg" id="liveGlyph"></div>
        </div>

        <div class="tape" id="tape" aria-live="polite" aria-label="Texto transmitido"><span class="tape__cursor">▌</span></div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn" type="button" id="tapeBack">Borrar</button>
          <button class="btn" type="button" id="tapeClear">Limpiar</button>
          <button class="btn" type="button" id="txSkip" hidden>Otra letra</button>
        </div>
        <p class="feedback" id="txFb" style="margin-top:10px;text-align:center"></p>
      </div>

      <div class="card">
        <p class="section-label" style="margin-bottom:14px">Texto a Morse</p>
        <label class="sr-only" for="transIn">Texto a convertir</label>
        <input class="input" id="transIn" placeholder="Escribe algo: hola" autocomplete="off" spellcheck="false">
        <div class="glyph" id="transOut" style="flex-wrap:wrap;margin-top:16px;font-size:1.05rem;gap:.9em;min-height:28px"></div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn--primary" type="button" id="transPlay">Reproducir</button>
          <button class="btn" type="button" id="transStop">Detener</button>
        </div>
      </div>

      <div class="card">
        <p class="section-label" style="margin-bottom:14px">Abecedario · toca para oír</p>
        <div class="alphabet" id="alphabet"></div>
      </div>

    </div>
  </section>
  `;

  const $ = (id) => root.querySelector(`#${id}`);
  const pad = $('pad');
  const padState = $('padState');
  const tapeEl = $('tape');
  const txFb = $('txFb');

  scope.add(Waveform($('freeWave'), { bars: 30 }));
  const liveGlyph = scope.add(MorseGlyph($('liveGlyph'), { size: 'lg' }));
  const txGlyph = scope.add(MorseGlyph($('txGlyph'), { size: 'lg' }));
  const transGlyphHost = $('transOut');

  let mode = 'free';
  let tape = '';
  let txTarget = null;
  const prefs = store.getPrefs();

  /* --------------------------------------------------------------- la llave */

  function vibrate(ms) {
    if (!prefs.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch { /* no soportado */ }
  }

  // El estado del pad se pinta desde el bucle único, con el mismo reloj que
  // el sonido: el umbral visual punto/raya y el audible son el mismo cálculo.
  let lastOn = null;
  let lastKind = null;
  scope.add(frameLoop.subscribe((state) => {
    const on = state.on && state.source === 'key';
    if (on !== lastOn) {
      pad.dataset.on = String(on);
      padState.textContent = on ? '' : 'Reposo';
      padState.dataset.kind = '';
      lastOn = on;
      lastKind = null;
    }
    if (on && state.kind !== lastKind) {
      lastKind = state.kind;
      padState.textContent = state.kind === 'dah' ? 'Raya' : 'Punto';
      padState.dataset.kind = state.kind;
    }
  }));

  const down = (e) => {
    e.preventDefault();
    if (e.pointerId != null && pad.setPointerCapture) {
      try { pad.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
    }
    player.stopAll();
    keyer.press(store.getSettings());
    vibrate(16);
  };
  scope.on(pad, 'pointerdown', down);
  scope.on(pad, 'pointerup', () => keyer.release());
  scope.on(pad, 'pointerleave', () => keyer.forceRelease());

  // Teclado: espacio para transmitir. Se ignora si el foco está en un input.
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
    if (type === 'change') {
      liveGlyph.setCode(detail.buffer);
      return;
    }
    if (type === 'symbol') {
      vibrate(detail.kind === 'dah' ? 42 : 18);
      return;
    }
    if (type === 'letter') {
      liveGlyph.setCode('');
      if (mode === 'tx') return checkTx(detail);
      tape += detail.ch;
      renderTape();
      flashAlpha(detail.ch);
      return;
    }
    if (type === 'word' && mode === 'free' && tape && !tape.endsWith(' ')) {
      tape += ' ';
      renderTape();
    }
  }));

  function renderTape() {
    tapeEl.replaceChildren();
    if (tape) tapeEl.append(document.createTextNode(tape.replace(/ /g, ' ')));
    const cur = document.createElement('span');
    cur.className = 'tape__cursor';
    cur.textContent = '▌';
    tapeEl.appendChild(cur);
  }

  scope.on($('tapeBack'), 'click', () => { tape = tape.slice(0, -1); renderTape(); });
  scope.on($('tapeClear'), 'click', () => { tape = ''; keyer.clear(); liveGlyph.setCode(''); renderTape(); });

  /* ------------------------------------------------------ práctica de TX */

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
      ? `Bien. ${txTarget} es ${fmt(MORSE[txTarget])}`
      : `Diste ${fmt(code)}${ch !== '?' ? ` (${ch})` : ''}. ${txTarget} es ${fmt(MORSE[txTarget])}`;
    txFb.dataset.tone = correct ? 'ok' : 'no';
    scope.timeout(newTx, 1200);
  }

  function setMode(next) {
    mode = next;
    const isTx = next === 'tx';
    $('modeFree').setAttribute('aria-pressed', String(!isTx));
    $('modeTx').setAttribute('aria-pressed', String(isTx));
    $('txPrompt').hidden = !isTx;
    $('txSkip').hidden = !isTx;
    tapeEl.hidden = isTx;
    $('tapeBack').hidden = isTx;
    $('tapeClear').hidden = isTx;
    txFb.textContent = '';
    keyer.clear();
    liveGlyph.setCode('');
    if (isTx) newTx();
  }

  scope.on($('modeFree'), 'click', () => setMode('free'));
  scope.on($('modeTx'), 'click', () => setMode('tx'));
  scope.on($('txSkip'), 'click', newTx);

  /* ---------------------------------------------------------- traductor */

  const transIn = $('transIn');

  function renderTranslation() {
    const words = tokenize(transIn.value);
    transGlyphHost.replaceChildren();
    if (words.length === 0) {
      const hint = document.createElement('span');
      hint.style.color = 'var(--muted)';
      hint.style.fontFamily = 'var(--font)';
      hint.textContent = 'Aquí verás el Morse.';
      transGlyphHost.appendChild(hint);
      return;
    }
    words.forEach((word, wi) => {
      word.forEach((ch) => {
        const g = document.createElement('span');
        g.style.display = 'inline-flex';
        g.style.flexDirection = 'column';
        g.style.alignItems = 'center';
        g.style.gap = '3px';
        const sym = document.createElement('span');
        sym.textContent = fmt(MORSE[ch]);
        const lab = document.createElement('span');
        lab.style.fontSize = '10px';
        lab.style.opacity = '.6';
        lab.textContent = ch;
        g.append(sym, lab);
        transGlyphHost.appendChild(g);
      });
      if (wi < words.length - 1) {
        const sep = document.createElement('span');
        sep.style.width = '14px';
        transGlyphHost.appendChild(sep);
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
    cell.innerHTML = `<span class="alpha__ch">${ch}</span><span class="alpha__code">${fmt(MORSE[ch])}</span>`;
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

  renderTape();
  scope.add(() => keyer.dispose());
}
