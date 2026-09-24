# Despliegue de prueba del frontend (`frontend-rebuild`)

Documento preparado en la Etapa 12 para la Etapa 13 (QA integral).
**Ninguna de estas acciones se ha ejecutado**: todas requieren que la
usuaria cree o vincule una cuenta externa y autorice cambios en Supabase.

## 1. Qué se despliega

- Sitio **estático** (`frontend/`): HTML + CSS + JS (módulos ES), Bootstrap,
  Bootstrap Icons y supabase-js desde CDN. Sin compilación.
- Rutas por hash (`#/animales/…`): no se necesitan reglas de reescritura.
- `js/config.js` **no está en Git**. En el servicio se genera durante el
  despliegue con `node tools/write-config.mjs` a partir de dos variables de
  entorno: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (clave pública anon /
  publishable). El script rechaza claves `service_role` / `sb_secret_`.
- `_headers`: sin caché obsoleta para HTML/JS/CSS, `noindex` y encabezados
  básicos de seguridad. `robots.txt` bloquea la indexación.
- El sitio desplegado usa el **Supabase y Google Drive reales** (los mismos
  de las pruebas QA). El acceso sigue protegido por Supabase Auth + RLS y el
  registro público está deshabilitado.

## 2. Alternativa recomendada: Cloudflare Pages conectado a GitHub (gratuito)

Motivos: plan gratuito sin límite de ancho de banda, compatible con
repositorios privados, variables de entorno cifradas, soporte de `_headers`,
HTTPS automático y redeploy en cada push a la rama elegida.

Pasos (los realiza la usuaria):

1. Crear una cuenta en Cloudflare (o usar una existente).
2. Workers & Pages → Create → Pages → **Connect to Git** → autorizar la
   aplicación de Cloudflare en GitHub **solo para este repositorio**.
3. Configuración del proyecto:
   | Campo | Valor |
   |---|---|
   | Production branch | `frontend-rebuild` (así `master` nunca se publica) |
   | Framework preset | None |
   | Root directory | `frontend` |
   | Build command | `node tools/write-config.mjs` |
   | Build output directory | `.` |
   | Variables (Production) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (tipo *Secret* recomendado) |
4. En Settings → Builds & deployments → **Preview deployments: None**
   (o solo `frontend-rebuild`), para que ninguna otra rama se publique.
5. Primer despliegue → URL del tipo `https://<nombre>.pages.dev`.

## 3. Cambios necesarios en Supabase (Dashboard, los realiza la usuaria)

Authentication → URL Configuration:

- **Redirect URLs**: agregar `https://<nombre>.pages.dev` (y `/**`).
- **Site URL**: es la dirección a la que llevan los correos de invitación y
  recuperación. Para probar invitaciones desde el sitio desplegado debe
  apuntar a esa URL. Decidir si se cambia durante la QA.

No se requieren cambios en Edge Functions (CORS ya permite cualquier origen),
RLS, Storage ni Google Drive.

## 3.1 Recuperación de contraseña ("¿Olvidaste tu contraseña?")

Usa el mecanismo nativo de Supabase Auth (`resetPasswordForEmail`). La
aplicación no guarda contraseñas ni tokens y no usa `service_role`.

Flujo: login → "¿Olvidaste tu contraseña?" → correo → Supabase envía un
enlace de un solo uso → el enlace vuelve a la URL del sitio con
`#access_token=…&type=recovery` → la aplicación abre **Configuración → Mi
cuenta** con el aviso "Recuperación de contraseña" → la usuaria define la
nueva contraseña (`supabase.auth.updateUser`).

Requisitos en Supabase (Authentication → URL Configuration), los realiza la
usuaria:

1. **Redirect URLs**: debe incluir exactamente la URL del sitio,
   `https://sistema-gestion-amor-de-cuatro-patas-frontend-v1.pages.dev/`
   (puede agregarse también con comodín `…pages.dev/**`). Si no está en la
   lista, Supabase usa la *Site URL* en su lugar.
2. **Site URL**: recomendable la misma URL del sitio (también es el destino
   por defecto de invitaciones).
3. Opcional: Authentication → Emails → *Reset Password* para traducir el
   correo al español. Debe conservar `{{ .ConfirmationURL }}`.
4. El envío de correos de Supabase sin SMTP propio tiene un límite bajo por
   hora; si se excede, la pantalla lo informa ("Demasiados intentos…").

Prueba real: solicitar el enlace para la cuenta de la Fundación, abrirlo
desde el correo en el mismo navegador donde se probará, definir la nueva
contraseña y cerrar sesión / volver a ingresar con ella.

## 4. Alternativa manual sin vincular GitHub: Netlify Drop (gratuito)

Arrastrar la carpeta `frontend/` (con el `config.js` local) a
`app.netlify.com/drop`. Es inmediata y no da acceso al repositorio, pero
cada actualización exige volver a subir la carpeta a mano y la cuenta
anónima expira; conviene solo para una demostración puntual.

## 5. Descartadas

- **GitHub Pages**: el repositorio es privado y Pages para repos privados
  requiere plan pagado.
- Servicios con servidor propio o contenedores: innecesarios para un sitio
  estático.

## 6. Verificación posterior (Etapa 13)

1. El sitio carga por HTTPS y muestra el login; sin sesión no se ve contenido.
2. Login con cuenta real; recorrido E2E (PA-E2E-01/02) con datos QA.
3. Subida/apertura de archivos en Drive desde el sitio desplegado.
4. Invitación QA (si se ajusta Site URL) y aceptación → Mi cuenta.
5. `js/config.js` contiene solo URL + clave pública; revisar que la clave no
   sea `service_role` (PA-SEGUR-01/03).
6. Encabezados `_headers` presentes; sin indexación.
