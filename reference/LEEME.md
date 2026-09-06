# reference/

Material visual de referencia. **Todo lo que hay en esta carpeta se publica.**

El sitio se despliega subiendo el directorio del proyecto a Netlify, así que
`.gitignore` no filtra nada: cualquier archivo que esté aquí queda accesible
públicamente en `https://codigo-morse-online.netlify.app/reference/...`.

Por eso las fotografías originales sin comprimir (~8 MB, 2752x1536) **no viven
aquí**. Están fuera del directorio que se sube:

    ~/Projectos/Telegrafo-originales/source/

Los derivados que sí usa el sitio están en `assets/images/` (WebP, ~30 KB cada
uno). `tech-forward-morse.png` se queda aquí a propósito: es la captura del
README y pesa 1,2 MB, pero ninguna página del sitio la carga.

Antes de subir la carpeta, comprueba que no has dejado nada privado dentro:

    du -sh --exclude=.git *
