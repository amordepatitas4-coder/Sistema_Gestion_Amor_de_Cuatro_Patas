# Sistema Web de Gestión de Rescate y Adopción Animal

**Fundación Amor de Cuatro Patas** · Proyecto de Arquitectura de Software en modalidad Aprendizaje + Servicio

Sistema web interno que centraliza la información de los animales rescatados por la Fundación y de sus proyectos de esterilización masiva, conservando la trazabilidad de cada caso desde el rescate hasta la adopción y el seguimiento posterior.

**Sistema desplegado:** <https://sistema-gestion-amor-de-cuatro-patas-frontend-v1.pages.dev/> (acceso solo para usuarias autorizadas de la Fundación).

## Contexto y propósito

La Fundación registraba su información en teléfonos, correos, formularios físicos y redes sociales, lo que dificultaba consultar la situación de cada animal, conservar su historia, controlar gastos y preparar informes. El sistema reúne esa información en un solo lugar, aplica las reglas de sus procesos y protege los datos personales de adoptantes y hogares temporales.

## Funcionalidades principales

- **Panel principal** con indicadores que llevan a los animales filtrados.
- **Animales:** ficha integral con fotografía, estado e historial, salud, hogares temporales, adopción, gastos, archivos y difusión.
- **Hogares temporales, adopciones, seguimientos y devoluciones**, conservando toda la historia.
- **Gastos** generales o asignados total o parcialmente a uno o varios animales.
- **Proyectos de esterilización:** nómina de animales, profesionales participantes y documentación.
- **Documentos** almacenados en Google Drive, con un buscador transversal.
- **Informes** configurables con exportación a Excel (CSV) e impresión.
- **Difusión:** texto base y prompt editable para herramientas externas, sin integración con IA.
- **Configuración:** cuenta, usuarias por invitación y catálogos.

## Arquitectura

Arquitectura **Cliente-Servidor** organizada en **tres capas**:

```
Navegador ── SPA (HTML, CSS, JavaScript) ── presentación y lógica de interfaz
    │  HTTPS + JWT
Supabase ── Auth · API de datos · PostgreSQL (RLS + RPC) · Storage · Edge Functions
    │  OAuth 2.0
Google Drive ── carpetas y documentos de la Fundación
```

Las reglas de negocio que involucran varias tablas se implementan como funciones transaccionales en PostgreSQL (RPC), y las operaciones que requieren credenciales se ejecutan en Edge Functions, de modo que el navegador nunca maneja secretos.

## Tecnologías

| Capa | Tecnologías |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (módulos ES), Bootstrap 5.3, Bootstrap Icons, supabase-js |
| Backend | Supabase: PostgreSQL, Auth, API de datos, Storage y Edge Functions (Deno/TypeScript) |
| Archivos | Google Drive API con OAuth 2.0 |
| Despliegue | Cloudflare Pages |
| Pruebas | `node:test` y scripts SQL de verificación |

## Estructura del repositorio

```
docs/        Documentación académica y técnica
frontend/    Aplicación web (sitio estático) y sus pruebas
supabase/    Esquema de base de datos, seguridad, Edge Functions
```

## Seguridad

- Autenticación con Supabase Auth; cuentas solo por invitación y verificación de que la usuaria esté activa.
- Row Level Security en todas las tablas; el rol anónimo no accede a datos.
- Privilegios mínimos: el navegador solo escribe las tablas y columnas necesarias; los procesos se ejecutan mediante RPC.
- Sin eliminación física de registros históricos.
- Secretos únicamente en el servidor; el frontend solo usa la clave pública.
- Archivos privados: bucket de Storage con URLs firmadas y documentos de Drive sin enlaces públicos.

## Cómo recorrer el proyecto

1. **`docs/FICHA_MAESTRA_v8.md`** (también en `.docx`): documento principal con problema, requerimientos, reglas de negocio, arquitectura, modelo de datos, seguridad, módulos, pruebas y limitaciones.
2. **`supabase/README.md`** y **`supabase/schema.sql`**: modelo de datos, RPC y políticas de seguridad.
3. **`frontend/README.md`**: organización del código del cliente. Un buen punto de partida es `frontend/js/app.js`, luego `js/core/session.js` y un módulo completo como `js/views/animals/`.
4. **`supabase/functions/`**: integración con Google Drive e invitación de usuarias.
5. **`docs/PRUEBAS_Y_VALIDACION.md`**: estrategia de pruebas y resultados.
6. **`docs/DESPLIEGUE.md`**: instalación y publicación del sistema.

## Ejecutar localmente

```
cd frontend
cp js/config.example.js js/config.js   # completar URL y clave pública de Supabase
python -m http.server 5500 --bind 127.0.0.1
```

Pruebas automáticas (Node.js 20 o superior):

```
cd frontend
node --test "tests/*.test.mjs"
```

## Estado del proyecto

MVP implementado, desplegado y validado. Quedan registrados como trabajo pendiente los últimos requerimientos solicitados por la Fundación (estado de esterilización de los animales, actualización de la identidad visual e importación de la ficha del adoptante). Ver la sección 23 de la Ficha Maestra.
