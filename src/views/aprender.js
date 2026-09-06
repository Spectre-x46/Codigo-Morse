/**
 * Aprender — la sala de entrenamiento.
 *
 * No es un formulario ni un quiz: es un instrumento. Toda la pantalla responde
 * al estado del sistema, y el estado lo marca el audio.
 *
 *   idle → intro? → playing → awaiting → feedback → (playing | summary)
 *                      ↑         │
 *                      └─────────┘  repetir señal
 *
 * "Repetir" es una transición de verdad, no un atajo que suena por su cuenta:
 * vuelve a `playing` y desactiva las opciones. Antes se podía responder con la
 * señal aún sonando, que es justo lo que el ejercicio no debe permitir.
 *
 * Nada se mueve porque sí. Cada transición corresponde a un evento real:
 * empieza la señal, termina la señal, el usuario responde, avanza el ítem.
 *
 * La selección adaptativa (antes la pestaña "Recuperar") va dentro, invisible.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as adaptive from '../core/adaptive.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { Waveform } from '../ui/waveform.js';
import { toast } from '../ui/toast.js';
import { prefersReduced } from '../ui/motion.js';
import { isInteractive, isTyping } from '../ui/keys.js';
import { MORSE, fmt } from '../data/morse.js';
import { levelGoalText } from '../data/levels.js';
import { TIPS } from '../data/tips.js';

const SESSION_LENGTH = 10;
const FEEDBACK_MS = 1100;
const FEEDBACK_MS_LEVEL = 1800;
const SWAP_MS = 220;

/**
 * Presentación mínima para quien nunca ha oído Morse.
 *
 * Sin esto, "Aprender" empezaba examinando: sonaba E o T y había que acertar
 * sin haber oído nunca ninguna de las dos. Dura dos sonidos y no vuelve a
 * salir (`prefs.introDone`).
 */
const INTRO = [
  { ch: 'E', text: 'Un destello corto. Eso es la E.' },
  { ch: 'T', text: 'Uno largo, el triple. Eso es la T.' }
];

