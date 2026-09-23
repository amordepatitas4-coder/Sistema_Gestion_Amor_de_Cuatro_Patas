# Sistema de Gestión — Fundación Amor de Cuatro Patas

Frontend del MVP interno, reconstruido de forma limpia contra el backend Supabase v1.1
(rama `frontend-rebuild`). La reconstrucción avanza por etapas; ver
`docs/PROMPT_MAESTRO_FRONTEND.md` §36.

## 1. Configuración

Copiar `js/config.example.js` como `js/config.js` y completar solamente:

- `SUPABASE_URL`: URL pública del proyecto.
- `SUPABASE_ANON_KEY`: clave pública anon / publishable.

`js/config.js` está ignorado por Git y no debe versionarse. **Nunca** colocar en el
frontend `service_role`, claves secretas, secretos de Google ni refresh tokens:
si la clave configurada es `service_role` o secreta, la aplicación se niega a iniciar.

## 2. Ejecución local

Servir la carpeta `frontend/` con cualquier servidor estático (los módulos ES no
funcionan abriendo `index.html` con doble clic):

```
python -m http.server 5500 --bind 127.0.0.1
```

y abrir `http://127.0.0.1:5500`.

## 3. Tecnologías

HTML5, CSS3, JavaScript (módulos ES, sin compilación), Bootstrap 5.3.8,
Bootstrap Icons 1.13.1 y supabase-js 2.117.1, cargados desde jsDelivr con versión
fija (Bootstrap con verificación de integridad SRI).

## 4. Arquitectura

```
index.html            Documento base: #app, contenedores de toasts y modales.
css/styles.css        Identidad visual sobre Bootstrap (paleta, layout, estados).
js/app.js             Punto de entrada: coordina sesión, router y vistas.
js/routes.js          Menú principal y rutas. Punto de extensión de cada etapa.
js/supabase.js        Cliente Supabase (lee js/config.js; bloquea claves no públicas).
js/core/session.js    Supabase Auth + verificación de usuaria activa (public.usuario).
js/core/router.js     Router por hash (#/ruta/:param?filtro=valor).
js/core/forms.js      Envío seguro de formularios (captura antes de bloquear, sin doble envío).
js/core/errors.js     Traducción de errores de red, Auth, PostgREST y Edge Functions.
js/core/format.js     Fechas locales, CLP, RUT (12345678-9), microchip, textos.
js/core/ui.js         Plantillas con escape, estados vacío/carga/error, toasts, modales.
js/core/badges.js     Badges de estado consistentes (+ indicador visual "Disponible").
js/core/images.js     Optimización de la foto principal a WebP (máx. 1400 px, 2 MB).
js/core/domain.js     Constantes de dominio (estados con significado de proceso).
js/api/               Acceso a datos por dominio (catálogos, animales, salud, hogares,
                      dashboard y consultas de solo lectura de etapas posteriores).
js/views/             Vistas: login, shell, panel, animales (listado, ficha y pestañas),
                      hogares, provisional y pantallas.
```

Módulos implementados: Panel principal (Etapa 2), Animales con ficha integral
(Etapa 3) y Salud / Hogares temporales (Etapa 4). Las pestañas Adopción, Gastos y
Archivos de la ficha muestran el historial en modo consulta hasta sus etapas.

Reglas de acceso:

- Solo Supabase Auth autentica. No existe registro público: las cuentas se crean por
  invitación.
- Una sesión válida no basta: la usuaria debe estar activa en `public.usuario`
  (RLS oculta la fila a usuarias inactivas). Se revalida periódicamente.
- Ninguna ruta interna se muestra sin sesión activa.

Contrato de una vista (`js/views/*.js`):

```js
export default {
  title: 'Título',
  async render({ outlet, params, query, path, route, session, navigate }) {
    // ...
    return () => { /* limpieza opcional */ };
  },
};
```

Para habilitar un módulo, reemplazar su `load` en `js/routes.js` y agregar sus
subrutas (por ejemplo `/animales/:id/:tab?`).

## 5. Pruebas automáticas

Desde `frontend/`: `node --test "tests/*.test.mjs"` (Node 20+, sin dependencias ni
credenciales). Detalle en `tests/README.md`.

## 6. Logo

`BRAND.LOGO_SRC` en `js/views/brand.js` es el espacio reemplazable para el logo
oficial (PNG/SVG en `assets/`). Mientras sea `null` se muestra un distintivo con icono.
`assets/logo-referencia.png` es solo una captura de referencia y no se usa como logo.
