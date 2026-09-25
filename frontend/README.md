# Frontend — Sistema de Gestión Amor de Cuatro Patas

Aplicación web de una sola página (SPA) escrita en HTML, CSS y JavaScript con módulos ES, sin framework ni proceso de compilación. Se comunica con Supabase mediante supabase-js y se publica como sitio estático.

## Tecnologías

HTML5, CSS3, JavaScript (módulos ES), Bootstrap 5.3.8, Bootstrap Icons 1.13.1 y supabase-js 2.117.1, cargados desde jsDelivr con versión fija (Bootstrap con verificación de integridad SRI).

## Organización del código

```
index.html            Documento base: contenedor #app, toasts y modales
css/styles.css        Identidad visual sobre Bootstrap, responsive e impresión
js/app.js             Punto de entrada: coordina sesión, router y vistas
js/routes.js          Menú principal y rutas de la aplicación
js/supabase.js        Cliente Supabase; lee js/config.js y rechaza claves de servicio
js/core/              Servicios transversales
  session.js          Supabase Auth + verificación de usuaria activa + recuperación
  router.js           Router por hash (#/ruta/:param?filtro=valor)
  forms.js            Envío seguro de formularios (sin doble envío)
  errors.js           Traducción de errores a mensajes comprensibles
  format.js           Fechas locales, pesos chilenos, RUT, microchip
  ui.js               Plantillas con escape, estados de pantalla, toasts, modales
  images.js           Optimización de la foto principal a WebP
  export.js           Exportación CSV compatible con Excel
  badges.js, domain.js
js/api/               Acceso a datos por dominio (una función por consulta, RPC o Edge Function)
js/views/             Pantallas por módulo; la lógica pura de cada una está en logic.js
tests/                Pruebas automáticas (node:test)
tools/write-config.mjs  Genera js/config.js durante el despliegue
_headers, robots.txt  Encabezados de seguridad y exclusión de buscadores
```

La separación sigue la arquitectura de tres capas del sistema: las vistas forman la capa de presentación, los módulos `logic.js` contienen validaciones y cálculos, y `js/api/` concentra el acceso a datos. Las reglas que modifican varias tablas no se implementan aquí: se invocan como RPC en PostgreSQL o como Edge Functions.

## Conceptos principales

- **Acceso.** Ninguna ruta interna se muestra sin una sesión activa. Además de autenticarse, la usuaria debe tener su perfil activo en `public.usuario`; esta condición se revalida periódicamente.
- **Rutas.** `#/animales/12/salud`, `#/adopciones/5`, `#/esterilizacion/3/nomina`, etc. Los filtros viajan en la URL, por lo que pueden compartirse y se conservan con el botón Atrás.
- **Contrato de una vista.**

  ```js
  export default {
    title: 'Título de la pestaña',
    async render({ outlet, params, query, path, route, session, navigate }) {
      // dibuja la pantalla dentro de outlet
      return () => { /* limpieza opcional al salir */ };
    },
  };
  ```

- **Formularios.** `bindForm` captura los datos y archivos, valida y recién entonces bloquea el botón de envío. Nunca deshabilita los campos antes de leerlos.
- **Operaciones de varios pasos.** Cuando el registro principal ya existe, un fallo secundario (carpeta en Drive, foto, asignación) se informa como pendiente y los reintentos no generan duplicados.
- **Seguridad en la interfaz.** Todo dato interpolado en HTML se escapa automáticamente; los mensajes de error no exponen detalles técnicos.

## Configuración

Copiar `js/config.example.js` como `js/config.js` y completar:

- `SUPABASE_URL`: URL del proyecto;
- `SUPABASE_ANON_KEY`: clave pública (anon o publishable).

`js/config.js` está ignorado por Git. Nunca debe contener la clave de servicio ni credenciales de Google; si detecta una clave de servicio, la aplicación no se inicia.

## Ejecución local

```
python -m http.server 5500 --bind 127.0.0.1
```

desde esta carpeta, y abrir `http://127.0.0.1:5500`.

## Pruebas

```
node --test "tests/*.test.mjs"
```

Requiere Node.js 20 o superior. Detalle en `tests/README.md`.

## Logo

`BRAND.LOGO_SRC` en `js/views/brand.js` es el espacio reservado para el logo oficial de la Fundación (archivo PNG o SVG en `assets/`). Mientras sea `null`, se muestra un distintivo con icono. La incorporación del logo oficial forma parte de la actualización de identidad visual pendiente.
