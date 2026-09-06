/**
 * Acerca de — por qué existe esto.
 *
 * La historia personal es lo que separa este proyecto de cualquier otro
 * traductor de Morse. Va aquí, completa pero breve: no es una autobiografía.
 */

import * as player from '../core/player.js';
import * as store from '../core/store.js';
import * as audio from '../core/audio.js';
import * as frameLoop from '../ui/frame-loop.js';
import { MORSE, fmt } from '../data/morse.js';

const CALLSIGN = 'CE3WMJ';

export function mount(root, scope) {
  root.innerHTML = `
  <section class="shell shell--narrow section" aria-labelledby="aboutTitle">
    <div class="stack">

      <div>
        <p class="section-label">Acerca de</p>
        <h1 class="title" id="aboutTitle">Por qué existe<br>Código Morse Online.</h1>
      </div>

      <figure class="about__figure" id="aboutFigure">
        <svg viewBox="0 0 260 120" width="260" height="120" fill="none" aria-hidden="true"
             class="about__key">
          <rect x="40" y="86" width="180" height="14" rx="3" fill="#ececec" stroke="#d6d6d6"/>
          <rect x="150" y="74" width="20" height="16" rx="2" fill="#e2e2e2" stroke="#cfcfcf"/>
          <circle cx="92" cy="58" r="18" fill="#e6e6e6" stroke="#cccccc"/>
          <rect x="92" y="64" width="86" height="7" rx="3.5" fill="#c9c9c9" transform="rotate(-7 92 64)"/>
          <rect x="166" y="40" width="9" height="34" rx="3" fill="#dcdcdc" stroke="#cbcbcb"/>
          <!-- Contacto y halo: los dos ÚNICOS elementos ámbar del dibujo, y sólo
               mientras hay señal. En reposo son grises como el resto del
               mecanismo — el ámbar significa "está sonando ahora". -->
          <circle class="about__contact" cx="92" cy="58" r="8"/>
          <circle class="about__halo" cx="92" cy="58" r="26" stroke-dasharray="2 5"/>
        </svg>
      </figure>

      <div class="stack stack--sm">
        <p class="about__lead">
          Me llamo Felipe y construí Código Morse Online para recordar el código
          que aprendí de niño.
        </p>
        <p class="lede about__p">
          Me lo enseñó mi padre, <strong class="about__call">CE3WMJ</strong>,
          radioaficionado. Armó su propio pulsador para enseñarme: una llave hecha
          a mano sobre la mesa de la casa. Aprendí escuchando, no memorizando una
          tabla.
        </p>
        <p class="lede about__p">
          Años después quise volver a esa mesa, y pensé que alguien más debería
          poder sentarse a ella — sin necesitar un equipo, una licencia ni un
          manual. Sólo un navegador y unos minutos.
        </p>
      </div>

      <div class="card">
        <p class="section-label about__cardlabel">Su indicativo</p>
        <p class="field__hint about__cardhint">
          El distintivo de radioaficionado de mi padre, transmitido en Morse.
        </p>

        <!-- Una cadena de seis letras no cabe en un MorseGlyph, que representa
             UN carácter: antes se le pasaba la locución entera y sólo mostraba
             la C. Aquí cada letra tiene su celda y se ilumina la que suena. -->
        <ol class="callsign" id="callsign" aria-hidden="true">
          ${[...CALLSIGN].map((ch, i) => `
            <li class="callsign__item" data-i="${i}">
              <span class="callsign__ch">${ch}</span>
              <span class="callsign__code">${fmt(MORSE[ch])}</span>
            </li>`).join('')}
        </ol>

        <div class="about__actions">
          <button class="btn" type="button" id="sigPlay">Escuchar ${CALLSIGN}</button>
        </div>
      </div>

      <div class="stack stack--sm">
        <h2 class="title about__h2">Cómo está hecho</h2>
        <p class="lede about__p">
          HTML, CSS y JavaScript. Sin framework, sin bundler y sin una sola
          dependencia de ejecución. El sonido se genera en el navegador con la
          Web Audio API, siguiendo el estándar PARIS y el espaciado Farnsworth,
          y el progreso se guarda en tu propio dispositivo.
        </p>
        <p class="lede about__p">
          No usa framework porque no lo necesita: son cuatro pantallas y un
          motor de audio. Añadir uno habría hecho el proyecto más pesado, más
          lento de cargar y más difícil de leer, sin resolver ningún problema
          que tuviera.
        </p>
      </div>

      <div class="about__actions">
        <a class="btn btn--primary btn--lg" href="#/aprender">Empezar a aprender</a>
        <a class="btn btn--ghost btn--lg" href="#/libre">Abrir la llave</a>
      </div>

    </div>
  </section>
  `;

  const figure = root.querySelector('#aboutFigure');
  const items = [...root.querySelectorAll('.callsign__item')];
  const playBtn = root.querySelector('#sigPlay');

  /**
   * Un solo suscriptor al bucle de frames para las dos cosas que reaccionan:
   * el contacto de la llave dibujada y la letra activa del indicativo. Ambos
   * leen el MISMO muestreo que produce el sonido, así que no pueden derivar.
   */
  let lastOn = null;
  let lastLetter = -1;
  let trackedId = null;

  scope.add(frameLoop.subscribe((state) => {
    const on = state.on && state.source === 'play';
    if (on !== lastOn) {
      figure.dataset.on = String(on);
      lastOn = on;
    }

    if (trackedId === null || state.playbackId !== trackedId) return;
    // Se usa `letterIndex` tal cual, sin filtrar por `on`: entre los elementos
    // de una misma letra hay un hueco de una unidad, y apagar ahí convertía el
    // resaltado en un parpadeo. `signal` sostiene la última letra empezada
    // durante los huecos, que es justo lo que hay que mostrar.
    const letter = state.letterIndex;
    if (letter === lastLetter) return;         // única condición que escribe DOM
    items[lastLetter]?.removeAttribute('data-on');
    items[letter]?.setAttribute('data-on', 'true');
    lastLetter = letter;
  }));

  function clearTrack() {
    trackedId = null;
    items[lastLetter]?.removeAttribute('data-on');
    lastLetter = -1;
  }

  scope.on(playBtn, 'click', async () => {
    await audio.resume();
    if (scope.disposed) return;   // se cambió de ruta durante el await
    const pb = player.playText(CALLSIGN, store.getSettings());
    if (pb.state === 'blocked') { clearTrack(); return; }
    trackedId = pb.id;
    pb.finished.then(() => { if (!scope.disposed && trackedId === pb.id) clearTrack(); });
  });

  scope.add(clearTrack);
}
