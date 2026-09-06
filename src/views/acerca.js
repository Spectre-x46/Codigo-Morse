/**
 * Acerca de — por qué existe esto.
 *
 * La historia personal es lo que separa este proyecto de cualquier otro
 * traductor de Morse. Va aquí, completa pero breve: no es una autobiografía.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import { MorseGlyph } from '../ui/morse-glyph.js';

export function mount(root, scope) {
  root.innerHTML = `
  <section class="shell shell--narrow section" aria-labelledby="aboutTitle">
    <div class="stack">

      <div>
        <p class="section-label">Acerca de</p>
        <h1 class="title" id="aboutTitle">Por qué existe<br>Código Morse Online.</h1>
      </div>

      <figure style="display:flex;justify-content:center;padding:8px 0 4px">
        <svg viewBox="0 0 260 120" width="260" height="120" fill="none" aria-hidden="true">
          <rect x="40" y="86" width="180" height="14" rx="3" fill="#ececec" stroke="#d6d6d6"/>
          <rect x="150" y="74" width="20" height="16" rx="2" fill="#e2e2e2" stroke="#cfcfcf"/>
          <circle cx="92" cy="58" r="18" fill="#e6e6e6" stroke="#cccccc"/>
          <circle cx="92" cy="58" r="8" fill="#ffb020"/>
          <rect x="92" y="64" width="86" height="7" rx="3.5" fill="#c9c9c9" transform="rotate(-7 92 64)"/>
          <rect x="166" y="40" width="9" height="34" rx="3" fill="#dcdcdc" stroke="#cbcbcb"/>
          <circle cx="92" cy="58" r="26" stroke="#ffb020" stroke-opacity=".35" stroke-dasharray="2 5"/>
        </svg>
      </figure>

      <div class="stack--sm" style="display:flex;flex-direction:column;gap:18px">
        <p style="font-size:clamp(1.05rem,3vw,1.28rem);line-height:1.6;letter-spacing:-.012em">
          Me llamo Felipe y construí Código Morse Online para recordar el código
          que aprendí de niño.
        </p>
        <p class="lede" style="max-width:58ch">
          Me lo enseñó mi padre, <strong style="color:var(--text);font-weight:500">CE3WMJ</strong>,
          radioaficionado. Armó su propio pulsador para enseñarme: una llave hecha
          a mano sobre la mesa de la casa. Aprendí escuchando, no memorizando una
          tabla.
        </p>
        <p class="lede" style="max-width:58ch">
          Años después quise volver a esa mesa, y pensé que alguien más debería
          poder sentarse a ella — sin necesitar un equipo, una licencia ni un
          manual. Sólo un navegador y unos minutos.
        </p>
      </div>

      <div class="card">
        <p class="section-label" style="margin-bottom:6px">Su indicativo</p>
        <p class="field__hint" style="margin-bottom:14px">
          El distintivo de radioaficionado de mi padre, transmitido en Morse.
        </p>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="glyph glyph--lg" id="sigGlyph"></div>
          <button class="btn" type="button" id="sigPlay">Escuchar CE3WMJ</button>
        </div>
      </div>

      <div class="stack--sm" style="display:flex;flex-direction:column;gap:14px">
        <h2 class="title" style="font-size:clamp(1.4rem,4vw,1.9rem)">Cómo está hecho</h2>
        <p class="lede" style="max-width:60ch">
          HTML, CSS y JavaScript. Sin framework, sin bundler y sin una sola
          dependencia de ejecución. El sonido se genera en el navegador con la
          Web Audio API, siguiendo el estándar PARIS y el espaciado Farnsworth,
          y el progreso se guarda en tu propio dispositivo.
        </p>
        <p class="lede" style="max-width:60ch">
          No usa framework porque no lo necesita: son cuatro pantallas y un
          motor de audio. Añadir uno habría hecho el proyecto más pesado, más
          lento de cargar y más difícil de leer, sin resolver ningún problema
          que tuviera.
        </p>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--primary btn--lg" href="#/aprender">Empezar a aprender</a>
        <a class="btn btn--ghost btn--lg" href="#/libre">Abrir la llave</a>
      </div>

    </div>
  </section>
  `;

  const glyph = scope.add(MorseGlyph(root.querySelector('#sigGlyph'), { size: 'lg' }));
  glyph.setCode('-.-.'); // se sobreescribe al reproducir

  scope.on(root.querySelector('#sigPlay'), 'click', async () => {
    await audio.resume();
    const pb = player.playText('CE3WMJ', store.getSettings());
    if (pb.state !== 'blocked') glyph.track(pb, 0);
  });
}
