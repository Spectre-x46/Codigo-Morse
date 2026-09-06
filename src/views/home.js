/**
 * Home.
 *
 * Ritmo: hero blanco → bloque cinemático oscuro → demo interactiva → cierre
 * editorial → footer. El hero está aprobado y no se toca; lo que se añade es
 * el recorrido posterior.
 *
 * El dinamismo nace de eventos —scroll, audio, respuesta— no de adornos que se
 * mueven solos.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as frameLoop from '../ui/frame-loop.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { Waveform } from '../ui/waveform.js';
import { SignalLine } from '../ui/signal-line.js';
import { observeReveals, trackProgress } from '../ui/reveal.js';
import { MORSE } from '../data/morse.js';

const DEMO_POOL = ['E', 'T', 'A', 'N', 'I', 'M'];

const STEPS = [
  { n: '01', t: 'Escucha', d: 'Suena una señal.' },
  { n: '02', t: 'Reconoce', d: 'Identifica su ritmo.' },
  { n: '03', t: 'Responde', d: 'Y sigue avanzando.' }
];

export function mount(root, scope) {
  root.innerHTML = `
  <section class="hero">
    <button class="hero__key anim-key" id="heroKey" type="button"
            aria-label="Pulsar la llave para oír un punto">
      <img src="assets/telegraph.webp"
           srcset="assets/telegraph-560.webp 560w, assets/telegraph.webp 866w"
           sizes="(max-width: 767px) 118vw, 58vw"
           width="866" height="634" alt="" fetchpriority="high" decoding="async">
      <span class="hero__contact" aria-hidden="true"></span>
    </button>

    <div class="hero__body">
      <div class="hero__text">
        <p class="eyebrow anim-rise" style="--d:520ms">Aprende de oído · práctica real</p>
        <h1 class="display anim-rise" style="--d:640ms">Aprende Morse,<br>sin fricción.</h1>
        <p class="lede anim-rise" style="--d:760ms">
          Escucha, responde y avanza. Una experiencia simple para entrenar
          tu oído y practicar código Morse.
        </p>
        <div class="hero__cta anim-rise" style="--d:880ms">
          <a class="btn btn--primary btn--lg" href="#/aprender">
            Empezar <span class="btn__arrow" aria-hidden="true">→</span>
          </a>
          <a class="btn btn--ghost btn--lg" href="#/libre">Ver modo libre</a>
        </div>
      </div>

      <div class="hero__tags anim-rise" style="--d:1000ms" aria-hidden="true">
        <span class="pill pill--outline">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M2.6 9.4V8a5.4 5.4 0 0 1 10.8 0v1.4"/>
            <rect x="1.4" y="9.2" width="2.8" height="4.2" rx="1.2"/>
            <rect x="11.8" y="9.2" width="2.8" height="4.2" rx="1.2"/>
          </svg>Audio</span>
        <span class="pill pill--outline">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M2 12h12M5 12V8.4l4.6-2.2L14 8"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/>
          </svg>Telegrafía</span>
        <span class="pill pill--outline">
          <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 8h1.6M6 4.4v7.2M9.4 6.2v3.6M13 8h1"/>
          </svg>Señales</span>
      </div>
    </div>
  </section>

  <div class="sigline-band" id="bandTop" aria-hidden="true"></div>

  <!-- ============================================ bloque cinemático oscuro -->
  <section class="cine" id="cine" data-nav="dark" aria-labelledby="cineTitle">
    <div class="cine__sticky">
      <picture class="cine__media">
        <source media="(max-width: 767px)"
                srcset="assets/images/telegraph-macro-mobile-900.webp">
        <source media="(min-width: 768px)"
                srcset="assets/images/telegraph-macro-desktop-1280.webp 1280w,
                        assets/images/telegraph-macro-desktop-1920.webp 1920w"
                sizes="100vw">
        <img src="assets/images/telegraph-macro-desktop-1280.webp"
             width="1920" height="1072" loading="lazy" decoding="async"
             alt="Detalle macro del mecanismo de contacto de una llave telegráfica.">
      </picture>

      <div class="cine__shade" aria-hidden="true"></div>

      <div class="cine__content">
        <h2 class="sr-only" id="cineTitle">Cómo funciona</h2>
        <ol class="cine__steps">
          ${STEPS.map((s, i) => `
            <li class="cine__step" data-step="${i}" ${i === 0 ? 'data-on="true"' : ''}>
              <span class="cine__n">${s.n}</span>
              <span class="cine__t">${s.t}</span>
              <span class="cine__d">${s.d}</span>
            </li>`).join('')}
        </ol>
        <div class="cine__rule" aria-hidden="true"><i id="cineBar"></i></div>
      </div>
    </div>
  </section>

  <!-- ================================================ demo, sin tarjeta -->
  <section class="demo" aria-labelledby="demoTitle" data-reveal>
    <p class="section-label">Pruébalo aquí</p>
    <h2 class="title demo__q" id="demoTitle">¿Puedes reconocerla?</h2>

    <div class="demo__stage" id="demoStage" data-state="idle">
      <div class="wave" id="demoWave"></div>
      <div class="glyph glyph--xl" id="demoGlyph"></div>
    </div>

    <p class="feedback" id="demoFb" role="status" aria-live="polite">
      Pulsa reproducir y elige la letra que oigas.
    </p>

    <div class="options options--wide" id="demoOptions"></div>

    <div class="demo__actions">
      <button class="btn btn--primary" type="button" id="demoPlay">Reproducir señal</button>
      <a class="btn btn--ghost" href="#/aprender">Sesión completa</a>
    </div>
    <p class="field__hint">Es una demostración: no guarda progreso.</p>
  </section>

  <div class="sigline-band" id="bandBottom" aria-hidden="true"></div>

  <!-- ================================================== cierre editorial -->
  <section class="story" aria-labelledby="storyTitle" data-reveal>
    <div class="story__text">
      <p class="section-label">El origen</p>
      <h2 class="title" id="storyTitle">Una tecnología de casi dos siglos.<br>
        <span class="story__soft">Una forma simple de aprenderla hoy.</span></h2>
      <p class="lede">
        El código Morse nació para cruzar continentes por un cable. Sigue siendo
        la forma más eficiente de transmitir con muy poca energía y mucho ruido
        de fondo — y se aprende con el oído, no con una tabla.
      </p>
      <a class="btn btn--ghost btn--lg" href="#/acerca">
        Conoce la historia <span class="btn__arrow" aria-hidden="true">→</span>
      </a>
    </div>

    <picture class="story__media">
      <source media="(max-width: 767px)"
              srcset="assets/images/telegraph-story-mobile-900.webp">
      <source media="(min-width: 768px)"
              srcset="assets/images/telegraph-story-desktop-900.webp 900w,
                      assets/images/telegraph-story-desktop-1400.webp 1400w"
              sizes="(min-width: 1200px) 55vw, 50vw">
      <img src="assets/images/telegraph-story-desktop-900.webp"
           width="1400" height="781" loading="lazy" decoding="async"
           alt="Llave telegráfica completa sobre una superficie clara.">
    </picture>
  </section>
  `;

  /* --------------------------------------------------------- hero: la llave */

  const heroKey = root.querySelector('#heroKey');
  let heroOn = null;

  scope.add(frameLoop.subscribe((state) => {
    if (state.on !== heroOn) {
      heroKey.dataset.on = String(state.on);
      heroOn = state.on;
    }
    if (state.on) heroKey.dataset.kind = state.kind ?? 'dit';
  }));

  scope.on(heroKey, 'click', async () => {
    await audio.resume();
    if (scope.disposed) return;   // se cambió de ruta durante el await
    player.playText('E', store.getSettings());   // un punto real, con el motor real
  });

  /* ------------------------------------------------ líneas de señal (motivo) */

  scope.add(SignalLine(root.querySelector('#bandTop'), 'MORSE'));
  scope.add(SignalLine(root.querySelector('#bandBottom'), 'SOS'));

  /* ------------------------------------------------------ bloque cinemático */

  const steps = [...root.querySelectorAll('.cine__step')];
  const bar = root.querySelector('#cineBar');
  let activeStep = 0;

  scope.add(trackProgress(root.querySelector('#cine'), (p) => {
    // Tres tramos iguales. El paso activo cambia por umbral, no por frame,
    // así que sólo se escribe en el DOM cuando de verdad cambia.
    const next = Math.min(Math.floor(p * STEPS.length), STEPS.length - 1);
    if (next !== activeStep) {
      steps[activeStep]?.removeAttribute('data-on');
      steps[next]?.setAttribute('data-on', 'true');
      activeStep = next;
    }
    bar.style.transform = `scaleX(${(0.06 + p * 0.94).toFixed(4)})`;
  }));

  /* ------------------------------------------------------------- micro-demo */

  const optionsBox = root.querySelector('#demoOptions');
  const feedback = root.querySelector('#demoFb');
  const playBtn = root.querySelector('#demoPlay');
  const stage = root.querySelector('#demoStage');
  const glyph = scope.add(MorseGlyph(root.querySelector('#demoGlyph'), { size: 'xl' }));
  scope.add(Waveform(root.querySelector('#demoWave'), { bars: 24 }));

  let answer = null;
  let locked = true;

  function setStage(s) { stage.dataset.state = s; }

  function renderOptions(correct, disabled) {
    const others = DEMO_POOL.filter((c) => c !== correct);
    const picks = [correct, others[Math.floor(Math.random() * others.length)]];
    picks.sort(() => Math.random() - 0.5);

    optionsBox.replaceChildren();
    for (const ch of picks) {
      const b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = ch;
      b.dataset.state = '';
      b.disabled = disabled;
      b.addEventListener('click', () => respond(b, ch));
      optionsBox.appendChild(b);
    }
  }

  function respond(btn, value) {
    if (locked || !answer) return;
    locked = true;
    const correct = value === answer;
    for (const b of optionsBox.children) {
      b.disabled = true;
      if (b.textContent === answer) b.dataset.state = 'ok';
      else if (b === btn) b.dataset.state = 'no';
    }
    feedback.textContent = correct ? '✓ Correcto' : `Era ${answer}`;
    feedback.dataset.tone = correct ? 'ok' : 'no';
    glyph.setCode(MORSE[answer]);
    setStage('feedback');
    playBtn.textContent = 'Otra señal';
  }

  async function play() {
    await audio.resume();
    if (scope.disposed) return;
    answer = DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)];

    // Durante la reproducción las opciones están visibles pero quietas: no se
    // puede responder a algo que todavía está sonando.
    locked = true;
    renderOptions(answer, true);
    feedback.textContent = 'Escuchando…';
    feedback.dataset.tone = '';
    setStage('playing');

    const pb = player.playText(answer, store.getSettings());
    if (pb.state === 'blocked') {
      feedback.textContent = 'Toca de nuevo para activar el audio.';
      setStage('idle');
      return;
    }
    glyph.track(pb, 0);
    playBtn.textContent = 'Repetir';

    pb.finished.then((reason) => {
      if (scope.disposed || reason !== 'ended') return;
      locked = false;
      setStage('awaiting');
      feedback.textContent = '¿Qué letra fue?';
      for (const b of optionsBox.children) b.disabled = false;
    });
  }

  scope.on(playBtn, 'click', play);
  renderOptions('E', true);

  /* ------------------------------------------------------------- revelados */

  scope.add(observeReveals(root));
}
