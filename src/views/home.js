/**
 * Home. El hero resuelve casi toda la experiencia inicial; lo que viene
 * después es deliberadamente poco: cómo funciona, una demo que se puede tocar,
 * y la puerta a la historia.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as frameLoop from '../ui/frame-loop.js';
import { MorseGlyph } from '../ui/morse-glyph.js';
import { MORSE, fmt } from '../data/morse.js';

const DEMO_POOL = ['E', 'T', 'A', 'N', 'I', 'M'];

export function mount(root, scope) {
  root.innerHTML = `
  <section class="hero">
    <button class="hero__key anim-key" id="heroKey" type="button"
            aria-label="Pulsar la llave para oír un punto">
      <img src="assets/telegraph.webp"
           srcset="assets/telegraph-560.webp 560w, assets/telegraph.webp 866w"
           sizes="(max-width: 767px) 118vw, 60vw"
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

  <section class="shell section" aria-labelledby="howTitle">
    <div class="stack">
      <div class="stack--sm" style="display:flex;flex-direction:column;gap:12px">
        <p class="section-label">Cómo funciona</p>
        <h2 class="title" id="howTitle">Tres pasos, sin configurar nada.</h2>
      </div>
      <ol class="stats" style="counter-reset:step">
        <li class="stat"><div class="stat__n">01</div><div class="stat__l">Suena una letra en Morse.</div></li>
        <li class="stat"><div class="stat__n">02</div><div class="stat__l">Eliges cuál era.</div></li>
        <li class="stat"><div class="stat__n">03</div><div class="stat__l">Sabes al instante si acertaste y sigue la siguiente.</div></li>
      </ol>
    </div>
  </section>

  <section class="shell section" aria-labelledby="demoTitle">
    <div class="card stack" style="align-items:center;text-align:center">
      <p class="section-label">Pruébalo aquí</p>
      <h2 class="title" id="demoTitle" style="font-size:clamp(1.5rem,4vw,2rem)">¿Qué letra fue?</h2>
      <div class="wave" id="demoWave"></div>
      <div class="glyph glyph--lg" id="demoGlyph"></div>
      <p class="feedback" id="demoFb">Pulsa reproducir y elige la letra que oigas.</p>
      <div class="options" id="demoOptions" style="width:min(340px,100%)"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn--primary" type="button" id="demoPlay">Reproducir señal</button>
        <a class="btn btn--ghost" href="#/aprender">Sesión completa</a>
      </div>
      <p class="field__hint">Es una demostración: no guarda progreso.</p>
    </div>
  </section>
  `;

  /* --------------------------------------------------------- hero: la llave */

  const heroKey = root.querySelector('#heroKey');
  let heroTracked = false;

  scope.add(frameLoop.subscribe((state) => {
    const on = state.on;
    if (on !== heroTracked) {
      heroKey.dataset.on = String(on);
      heroTracked = on;
    }
    if (on) heroKey.dataset.kind = state.kind ?? 'dit';
  }));

  scope.on(heroKey, 'click', async () => {
    await audio.resume();
    player.playText('E', store.getSettings());   // un punto real, con el motor real
  });

  /* ------------------------------------------------------------- micro-demo */

  const optionsBox = root.querySelector('#demoOptions');
  const feedback = root.querySelector('#demoFb');
  const playBtn = root.querySelector('#demoPlay');
  const glyph = scope.add(MorseGlyph(root.querySelector('#demoGlyph'), { size: 'lg' }));

  // La waveform del hero y la de la demo comparten el mismo estado de señal.
  import('../ui/waveform.js').then(({ Waveform }) => {
    if (scope.disposed) return;
    scope.add(Waveform(root.querySelector('#demoWave'), { bars: 22 }));
  });

  let answer = null;
  let locked = false;

  function renderOptions(correct) {
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
    feedback.textContent = correct
      ? `Correcto. ${answer} es ${fmt(MORSE[answer])}`
      : `Era ${answer} — ${fmt(MORSE[answer])}`;
    feedback.dataset.tone = correct ? 'ok' : 'no';
    playBtn.textContent = 'Otra señal';
  }

  async function play() {
    await audio.resume();
    locked = false;
    feedback.textContent = 'Escuchando…';
    feedback.dataset.tone = '';
    answer = DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)];
    renderOptions(answer);
    const pb = player.playText(answer, store.getSettings());
    if (pb.state === 'blocked') {
      feedback.textContent = 'Toca de nuevo para activar el audio.';
      return;
    }
    glyph.track(pb, 0);
    playBtn.textContent = 'Repetir';
  }

  scope.on(playBtn, 'click', play);

  /* La llave NO tiene ciclo de reposo a propósito.
     El desenfoque de movimiento ya está en la propia fotografía, así que un
     latido periódico no añadía información y sí distraía. Lo que sí responde
     es el gesto real: hover y, al pulsar, un punto de verdad con el motor de
     audio. */
}