const STATE_LABEL = {
  idle: 'Escucha',
  intro: 'Escucha',
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

      <p class="room__hint" id="roomHint" aria-live="polite"></p>
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

  /** @type {'idle'|'intro'|'playing'|'awaiting'|'feedback'|'summary'} */
  let state = 'idle';
  let answer = null;
  let index = 0;
  /** @type {{ch:string, correct:boolean}[]} */
  let results = [];
  let advanceTimer = 0;
  let introStep = 0;

  /**
   * Cada reproducción se marca con un token. Cualquier continuación asíncrona
   * —el `await audio.resume()`, la promesa `finished`— comprueba que sigue
   * siendo la vigente antes de tocar la interfaz. Sin esto, pulsar "Repetir"
   * dos veces rápido dejaba a la primera reproducción reactivando las opciones
   * de una señal que ya no sonaba.
   */
  let playToken = 0;

  function setState(next) {
    state = next;
    room.dataset.state = next;
    if (STATE_LABEL[next] !== undefined) els.state.textContent = STATE_LABEL[next];
    // Repetir sólo tiene sentido mientras el ítem está en juego.
    els.repeat.disabled = !(next === 'playing' || next === 'awaiting');
  }

  /* ----------------------------------------------------------- indicadores */

  function renderMeta() {
    const p = store.getProgress();
    els.level.textContent = `Nivel ${p.level + 1}`;
    els.acc.textContent = p.attempts
      ? `Precisión ${Math.round((p.correct / p.attempts) * 100)}%`
      : 'Precisión —';
  }

  function renderProgress() {
    const shown = Math.min(index + 1, SESSION_LENGTH);
    els.count.firstElementChild.textContent = String(shown).padStart(2, '0');
    els.bar.style.transform = `scaleX(${(index / SESSION_LENGTH).toFixed(4)})`;
  }

  /**
   * La mnemotecnia es AYUDA, no material de estudio: aparece cuando has
   * fallado esa letra, nunca antes de oírla. Estaba fija en pantalla desde el
   * primer frame, lo que convertía "aprende de oído" en leer una chuleta.
   */
  function showHint(ch) {
    els.hint.textContent = TIPS[ch] ?? '';
  }
  function clearHint() {
    els.hint.textContent = '';
  }

  /* -------------------------------------------------------------- opciones */

  function renderOptions(correct, pool, disabled) {
    const count = Math.min(pool.length - 1, 3);
    const opts = adaptive.buildOptions(correct, pool, count);
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

  /**
   * Bloqueo de las opciones.
   *
   * `disabled` real mientras suena la señal: no hay nada que responder y
   * conviene que el tabulador las salte.
   *
   * `aria-disabled` durante el feedback: uno de esos botones ACABA de recibir
   * el clic o la pulsación, y deshabilitarlo de verdad manda el foco al
   * <body> — durante el segundo largo del feedback el usuario de teclado
   * perdía su sitio y Tab reiniciaba desde la cabecera. `answerWith` ya
   * comprueba el estado, así que un clic extra no hace nada.
   */
  function setOptionsDisabled(disabled) {
    for (const b of els.options.children) {
      b.disabled = disabled;
      b.removeAttribute('aria-disabled');
    }
  }
  function lockOptionsKeepingFocus() {
    for (const b of els.options.children) {
      b.disabled = false;
      b.setAttribute('aria-disabled', 'true');
    }
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

  /* ------------------------------------------------------- reproducción */

  /**
   * Reproduce el carácter en juego y devuelve la pantalla a `awaiting` cuando
   * termina. Es el ÚNICO camino que activa las opciones.
   *
   * @param {{focusFirst?: boolean}} [opts] mover el foco a la primera opción al
   *   terminar. Sólo en la primera escucha del ítem: al repetir, robarle el
   *   foco al botón "Repetir" dejaría perdido a quien navega con teclado.
   */
  async function playCurrent({ focusFirst = false } = {}) {
    if (!answer) return;
    const token = ++playToken;

    setState('playing');
    setOptionsDisabled(true);

    await audio.resume();
    if (scope.disposed || token !== playToken) return;

    const pb = player.playText(answer, store.getSettings());

    if (pb.state === 'blocked') {
      setState('idle');
      els.fb.textContent = 'Toca la pantalla para activar el audio e inténtalo otra vez.';
      els.start.hidden = false;
      els.start.textContent = 'Reintentar';
      els.repeat.hidden = true;
      return;
    }

    glyph.track(pb, 0);

    const reason = await pb.finished;
    if (scope.disposed || token !== playToken || reason !== 'ended') return;

    setState('awaiting');
    setOptionsDisabled(false);
    if (focusFirst) els.options.querySelector('.option')?.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------- ciclo de la sesión */

  function nextItem() {
    clearTimeout(advanceTimer);
    if (index >= SESSION_LENGTH) return showSummary();

    els.start.hidden = true;
    els.repeat.hidden = false;

    const p = store.getProgress();
    const pool = adaptive.activeSet(p.level);
    answer = adaptive.pickWeighted(pool, answer);       // adaptativo, invisible

    swapStage(() => {
      glyph.clear();
      glyph.setCode('');
      renderOptions(answer, pool, true);
      renderProgress();
    });

    els.fb.textContent = '';
    els.fb.dataset.tone = '';
    clearHint();

    playCurrent({ focusFirst: true });
  }

  function answerWith(value, btn) {
    if (state !== 'awaiting' || !answer) return;
    setState('feedback');
    playToken++;   // invalida cualquier reproducción en vuelo

    const correct = value === answer;
    lockOptionsKeepingFocus();
    for (const b of els.options.children) {
      if (b.dataset.value === answer) b.dataset.state = 'ok';
      else if (b === btn) b.dataset.state = 'no';
    }

    els.fb.textContent = correct ? '✓ Correcto' : `Era ${answer}`;
    els.fb.dataset.tone = correct ? 'ok' : 'no';
    els.state.textContent = `${answer} — ${fmt(MORSE[answer])}`;
    glyph.setCode(MORSE[answer]);
    if (!correct) showHint(answer);

    store.recordAnswer(answer, correct);
    results.push({ ch: answer, correct });
    index++;

    const p = store.getProgress();
    const nextWindow = adaptive.pushWindow(p.window, correct);
    let leveled = false;
    if (adaptive.shouldLevelUp(nextWindow, p.level)) {
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

  /* ------------------------------------------------------- presentación */

  async function runIntroStep() {
    const step = INTRO[introStep];
    const token = ++playToken;

    setState('intro');
    els.start.disabled = true;
    els.fb.textContent = '';
    els.fb.dataset.tone = '';
    glyph.setCode('');

    await audio.resume();
    if (scope.disposed || token !== playToken) return;

    const pb = player.playText(step.ch, store.getSettings());
    if (pb.state === 'blocked') {
      els.start.disabled = false;
      els.fb.textContent = 'Toca la pantalla para activar el audio e inténtalo otra vez.';
      return;
    }
    glyph.track(pb, 0);

    const reason = await pb.finished;
    if (scope.disposed || token !== playToken || reason !== 'ended') return;

    els.state.textContent = `${step.ch} — ${fmt(MORSE[step.ch])}`;
    els.fb.textContent = step.text;
    els.start.disabled = false;
    els.start.focus({ preventScroll: true });
  }

  function advanceIntro() {
    introStep++;
    if (introStep < INTRO.length) {
      els.start.textContent = 'Continuar';
      runIntroStep();
      return;
    }
    store.setPrefs({ introDone: true });
    els.start.textContent = 'Empezar';
    startSession();
  }

  /* -------------------------------------------------------------- resumen */

  function showSummary() {
    setState('summary');
    playToken++;
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
      <h2 class="sr-only" id="sumTitle">Resumen de la sesión</h2>
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

      <div class="summary__block">
        <p class="field__hint">Siguiente nivel</p>
        <p class="summary__goal">${levelGoalText(p.level, p.window)}</p>
      </div>

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

  function startSession() {
    results = [];
    index = 0;
    answer = null;
    nextItem();
  }

  function restart() {
    els.summary.hidden = true;
    room.hidden = false;
    renderMeta();
    renderProgress();
    startSession();
  }

  /* ------------------------------------------------------------- controles */

  scope.on(els.start, 'click', () => {
    if (state === 'intro') { advanceIntro(); return; }
    if (!store.getPrefs().introDone) {
      introStep = 0;
      els.start.textContent = 'Continuar';
      els.repeat.hidden = true;
      runIntroStep();
      return;
    }
    startSession();
  });

  scope.on(els.repeat, 'click', () => {
    if (state !== 'awaiting' && state !== 'playing') return;
    playCurrent();
  });

  /**
   * Teclado: números y letras para responder; espacio para repetir.
   *
   * El espacio sólo se intercepta si el foco NO está sobre un control: en HTML
   * la barra activa el botón enfocado, y antes este atajo se lo comía — con el
   * foco puesto automáticamente en la primera opción, era imposible responder
   * con el teclado sin usar los números.
   */
  scope.on(window, 'keydown', (e) => {
    if (isTyping(e.target)) return;
    // Space y Enter pertenecen al control enfocado; los demás atajos no compiten.
    if (isInteractive(e.target) && (e.code === 'Space' || e.key === 'Enter')) return;

    if (e.code === 'Space') {
      if (state !== 'awaiting' && state !== 'playing') return;
      e.preventDefault();
      playCurrent();
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
