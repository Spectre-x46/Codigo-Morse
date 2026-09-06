/**
 * Aprender — la experiencia principal.
 *
 * Se entra y se empieza. No hay que elegir velocidad, nivel, modo ni tipo de
 * ejercicio: todo eso tiene un valor por defecto razonable y vive en Ajustes
 * para quien lo busque.
 *
 * Máquina de estados explícita:
 *   idle → playing → awaiting → feedback → (next | summary)
 *
 * La selección adaptativa que antes era una pestaña llamada "Recuperar" ahora
 * es invisible: `pickWeighted` insiste en los caracteres flojos sin que el
 * usuario tenga que pedirlo.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as srs from '../core/srs.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { Waveform } from '../ui/waveform.js';
import { toast } from '../ui/toast.js';
import { MORSE, fmt } from '../data/morse.js';
import { levelGoalText, levelChars } from '../data/levels.js';
import { tipFor } from '../data/tips.js';

const SESSION_LENGTH = 10;
const FEEDBACK_MS = 1150;
const FEEDBACK_MS_LEVEL = 1900;

export function mount(root, scope) {
  root.innerHTML = `
  <section class="shell shell--narrow section" aria-labelledby="learnTitle">
    <div class="stack">

      <div id="learnHead" style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <p class="section-label">Sesión de práctica</p>
          <h1 class="title" id="learnTitle" style="font-size:clamp(1.7rem,4.5vw,2.4rem)">¿Qué letra fue?</h1>
        </div>
        <span class="pill" id="learnLevel"></span>
      </div>

      <div class="card session" id="learnCard">
        <div class="session__meter" id="learnMeter" aria-hidden="true"></div>
        <div class="wave" id="learnWave"></div>
        <div class="glyph glyph--lg" id="learnGlyph"></div>
        <p class="feedback" id="learnFb" role="status" aria-live="polite">
          Pulsa empezar: oirás una letra y eliges cuál fue.
        </p>
        <div class="options" id="learnOptions" style="width:min(420px,100%)"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn--primary btn--lg" type="button" id="learnStart">Empezar</button>
          <button class="btn btn--ghost" type="button" id="learnRepeat" hidden>Repetir señal</button>
        </div>
        <p class="field__hint" id="learnTip"></p>
      </div>

      <div class="card" id="learnSummary" hidden></div>

      <p class="field__hint" id="learnGoal" style="text-align:center"></p>
    </div>
  </section>
  `;

  const $ = (id) => root.querySelector(`#${id}`);
  const els = {
    head: $('learnHead'), card: $('learnCard'), meter: $('learnMeter'),
    fb: $('learnFb'), options: $('learnOptions'), start: $('learnStart'),
    repeat: $('learnRepeat'), tip: $('learnTip'), level: $('learnLevel'),
    goal: $('learnGoal'), summary: $('learnSummary')
  };

  const glyph = scope.add(MorseGlyph($('learnGlyph'), { size: 'lg' }));
  scope.add(Waveform($('learnWave'), { bars: 26 }));

  /** @type {'idle'|'playing'|'awaiting'|'feedback'|'summary'} */
  let state = 'idle';
  let answer = null;
  let playback = null;
  let index = 0;
  /** @type {{ch:string, correct:boolean}[]} */
  let results = [];
  let advanceTimer = 0;

  /* ------------------------------------------------------------ cabecera */

  function progress() {
    return store.getProgress();
  }

  function renderHeader() {
    const p = progress();
    els.level.textContent = `Nivel ${p.level + 1} · ${srs.activeSet(p.level).length} caracteres`;
    const hits = p.window.filter(Boolean).length;
    els.goal.textContent = levelGoalText(p.level, hits, p.window.length);
    els.tip.textContent = tipFor(levelChars(p.level));
  }

  function renderMeter() {
    els.meter.replaceChildren();
    for (let i = 0; i < SESSION_LENGTH; i++) {
      const d = document.createElement('span');
      d.className = 'session__dot';
      const r = results[i];
      d.dataset.state = r ? (r.correct ? 'ok' : 'no') : (i === index && state !== 'idle' ? 'now' : '');
      els.meter.appendChild(d);
    }
  }

  /* -------------------------------------------------------------- opciones */

  function renderOptions(correct, pool) {
    const count = Math.min(pool.length - 1, 4);
    const opts = srs.buildOptions(correct, pool, count);
    els.options.replaceChildren();
    opts.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = ch;
      b.dataset.state = '';
      b.dataset.value = ch;
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.addEventListener('click', () => answerWith(ch, b));
      els.options.appendChild(b);
    });
  }

  function lockOptions(chosen) {
    for (const b of els.options.children) {
      b.disabled = true;
      if (b.dataset.value === answer) b.dataset.state = 'ok';
      else if (b === chosen) b.dataset.state = 'no';
    }
  }

  /* ---------------------------------------------------- ciclo de la sesión */

  async function nextItem() {
    clearTimeout(advanceTimer);
    if (index >= SESSION_LENGTH) return showSummary();

    state = 'playing';
    els.fb.textContent = 'Escuchando…';
    els.fb.dataset.tone = '';
    glyph.clear();
    els.repeat.hidden = false;
    els.start.hidden = true;

    const p = progress();
    const pool = srs.activeSet(p.level);
    answer = srs.pickWeighted(pool, answer);      // adaptativo, invisible
    renderOptions(answer, pool);
    renderMeter();

    await audio.resume();
    playback = player.playText(answer, store.getSettings());

    if (playback.state === 'blocked') {
      state = 'idle';
      els.fb.textContent = 'Toca la pantalla para activar el audio y vuelve a intentarlo.';
      els.start.hidden = false;
      els.start.textContent = 'Reintentar';
      return;
    }

    glyph.track(playback, 0);
    state = 'awaiting';
  }

  function answerWith(value, btn) {
    if (state !== 'awaiting' || !answer) return;
    state = 'feedback';

    const correct = value === answer;
    lockOptions(btn);

    els.fb.textContent = correct
      ? `Correcto. ${answer} es ${fmt(MORSE[answer])}`
      : `Era ${answer} — ${fmt(MORSE[answer])}`;
    els.fb.dataset.tone = correct ? 'ok' : 'no';
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

    renderHeader();
    renderMeter();
    advanceTimer = setTimeout(() => {
      if (!scope.disposed) nextItem();
    }, leveled ? FEEDBACK_MS_LEVEL : FEEDBACK_MS);
  }

  /* -------------------------------------------------------------- resumen */

  function showSummary() {
    state = 'summary';
    const hits = results.filter((r) => r.correct).length;
    const pct = Math.round((hits / results.length) * 100);
    const practiced = [...new Set(results.map((r) => r.ch))];
    const missed = [...new Set(results.filter((r) => !r.correct).map((r) => r.ch))];

    const p = store.getProgress();
    store.setProgress({
      sessions: p.sessions + 1,
      bestStreak: Math.max(p.bestStreak, longestStreak(results))
    });

    els.card.hidden = true;
    els.goal.hidden = true;
    els.summary.hidden = false;
    els.summary.innerHTML = `
      <div class="stack" style="text-align:center;align-items:center">
        <p class="section-label">Sesión completada</p>
        <p class="title" style="font-size:clamp(2.2rem,7vw,3.2rem)">${hits} / ${results.length}</p>
        <p class="lede" style="margin:0">${pct}% de precisión</p>

        <div style="width:100%;max-width:420px">
          <p class="field__hint" style="margin-bottom:8px">Practicaste</p>
          <div class="glyph" style="justify-content:center;font-size:1.3rem;letter-spacing:.2em;color:var(--text)">
            ${practiced.join(' ')}
          </div>
        </div>

        ${missed.length ? `<p class="field__hint">Cuesta más: <strong style="color:var(--text)">${missed.join(', ')}</strong></p>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px">
          <button class="btn btn--primary btn--lg" type="button" id="againBtn">Continuar</button>
          <a class="btn btn--ghost btn--lg" href="#/">Volver al inicio</a>
        </div>
      </div>
    `;
    els.summary.querySelector('#againBtn').addEventListener('click', restart);
    els.summary.querySelector('#againBtn').focus();
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
    els.card.hidden = false;
    els.goal.hidden = false;
    renderHeader();
    nextItem();
  }

  /* ------------------------------------------------------------- controles */

  scope.on(els.start, 'click', () => { results = []; index = 0; nextItem(); });
  scope.on(els.repeat, 'click', async () => {
    if (!answer || state === 'summary') return;
    await audio.resume();
    playback = player.playText(answer, store.getSettings());
    glyph.track(playback, 0);
  });

  // Teclado: números para elegir y R para repetir. Aprender de oído con las
  // manos en el teclado es más rápido que apuntar con el ratón.
  scope.on(window, 'keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (state === 'awaiting' && /^[1-9]$/.test(e.key)) {
      const btn = els.options.children[Number(e.key) - 1];
      if (btn) { e.preventDefault(); answerWith(btn.dataset.value, btn); }
      return;
    }
    if (state === 'awaiting' && /^[a-z0-9]$/i.test(e.key)) {
      const ch = e.key.toUpperCase();
      const btn = [...els.options.children].find((b) => b.dataset.value === ch);
      if (btn) { e.preventDefault(); answerWith(ch, btn); }
      return;
    }
    if (e.key.toLowerCase() === 'r' && !els.repeat.hidden) {
      e.preventDefault();
      els.repeat.click();
    }
  });

  scope.add(() => clearTimeout(advanceTimer));

  renderHeader();
  renderMeter();
}
