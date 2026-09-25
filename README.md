# Sistema Fundación Amor de Cuatro Patas

Sistema web de gestión de rescate y adopción animal, desarrollado para la **Fundación Amor de Cuatro Patas** como proyecto de Arquitectura de Software en modalidad Aprendizaje + Servicio.

**Sistema desplegado:** <https://sistema-gestion-amor-de-cuatro-patas-frontend-v1.pages.dev/> (acceso solo para usuarias autorizadas de la Fundación).

## El proyecto en pocas palabras

La Fundación registraba la información de sus animales en teléfonos, correos, formularios físicos y redes sociales. Este sistema la reúne en un solo lugar: cada animal tiene una ficha con su estado, salud, hogares temporales, adopción, gastos, archivos e historial completo, y nada se borra, para conservar la trazabilidad de cada caso. Además, gestiona de forma independiente los proyectos de esterilización masiva en los que participa la Fundación.

## Funcionalidades

| Módulo | Qué permite |
|---|---|
| Panel principal | Indicadores que llevan a los animales filtrados, próximos controles y hogares ocupados. |
| Animales | Ficha integral: resumen, salud, hogares, adopción, gastos, archivos, historial y difusión. |
| Hogares temporales | Hogares, animales alojados y cambios de hogar con su historial. |
| Adopciones | Adoptantes, adopciones, seguimientos y devoluciones. |
| Gastos | Gastos generales o asignados a uno o varios animales. |
| Proyectos de esterilización | Nómina de animales, profesionales participantes y documentación. |
| Documentos | Buscador de todos los archivos guardados en Google Drive. |
| Informes | Seis informes con filtros, exportación a Excel (CSV) e impresión. |
| Configuración | Cuenta, usuarias (por invitación) y catálogos. |

## Arquitectura y tecnologías

Arquitectura **Cliente-Servidor** organizada en **tres capas** (presentación, lógica de negocio y acceso a datos).

```
Navegador  ── aplicación web: HTML, CSS (Bootstrap) y JavaScript
   │ HTTPS
Supabase   ── autenticación · base de datos PostgreSQL · almacenamiento · funciones del servidor
   │ OAuth 2.0
Google Drive ── documentos de la Fundación
```

- **Frontend:** HTML5, CSS3, JavaScript (módulos ES), Bootstrap 5.3 y supabase-js. Sin framework ni compilación.
- **Backend:** Supabase (PostgreSQL, Auth, Storage y Edge Functions en Deno/TypeScript).
- **Despliegue:** Cloudflare Pages.
- **Pruebas:** `node:test` y scripts SQL de verificación.

Las reglas de negocio que modifican varias tablas se ejecutan como funciones transaccionales en la base de datos (RPC), y las operaciones que requieren credenciales se ejecutan en el servidor, por lo que el navegador nunca maneja secretos.

## Estructura del repositorio

```
docs/        Documentación del proyecto (Ficha Maestra, pruebas y despliegue)
frontend/    Aplicación web y sus pruebas automáticas
supabase/    Base de datos, seguridad y funciones del servidor
```

## Cómo guiarse

| Conocer… | Revisar |
|---|---|
| El proyecto completo (problema, requerimientos, arquitectura, modelo de datos, seguridad, módulos y pruebas) | `docs/Ficha_Maestra_Sistema_Fundacion_Amor_de_Cuatro_Patas` (versión `.md` para leer aquí y versión `.docx`) |
| El código de la aplicación web | `frontend/README.md`; se recomienda comenzar por `frontend/js/app.js` y luego un módulo completo, como `frontend/js/views/animals/` |
| La base de datos y la seguridad | `supabase/README.md` y `supabase/schema.sql` |
| La integración con Google Drive | `supabase/functions/` |
| Cómo se probó el sistema | `docs/PRUEBAS_Y_VALIDACION.md` |
| Cómo instalarlo y publicarlo | `docs/DESPLIEGUE.md` |

## Seguridad

- Acceso con Supabase Auth; las cuentas se crean solo por invitación y deben estar activas.
- Row Level Security en todas las tablas y privilegios mínimos por tabla y columna.
- Sin eliminación de registros históricos.
- Credenciales y claves de servicio solo en el servidor; archivos privados en Storage y en Drive.

## Estado

MVP implementado, desplegado y validado. Quedan pendientes los últimos requerimientos solicitados por la Fundación: estado de esterilización de los animales, actualización de la identidad visual e importación de la ficha del adoptante (sección 23 de la Ficha Maestra).
