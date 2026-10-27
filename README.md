# My Financial Compass — sitio web

Sitio de una sola página, bilingüe (inglés / español), para **www.myfinancialcompass.org**.
HTML, CSS y JavaScript sin frameworks, más un formulario de contacto en PHP para Hostinger.

- Inglés: `index.html`
- Español: `es/index.html`
- El botón **EN | ES** cambia de idioma sin recargar; la elección se recuerda en el navegador.

---

## Estructura

| Ruta | Qué es | ¿Se publica? |
|---|---|---|
| `index.html`, `es/index.html` | Páginas finales (generadas) | Sí |
| `styles.min.css`, `main.min.js`, `i18n.js` | Estilos, comportamiento y textos de ambos idiomas (generados) | Sí |
| `assets/img/`, `assets/fonts/` | Imágenes y tipografías optimizadas | Sí |
| `contact.php` | Envío del formulario de contacto | Sí |
| `.htaccess`, `datos/.htaccess` | HTTPS, caché, compresión y bloqueo de carpetas privadas | Sí |
| `src/index.src.html` | **Fuente** de la página (textos en inglés) | No (bloqueado) |
| `i18n/es.json` | **Fuente** de los textos en español | No (bloqueado) |
| `styles.css`, `main.js`, `css/critical.css`, `partials/` | Fuentes de estilos, JavaScript y del compás | No (bloqueado) |
| `assets/source/` | Imágenes y tipografías originales | No (bloqueado) |
| `tools/` | Scripts para regenerar el sitio | No (bloqueado) |
| `docs/traduccion-es.md` | Todos los textos EN / ES lado a lado, para revisión | No (bloqueado) |

Las carpetas marcadas "bloqueado" pueden subirse al servidor sin riesgo: `.htaccess` impide que se vean desde internet.

---

## Cambiar textos

1. **Inglés:** editar `src/index.src.html` (cada texto lleva un atributo `data-i18n="clave"`).
2. **Español:** editar la misma clave en `i18n/es.json`.
3. Regenerar el sitio (requiere Python 3):

   ```
   python tools/build.py
   ```

   Esto vuelve a crear `index.html`, `es/index.html`, `i18n.js`, `styles.min.css`, `main.min.js` y `docs/traduccion-es.md`.
   Si falta alguna traducción al español, el script avisa y no genera nada.

4. Antes de publicar un cambio de estilos o de JavaScript, subir el número de versión para que los visitantes reciban la versión nueva:

   ```
   python tools/bump_version.py 20261026i 20261101a
   ```

   (el primer valor es el actual — aparece como `?v=` en `src/index.src.html` — y el segundo, el nuevo).

**Opcional — minificar JavaScript:** si Node.js y `terser` están instalados, definir las variables `MFC_NODE` (ruta a node) y `MFC_TERSER` (ruta a `terser/bin/terser`) antes de `build.py`. Sin ellas, `main.min.js` es una copia sin minificar y todo funciona igual.

**Imágenes y tipografías** (solo si se cambian los originales de `assets/source/`):

```
pip install pillow numpy fonttools brotli
python tools/build_images.py
python tools/subset_fonts.py
```

**Vista previa local:** `python tools/serve.py 5520` y abrir http://localhost:5520 (el formulario necesita PHP; en local no envía correos).

---

## Publicar en Hostinger

**Opción A — desde GitHub (recomendada):** en hPanel → *Sitios web* → *Git*, conectar este repositorio y desplegarlo en `public_html`. Cada `git push` puede volver a desplegarse desde ahí.

**Opción B — manual:** subir todo el contenido del repositorio a `public_html` con el Administrador de archivos o por FTP. Comprobar que se subieron los archivos ocultos `.htaccess` y `datos/.htaccess`.

Después de publicar:

- **Correo del formulario:** los mensajes llegan a `info@myfinancialcompass.org` (se cambia en `$TO`, al inicio de `contact.php`). Para que no caigan en spam, activar **SPF y DKIM** del dominio en hPanel → *Correos*.
- **Copia de seguridad de los mensajes:** cada envío se guarda en `mfc_contact.jsonl`, fuera de `public_html` (o en `datos/`, protegida). Conviene revisarla y vaciarla de vez en cuando, porque contiene datos personales.
- **Protección anti-spam:** campo trampa invisible, tiempo mínimo de llenado, mismo origen y límite de 3 envíos por minuto y 20 por día por IP. No hay CAPTCHA. Si llegara spam, el siguiente paso sería Cloudflare Turnstile (gratuito, sin cookies de rastreo).

---

## Privacidad y cookies

El sitio **no usa cookies** ni herramientas de terceros (las tipografías están en el propio servidor y Calendly es un enlace).
Solo guarda en el navegador el idioma elegido y si ya se vio la animación de entrada.
Por eso no necesita aviso de cookies. **Si se agrega Google Analytics, un píxel de Meta o algo similar**, hay que añadir un aviso de consentimiento y actualizar la política de privacidad.

El año del copyright del pie se actualiza solo cada 1 de enero.

---

## Pendiente de confirmar con el cliente

1. **Nota de "traducción de cortesía"** al inicio de los términos en español (clave `terms.note`): redactada, falta aprobación.
2. **Email en los términos:** el texto legal dice `info@myfinancialcompass.com` (.com); el resto del sitio usa `.org`. Se dejó tal cual.
3. **Servicios:** se quitaron el filtro y las etiquetas por categoría; el seminario de $750 va destacado ("Featured program") y el resto en una lista desplegable con su descripción.
4. **Servicio "Small Business"**: nombre y descripción nuevos, no estaban en el sitio anterior:
   *"Your business and your personal finances are connected. We'll help small business owners build healthy money habits, manage cash flow, and protect what they've built for themselves and their families."*
5. **Formulario:** sin la pregunta "I am a human!"; campos nuevos opcionales **Phone** y **Service of interest**; línea de privacidad bajo el botón.
6. **Casilla "Sign up for news and updates":** hoy solo queda anotada en el correo. Falta decidir a qué lista o herramienta (Mailchimp u otra) van esas personas.
7. **Career Planning:** se respetó el texto original, incluidas expresiones como "specialize on" y "confident to heading". Se puede pulir si el cliente quiere.

Las traducciones completas, clave por clave, están en `docs/traduccion-es.md`.
