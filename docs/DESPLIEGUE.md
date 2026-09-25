# Despliegue

El sistema tiene tres partes que se despliegan por separado:

| Componente | Plataforma | Contenido |
|---|---|---|
| Frontend | Cloudflare Pages | Sitio estático de la carpeta `frontend/`. |
| Backend | Supabase | Base de datos PostgreSQL, Auth, Storage y Edge Functions. |
| Archivos | Google Drive | Carpetas y documentos de la Fundación, accedidos mediante OAuth 2.0. |

Ningún secreto se guarda en el repositorio. El frontend solo necesita la URL pública del proyecto Supabase y su clave pública (anon o publishable); las credenciales de servicio y de Google existen únicamente como secretos de Supabase.

## 1. Backend (Supabase)

### 1.1 Base de datos

En una instalación nueva, ejecutar en el editor SQL de Supabase, en este orden:

1. `supabase/schema.sql`: tablas, restricciones, índices, funciones RPC, políticas RLS y permisos. Refleja el estado final, incluidos los refuerzos de seguridad.
2. `supabase/seed.sql`: catálogos iniciales.
3. `supabase/infrastructure.sql`: trigger que crea el perfil de cada usuaria en `public.usuario` al crearse su cuenta en Auth, y el bucket privado `fotos-animales` con sus políticas.

Los scripts de `supabase/security/` documentan los refuerzos aplicados sobre el proyecto existente (01, 03, 05, 07 y 09) y su verificación (02, 04, 06, 08 y 10). En una instalación nueva no es necesario aplicarlos, porque `schema.sql` ya los incluye; los scripts de verificación pueden ejecutarse para comprobar la instalación.

### 1.2 Autenticación

En Authentication:

- deshabilitar el registro público (las cuentas se crean por invitación);
- en URL Configuration, definir como **Site URL** la dirección del sitio publicado y agregarla en **Redirect URLs**, para que los enlaces de invitación y de recuperación de contraseña vuelvan al sistema;
- opcionalmente, traducir al español las plantillas de correo de invitación y recuperación, conservando la variable del enlace de confirmación.

### 1.3 Edge Functions

Las cinco funciones de `supabase/functions/` se despliegan con la verificación de JWT habilitada. Requieren los siguientes secretos, configurados en el panel de Supabase (nunca en el repositorio):

| Secreto | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Provistos por Supabase. La clave de servicio solo se usa dentro de las funciones. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Credenciales OAuth 2.0 de la cuenta de Google de la Fundación. |
| `GOOGLE_DRIVE_ANIMALES_FOLDER_ID`, `GOOGLE_DRIVE_PROYECTOS_FOLDER_ID`, `GOOGLE_DRIVE_FUNDACION_FOLDER_ID` | Identificadores de las carpetas raíz en Drive. |

## 2. Google Drive

Se crea en la cuenta de la Fundación la carpeta raíz del sistema con sus tres subcarpetas (Animales, Proyectos de Esterilización y Documentación Fundación). Se registra un cliente OAuth 2.0 en Google Cloud con acceso a la API de Drive y se obtiene un refresh token para esa cuenta.

Los archivos no se comparten como "cualquiera con el enlace": se abren con la cuenta de la Fundación o con cuentas de Google a las que ella conceda acceso. Antes de un uso productivo prolongado debe revisarse la configuración OAuth, ya que las aplicaciones en modo de prueba tienen restricciones de vigencia de tokens.

## 3. Frontend (Cloudflare Pages)

El proyecto de Cloudflare Pages está conectado al repositorio de GitHub. Configuración:

| Campo | Valor |
|---|---|
| Framework preset | Ninguno |
| Directorio raíz | `frontend` |
| Comando de build | `node tools/write-config.mjs` |
| Directorio de salida | `.` |
| Variables de entorno | `SUPABASE_URL` y `SUPABASE_ANON_KEY` (clave pública) |

Durante el build, `tools/write-config.mjs` genera `js/config.js` a partir de las variables de entorno. El script rechaza claves de servicio (`service_role` o `sb_secret_`) y valores con caracteres no válidos, y no muestra la URL ni la clave en los registros.

El archivo `frontend/_headers` define:

- encabezados de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`);
- `X-Robots-Tag: noindex`, porque se trata de un sistema interno (complementado con `robots.txt`);
- revalidación obligatoria de HTML, JavaScript y CSS, para que las usuarias reciban siempre la última versión publicada.

Cada publicación en la rama configurada como producción genera un nuevo despliegue.

## 4. Ejecución local

1. Copiar `frontend/js/config.example.js` como `frontend/js/config.js` y completar la URL y la clave pública del proyecto (este archivo está ignorado por Git).
2. Servir la carpeta `frontend/` con un servidor estático (los módulos ES no funcionan abriendo el archivo directamente):

   ```
   cd frontend
   python -m http.server 5500 --bind 127.0.0.1
   ```

3. Abrir `http://127.0.0.1:5500`.

Si la clave configurada es de servicio o falta la configuración, la aplicación no se inicia y muestra un aviso.
