# Código Morse Online

Aprende Morse de oído en el navegador. Escuchas una señal, eliges la letra y avanzas.

**[codigo-morse-online.netlify.app](https://codigo-morse-online.netlify.app/)**

![Código Morse Online](reference/tech-forward-morse.png)

---

## El problema

Casi todas las webs de Morse te reciben con una tabla de 40 símbolos y un panel de
ajustes. Antes de oír tu primera letra tienes que decidir velocidad, tono, espaciado
y modo de práctica — sin tener aún ni idea de qué significa ninguna de esas cosas.

Este proyecto empezó igual: ocho secciones compitiendo por la atención. La versión
actual tiene **dos caminos visibles** y ninguna decisión previa.

| | |
|---|---|
| **Aprender** | Pulsas *Empezar* y ya estás en una sesión. Diez preguntas, feedback inmediato, resumen. Cero configuración. |
| **Modo libre** | La llave telegráfica, un traductor y el abecedario, para quien quiera trastear. |

Los ajustes existen, pero detrás de un panel. Un principiante no debería tener que
saber qué es el espaciado Farnsworth para empezar.

---

## Lo interesante por dentro

### El audio manda sobre lo visual

El Morse no es decorativo: si el timing falla, el producto no sirve. Todo se apoya
en el estándar **PARIS** (una unidad = 1200/PPM ms) y en el **espaciado Farnsworth**,
donde cada carácter se emite rápido (≥18 PPM) pero los huecos entre letras se estiran
para mantener la velocidad global. Así aprendes el ritmo real de cada letra desde el
principio, con tiempo para procesarla.

Una locución completa se agenda sobre **un único oscilador**: la envolvente entera se
escribe de golpe sobre su nodo de ganancia. Una frase de 80 elementos son ~320 puntos
de automatización en un nodo, en vez de 160 nodos con su coste de recolección de
basura. El hilo de audio recibe las instrucciones una sola vez y no se le vuelve a
molestar.

### La sincronía imagen–sonido no puede derivar

Cuando suena un punto, el símbolo correspondiente se ilumina en ámbar exactamente
durante ese punto. No hay ningún temporizador visual: un solo `requestAnimationFrame`
consulta el reloj del `AudioContext` y pregunta *"¿qué elemento suena ahora?"*. Como
no acumula, no deriva nunca, y si la pestaña estuvo oculta diez segundos el siguiente
muestreo emite de golpe todo lo que se cruzó.

Un detalle que se suele pasar por alto: se usa `currentTime - outputLatency`, no
`currentTime`. Lo que se *oye* en un instante se renderizó unos milisegundos antes, y
sin compensarlo la imagen va sistemáticamente por delante del sonido — hasta 60 ms
con auriculares Bluetooth.

Ese mismo reloj clasifica punto y raya en la llave manual. Antes el umbral audible
usaba el reloj de audio y el medidor visual usaba `performance.now()`: dos relojes
para el mismo evento, que se separaban bajo carga.

### El bucle de animación duerme

Un solo `requestAnimationFrame` para toda la aplicación, con recuento de referencias
y auto-apagado: tras medio segundo sin nada que sonar se detiene solo. **En reposo la
página consume cero frames.**

### Frontera estricta

`src/core/` no toca el DOM. `src/ui/` no calcula timing Morse. Es verificable de un
vistazo:

```bash
grep -rE "document\.|window\.|requestAnimationFrame" src/core/ src/data/   # sin resultados
```

---

## Stack

HTML, CSS y JavaScript. **Sin framework, sin bundler y sin una sola dependencia de
ejecución.** Módulos ES nativos, cargados bajo demanda por ruta.

- **Web Audio API** — generación de tonos y agendado
- **Pointer Events** — la llave, con ratón, táctil y teclado
- **localStorage** — progreso y ajustes, en tu dispositivo
- **Web Animations / CSS** — el movimiento

No usa framework porque no lo necesita: son cuatro pantallas y un motor de audio.
Añadir uno lo habría hecho más pesado, más lento de cargar y más difícil de leer,
sin resolver ningún problema que tuviera.

## Arquitectura

```
index.html          shell, navegación, sin lógica
styles.css          tokens y sistema visual
src/
  data/             morse · levels · tips          tablas, sin comportamiento
  core/             timing · audio · player        ← CERO DOM
                    keyer · signal · store · srs
  ui/               router · frame-loop · scope    infraestructura
                    morse-glyph · waveform · sheet · toast
  views/            home · aprender · libre · acerca
  app.js            cableado
tests/              node --test, sin instalar nada
```

`core/signal.js` es la **única** frontera entre el núcleo y la interfaz. Mezcla las
dos fuentes de señal —la llave en vivo, impredecible, y la reproducción agendada,
determinista— y publica un solo objeto de estado. Los componentes leen los mismos
cuatro campos y no ramifican según de dónde venga el sonido.

Cada vista se monta con un *scope* que registra listeners y suscripciones; el router
lo destruye antes de montar la siguiente. Navegar cien veces no deja nada colgando.

## Decisiones de UX

- **Cero configuración antes de empezar.** Valores por defecto razonables; los ajustes
  viven en un panel para quien los busque.
- **La repetición adaptativa es invisible.** El sistema insiste en las letras que
  fallas sin que tengas que activar nada. Antes era una pestaña llamada *Recuperar*
  que casi nadie abría.
- **Un solo color.** La interfaz es blanca y negra; el ámbar significa *hay señal
  ahora mismo*. Si algo está ámbar, está sonando.
- **Sin gamificación pesada.** Se retiraron XP, rangos y logros. El progreso real es
  la recompensa.
- **El movimiento reducido respeta la información.** Con `prefers-reduced-motion` se
  apagan las entradas y los adornos, pero el símbolo iluminado se queda: dice qué
  está sonando, no es decoración.

## Accesibilidad

Navegación completa por teclado (números para responder, espacio para transmitir),
`:focus-visible` en todo, `Escape` cierra menú y panel con el foco devuelto al
disparador, contraste AA verificado (4.81:1 en el texto tenue), objetivos táctiles
≥40 px, zoom no bloqueado y selección de texto libre.

## Ejecutar en local

No hay nada que instalar, pero los módulos ES necesitan servirse por HTTP:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Pruebas:

```bash
node --test "tests/**/*.test.js"
```

## Desplegar

Estático puro. En Netlify: publish directory `.`, sin comando de build. Las rutas van
en el hash, así que no hace falta ninguna regla de reescritura.

## Compatibilidad

Navegadores con módulos ES y Web Audio: Chrome/Edge 91+, Firefox 90+, Safari 15+.
En iOS el audio sólo arranca tras un gesto del usuario, y el contexto se reanuda en
cada interacción porque el sistema lo suspende al volver de segundo plano.

---

Hecho por **CE3WMJ**. La historia de por qué existe está en la propia app, en
[Acerca de](https://codigo-morse-online.netlify.app/#/acerca).
