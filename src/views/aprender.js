/**
 * Aprender — la sala de entrenamiento.
 *
 * No es un formulario ni un quiz: es un instrumento. Toda la pantalla responde
 * al estado del sistema, y el estado lo marca el audio.
 *
 *   idle → playing → awaiting → feedback → (next | summary)
 *
 * Nada se mueve porque sí. Cada transición corresponde a un evento real:
 * empieza la señal, termina la señal, el usuario responde, avanza el ítem.
 *
 * La selección adaptativa (antes la pestaña "Recuperar") va dentro, invisible.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as srs from '../core/srs.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { Waveform } from '../ui/waveform.js';
import { toast } from '../ui/toast.js';
import { prefersReduced } from '../ui/motion.js';
import { MORSE, fmt } from '../data/morse.js';
import { levelChars } from '../data/levels.js';
import { tipFor } from '../data/tips.js';

const SESSION_LENGTH = 10;
const FEEDBACK_MS = 1100;
const FEEDBACK_MS_LEVEL = 1800;
const SWAP_MS = 220;

const STATE_LABEL = {
  idle: 'Escucha',
  playing: 'Escucha',
  awaiting: '¿Qué letra fue?',
  feedback: ''
};

export function mount(root, scope) {
  root.innerHTML = `
  <section class="room" id="room" data-state="idle" aria-labelledby="roomTitle">

    <header class="room__top">
      <h1 class="room__name" id="roomTitle">Aprender</h1>
      <p class="room__count" id="roomCount"><span>01</span> / ${SESSION_LENGTH}</p>
      <div class="room__rule" aria-hidden="true"><i id="roomBar"></i></div>
    </header>

    <div class="room__stage" id="roomStage">
      <p class="room__state" id="roomState">Escucha</p>

      <div class="room__signal">
        <div class="wave" id="roomWave"></div>
        <div class="glyph glyph--xl" id="roomGlyph"></div>
      </div>

      <p class="room__fb" id="roomFb" role="status" aria-live="polite">
        Pulsa empezar y elige la letra que oigas.
      </p>

      <div class="options options--room" id="roomOptions"></div>

      <div class="room__actions">
        <button class="btn btn--primary btn--lg" type="button" id="roomStart">Empezar</button>
        <button class="btn btn--ghost" type="button" id="roomRepeat" hidden>
          Repetir señal
        </button>
      </div>

      <p class="room__hint" id="roomHint"></p>
    </div>

    <footer class="room__bottom">
      <span id="roomAcc">Precisión —</span>
      <span id="roomLevel">Nivel 1</span>
    </footer>
  </section>

  <section class="summary" id="summary" hidden aria-labelledby="sumTitle"></section>
  `;

  const $ = (id) => root.querySelector(`#${id}`);
  const room = $('room');
  const els = {
    stage: $('roomStage'), state: $('roomState'), fb: $('roomFb'),
    options: $('roomOptions'), start: $('roomStart'), repeat: $('roomRepeat'),
    hint: $('roomHint'), count: $('roomCount'), bar: $('roomBar'),
    acc: $('roomAcc'), level: $('roomLevel'), summary: $('summary')
  };

  const glyph = scope.add(MorseGlyph($('roomGlyph'), { size: 'xl' }));
  scope.add(Waveform($('roomWave'), { bars: 28 }));

  /** @type {'idle'|'playing'|'awaiting'|'feedback'|'summary'} */
  let state = 'idle';
  let answer = null;
  let index = 0;
  /** @type {{ch:string, correct:boolean}[]} */
  let results = [];
  let advanceTimer = 0;

  function setState(next) {
    state = next;
    room.dataset.state = next;
    if (STATE_LABEL[next] !== undefined) els.state.textContent = STATE_LABEL[next];
  }

  /* ----------------------------------------------------------- indicadores */

  function renderMeta() {
    const p = store.getProgress();
    els.level.textContent = `Nivel ${p.level + 1}`;
    els.acc.textContent = p.attempts
      ? `Precisión ${Math.round((p.correct / p.attempts) * 100)}%`
      : 'Precisión —';
    els.hint.textContent = tipFor(levelChars(p.level));
  }

  function renderProgress() {
    const shown = Math.min(index + 1, SESSION_LENGTH);
    els.count.firstElementChild.textContent = String(shown).padStart(2, '0');
    els.bar.style.transform = `scaleX(${(index / SESSION_LENGTH).toFixed(4)})`;
  }

  /* -------------------------------------------------------------- opciones */

  function renderOptions(correct, pool, disabled) {
    const count = Math.min(pool.length - 1, 3);
    const opts = srs.buildOptions(correct, pool, count);
    els.options.replaceChildren();
    opts.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = ch;
      b.dataset.state = '';
      b.dataset.value = ch;
      b.disabled = disabled;
      b.style.setProperty('--i', String(i));
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.addEventListener('click', () => answerWith(ch, b));
      els.options.appendChild(b);
    });
  }

  function enableOptions() {
    for (const b of els.options.children) b.disabled = false;
  }

  /* ------------------------------------------------- crossfade entre ítems */

  function swapStage(fn) {
    if (prefersReduced()) { fn(); return; }
    els.stage.dataset.swap = 'out';
    scope.timeout(() => {
      fn();
      els.stage.dataset.swap = 'in';
      scope.timeout(() => { els.stage.dataset.swap = ''; }, SWAP_MS);
    }, SWAP_MS * 0.5);
  }

  /* ---------------------------------------------------- ciclo de la sesión */

  async function nextItem() {
    clearTimeout(advanceTimer);
    if (index >= SESSION_LENGTH) return showSummary();

    els.start.hidden = true;
    els.repeat.hidden = false;

    const p = store.getProgress();
    const pool = srs.activeSet(p.level);
    answer = srs.pickWeighted(pool, answer);       // adaptativo, invisible

    swapStage(() => {
      glyph.clear();
      glyph.setCode('');
      renderOptions(answer, pool, true);
      renderProgress();
    });

    setState('playing');
    els.fb.textContent = '';
    els.fb.dataset.tone = '';

    await audio.resume();
    const pb = player.playText(answer, store.getSettings());

    if (pb.state === 'blocked') {
      setState('idle');
      els.fb.textContent = 'Toca la pantalla para activar el audio e inténtalo otra vez.';
      els.start.hidden = false;
      els.start.textContent = 'Reintentar';
      return;
    }

    glyph.track(pb, 0);

    // Las opciones se activan cuando la señal termina: no se puede responder a
    // algo que aún está sonando.
    pb.finished.then((reason) => {
      if (scope.disposed || state !== 'playing' || reason !== 'ended') return;
      setState('awaiting');
      enableOptions();
      els.options.querySelector('.option')?.focus({ preventScroll: true });
    });
  }

  function answerWith(value, btn) {
    if (state !== 'awaiting' || !answer) return;
    setState('feedback');

    const correct = value === answer;
    for (const b of els.options.children) {
      b.disabled = true;
      if (b.dataset.value === answer) b.dataset.state = 'ok';
      else if (b === btn) b.dataset.state = 'no';
    }

    els.fb.textContent = correct ? '✓ Correcto' : `Era ${answer}`;
    els.fb.dataset.tone = correct ? 'ok' : 'no';
    els.state.textContent = `${answer} — ${fmt(MORSE[answer])}`;
    glyph.setCode(MORSE[answer]);

    store.recordAnswer(answer, correct);
    results.push({ ch: answer, correct });
    index++;

    const p = store.getProgress();
    const nextWindow = srs.pushWindow(p.window, correct);
    let leveled = false;
    if (srs.shouldLevelUp(nextWindow, p.level)) {
      store.setProgress({ level: p.level + 1, window: [] });
      leveled = true;
      toast(`Nivel ${p.level + 2} desbloqueado`);
    } else {
      store.setProgress({ window: nextWindow });
    }

    renderMeta();
    renderProgress();
    advanceTimer = setTimeout(() => {
      if (!scope.disposed) nextItem();
    }, leveled ? FEEDBACK_MS_LEVEL : FEEDBACK_MS);
  }

  /* -------------------------------------------------------------- resumen */

  function showSummary() {
    setState('summary');
    const hits = results.filter((r) => r.correct).length;
    const pct = Math.round((hits / results.length) * 100);
    const practiced = [...new Set(results.map((r) => r.ch))];
    const missed = [...new Set(results.filter((r) => !r.correct).map((r) => r.ch))];

    const p = store.getProgress();
    store.setProgress({
      sessions: p.sessions + 1,
      bestStreak: Math.max(p.bestStreak, longestStreak(results))
    });

    room.hidden = true;
    els.summary.hidden = false;
    els.summary.innerHTML = `
      <p class="section-label">Sesión terminada</p>
      <p class="summary__score">${hits} <span>/ ${results.length}</span></p>
      <p class="lede summary__pct">${pct}% de precisión</p>

      <div class="summary__block">
        <p class="field__hint">Practicaste</p>
        <p class="summary__chars">${practiced.join('  ')}</p>
      </div>

      ${missed.length ? `
      <div class="summary__block">
        <p class="field__hint">Más débil</p>
        <p class="summary__weak">${missed.join(', ')}</p>
      </div>` : ''}

      <div class="summary__actions">
        <button class="btn btn--primary btn--lg" type="button" id="againBtn">Continuar</button>
        <a class="btn btn--ghost btn--lg" href="#/">Volver al inicio</a>
      </div>
    `;
    els.summary.querySelector('#againBtn').addEventListener('click', restart);
    els.summary.querySelector('#againBtn').focus({ preventScroll: true });
  }

  function longestStreak(list) {
    let best = 0, run = 0;
    for (const r of list) { run = r.correct ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  }

  function restart() {
    results = [];
    index = 0;
    answer = null;
    els.summary.hidden = true;
    room.hidden = false;
    renderMeta();
    renderProgress();
    nextItem();
  }

  /* ------------------------------------------------------------- controles */

  scope.on(els.start, 'click', () => { results = []; index = 0; nextItem(); });

  scope.on(els.repeat, 'click', async () => {
    if (!answer || state === 'summary') return;
    await audio.resume();
    const pb = player.playText(answer, store.getSettings());
    if (pb.state !== 'blocked') glyph.track(pb, 0);
  });

  // Teclado: números para responder, letra directa, y espacio para repetir.
  scope.on(window, 'keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;

    if (e.code === 'Space' && !els.repeat.hidden && state !== 'summary') {
      e.preventDefault();
      els.repeat.click();
      return;
    }
    if (state !== 'awaiting') return;

    if (/^[1-9]$/.test(e.key)) {
      const btn = els.options.children[Number(e.key) - 1];
      if (btn) { e.preventDefault(); answerWith(btn.dataset.value, btn); }
      return;
    }
    if (/^[a-z0-9]$/i.test(e.key)) {
      const ch = e.key.toUpperCase();
      const btn = [...els.options.children].find((b) => b.dataset.value === ch);
      if (btn) { e.preventDefault(); answerWith(ch, btn); }
    }
  });

  scope.add(() => clearTimeout(advanceTimer));

  renderMeta();
  renderProgress();
}
