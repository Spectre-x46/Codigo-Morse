# Telégrafo — aprende código Morse

Esta mini app está pensada para practicar Morse de forma sencilla y funcional desde un teléfono o desde cualquier navegador, ya sea para aprenderlo desde cero o para recordarlo rápido.

Está hecha como un único archivo HTML, así que se puede abrir directamente o subir a un hosting estático como Netlify o GitHub Pages.

## Qué ofrece

- Transmisión en vivo de Morse con presión sostenida
- Visualización del código que se está escribiendo
- Cinta de texto recibida con la letra interpretada
- Sonido de emisión mediante la Web Audio API
- Ajuste de velocidad para practicar más lento o más rápido
- Sección para escribir una palabra y escucharla en Morse
- Abecedario interactivo con clic para escuchar cada letra
- Botones para borrar o limpiar la sesión

## Cómo usarla

1. Abre [morse.html](morse.html) en tu navegador.
2. Toca o haz clic en el botón central o en el círculo de la lámpara.
3. Mantén presionado para emitir un punto o una raya:
   - corto = punto
   - largo = raya
4. Suelta para cerrar la letra y que se procese.
5. Ajusta la velocidad si quieres practicar más despacio o más rápido.

## Controles rápidos

- Mantener presionado / barra espaciadora: emitir
- Retroceso: borrar el último carácter
- Limpiar: reiniciar la cinta
- Escribe una palabra y pulsa “sonar” para reproducirla
- Toca una letra del abecedario para escucharla

## Notas de uso

- Está pensada para uso móvil, con una interfaz simple y táctil.
- El audio depende del navegador y se activa al primer gesto del usuario.
- No requiere instalación ni dependencias externas.

## Estructura del proyecto

- [morse.html](morse.html): aplicación completa con HTML, CSS y JavaScript en un solo archivo.
