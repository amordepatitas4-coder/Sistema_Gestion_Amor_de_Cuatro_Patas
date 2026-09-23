# Pruebas automáticas del frontend

Pruebas unitarias de la lógica pura del frontend, ejecutadas con el test runner
integrado de Node.js. **No requieren dependencias, red, credenciales ni `js/config.js`:**
la sesión se prueba con un cliente Supabase simulado (`helpers/mock-supabase.mjs`).

## Requisitos

- Node.js 20 o superior (probado con Node 24).

## Ejecución

Desde la carpeta `frontend/`:

```
node --test "tests/*.test.mjs"
```

(o simplemente `node --test`, que descubre automáticamente los archivos `*.test.mjs`).

Un archivo en particular:

```
node --test tests/session.test.mjs
```

## Contenido

| Archivo | Qué prueba |
|---|---|
| `format.test.mjs` | RUT (`12345678-9`, K mayúscula, dígito verificador), fechas locales sin desfase UTC, microchip, montos CLP |
| `errors.test.mjs` | Traducción de errores de red, Auth, PostgREST (UNIQUE/CHECK/P0001) y Edge Functions |
| `router.test.mjs` | Parseo de rutas y filtros, respuestas de Auth en la URL, menú y rutas de la ficha |
| `session.test.mjs` | Login, usuaria inactiva, doble envío, restauración, logout, expiración y revalidación |
| `animals-logic.test.mjs` | Filtros del listado, formulario de animal, estados permitidos, hogares, salud y foto |
| `adoptions-logic.test.mjs` | Adoptantes (RUT normalizado y duplicado), adopción, seguimiento (`medio_contacto`) y devolución |
| `expenses-logic.test.mjs` | Gastos: montos, total/asignado/no asignado, igualdad con el total, exceso y filas |
| `files-logic.test.mjs` | Archivos (validación, 10 MB) y difusión (solo datos autorizados, prompt base) |
| `sterilization-logic.test.mjs` | Proyectos, nómina (código/microchip por proyecto), profesionales N:M derivados, PDF obligatorio (tipo y firma), Adjuntar/Abrir sin reemplazo y exportación CSV |

## Alcance

Estas pruebas cubren lógica pura (sin DOM ni Supabase). Las integraciones reales
(Auth, PostgREST/RPC, Storage, Edge Functions, Google Drive) se verifican manualmente o
desde el navegador según `docs/PLAN_PRUEBAS_ACEPTACION.md`, con registros QA
identificados. Los scripts SQL de verificación del backend están en
`supabase/security/`.

Para agregar pruebas: crear `tests/<modulo>.test.mjs` importando el módulo con ruta
relativa (`../js/...`). Mantener la lógica testeable en módulos sin dependencias del
navegador (por ejemplo `js/views/<modulo>/logic.js`).
