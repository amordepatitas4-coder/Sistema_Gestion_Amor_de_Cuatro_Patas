# Sistema de Gestión — Fundación Amor de Cuatro Patas

Frontend del MVP conectado al backend Supabase v1.1.

## 1. Configuración necesaria

Editar `js/config.js` y reemplazar solamente:

- `SUPABASE_URL`: URL pública del proyecto Supabase.
- `SUPABASE_ANON_KEY`: clave pública `anon` / publishable del proyecto.

Estas dos credenciales son las destinadas al cliente web. **No incorporar** aquí `service_role`, secretos de Google, refresh tokens ni claves privadas.

## 2. Cómo ejecutar

No abrir `index.html` directamente con doble clic. Levantar un servidor local desde la carpeta del frontend. Opciones:

### VS Code + Live Server
Abrir esta carpeta en VS Code, instalar/usar Live Server y elegir `Open with Live Server` sobre `index.html`.

### Python
`python -m http.server 5500`

Luego abrir `http://localhost:5500`.

## 3. Arquitectura

- `index.html`: estructura base SPA.
- `css/styles.css`: identidad visual y componentes responsive.
- `js/config.js`: configuración pública de Supabase.
- `js/supabase.js`: creación del cliente Supabase.
- `js/app.js`: navegación, vistas, formularios e integración.
- `assets/logo-referencia.png`: pantallazo de referencia. Sustituir por el logo oficial cuando esté disponible.

## 4. Principio de integración

Las reglas transaccionales existentes se ejecutan mediante RPC del backend (`registrar_animal`, `cambiar_estado_animal`, hogares, adopción, seguimiento, etc.). El frontend no replica esas reglas.

Las Edge Functions se usan para Google Drive, creación de carpetas e invitación de usuarios.

## 5. Seguridad

Nunca colocar en este proyecto:
- `SUPABASE_SERVICE_ROLE_KEY`
- Google Client Secret
- Google Refresh Token
- contraseñas reales

Esos secretos permanecen configurados del lado de Supabase/Edge Functions.

## 6. Pruebas pendientes con credenciales reales

La revisión entregada valida estructura y sintaxis local del frontend. Las pruebas de integración reales (Auth, RLS, RPC, Storage y Edge Functions) deben realizarse una vez configuradas la URL y clave pública del proyecto.

## 7. Logo

El archivo `assets/logo-referencia.png` es solo una referencia visual tomada del pantallazo. Cuando la Fundación entregue el original, reemplazarlo por un PNG/SVG oficial y actualizar el bloque de marca del layout.
