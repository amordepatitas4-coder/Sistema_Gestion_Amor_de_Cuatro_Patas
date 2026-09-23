# Estado actual del proyecto — handoff técnico

Documento de continuidad entre sesiones de Claude Code. Leer junto con `CLAUDE.md`.
No reemplaza a la Ficha Maestra v7, `PROMPT_MAESTRO_FRONTEND.md` ni
`PLAN_PRUEBAS_ACEPTACION.md`, que siguen siendo la referencia funcional.

## 1. Punto de situación

| Dato | Valor |
|---|---|
| Fecha | 23-09-2026 |
| Rama de trabajo | `frontend-rebuild` (publicada en `origin`) |
| Último commit funcional | `ec6c5e0` — `test: pruebas de adopciones, gastos, archivos y difusión` |
| Commit de este documento | el siguiente a `ec6c5e0` (`docs: registrar estado actual para continuidad del proyecto`) |
| `master` | `eca1862` — versión estable previa a la reconstrucción. **No modificar ni mezclar hasta autorización expresa.** |

Historial de la reconstrucción (sobre `master`):

```
1a10685 security: restringir EXECUTE de funciones public y deshabilitar registro público
5d85d0b feat: estructura base, router y autenticación (Etapa 1)
82b06bc feat: animales, ficha integral, salud y hogares temporales (Etapas 3 y 4)
d58d4c6 feat: panel principal con KPI navegables (Etapa 2)
2ce4575 test: incorporar pruebas automáticas del frontend al repositorio
c239168 fix(backend): reforzar reglas de proceso en cambiar_estado_animal e ingresar_hogar_temporal
2aac2fe feat: adopciones, gastos, archivos en Drive y difusión (Etapas 5, 6 y 7)
ec6c5e0 test: pruebas de adopciones, gastos, archivos y difusión
```

## 2. Etapas terminadas (aprobadas por la usuaria)

| Etapa | Contenido |
|---|---|
| 0 | Análisis inicial |
| 0.5 | Auditoría y corrección de privilegios de funciones (seguridad) |
| 1 | Shell, router, login, sesión, usuaria activa, logout, helpers base |
| 2 | Panel principal: 5 KPI navegables + próximos controles + hogares ocupados |
| 3 | Animales: listado/tarjetas, filtros, registro, foto WebP, ficha con 8 pestañas |
| 4 | Salud (atenciones) y Hogares temporales (ingresar/cambiar/finalizar) |
| 5 | Adopciones, adoptantes, seguimientos y devolución |
| 6 | Gastos con asignaciones a animales (total / asignado / no asignado) |
| 7 | Archivos en Google Drive (animal, adopción, gasto) y Difusión (texto + prompt) |

Pendientes de módulo: Etapa 8 (esterilización), 9 (Documentos transversal),
10 (Informes), 11 (Configuración/usuarios/catálogos), 12 (revisión visual y
accesibilidad), 13 (pruebas integrales).

## 3. Qué funciona hoy (resumen)

- Login con Supabase Auth; solo usuarias activas en `public.usuario` acceden; revalidación periódica.
- Dashboard con KPI que abren Animales con el filtro visible en la URL.
- Ciclo completo del animal: registro → salud → hogar temporal → adopción → seguimiento → devolución, con historial de estados trazable.
- Gastos generales, parciales, exactos y compartidos; resultados parciales informados sin duplicar.
- Subida y apertura de archivos en Drive por contexto; difusión sin IA.
- Módulos Esterilización, Documentos, Informes y Configuración: vista provisional.

## 4. Arquitectura del frontend

SPA sin compilación: HTML + CSS + JavaScript (módulos ES), Bootstrap 5.3.8,
Bootstrap Icons 1.13.1 y supabase-js 2.117.1 desde jsDelivr (versiones fijas).

```
frontend/
  index.html, css/styles.css
  js/app.js              orquesta sesión + router + vistas
  js/routes.js           menú (9 módulos) y rutas; punto de extensión por etapa
  js/supabase.js         cliente; lee js/config.js (ignorado por Git); bloquea service_role
  js/core/               session, router (hash), forms (envío seguro), errors,
                         format (fechas locales, CLP, RUT), ui, badges, images, domain
  js/api/                acceso a datos por dominio: catalogs, animals, health, homes,
                         dashboard, adoptions, expenses, files
  js/views/              login, shell, panel, placeholder, screens,
                         animals/ (list, detail, form, state, logic, tabs/),
                         homes/, adoptions/, expenses/, files/ (section, logic)
  tests/                 pruebas node:test (ver §6)
```

Convenciones clave:
- Rutas hash: `#/animales/:id/:tab`, `#/adopciones/:id`, `#/adopciones/adoptantes`, `#/gastos/:id`; filtros en la query.
- Contrato de vista: `export default { title, async render(ctx) }` (ver `frontend/README.md`).
- Lógica pura en `logic.js` de cada módulo (testeable en Node); acceso a datos solo en `js/api/`.
- Formularios con `bindForm` (`js/core/forms.js`): captura FormData/archivos antes de bloquear; solo se bloquea el botón.
- Catálogos con metadatos explícitos (`js/api/catalogs.js`); nunca deducir nombres de PK.

## 5. Backend (Supabase) y correcciones realizadas

Backend v1.1 (`supabase/schema.sql`, `infrastructure.sql`, Edge Functions) es la fuente de verdad.
Cambios aplicados en el proyecto real con autorización y versionados en `supabase/security/`:

| Script | Efecto | Verificación |
|---|---|---|
| `2026-09-23_01_restringir_privilegios_funciones.sql` | Sin EXECUTE para `anon`/PUBLIC en funciones de `public`; `_cambiar_estado_animal` solo interna; `es_usuario_activo` solo `authenticated`; defaults de funciones futuras sin `anon`/PUBLIC | Script `02`: todo `ok = true` + prueba desde cliente anon |
| `2026-09-23_03_reforzar_procesos_estado_hogar.sql` | `cambiar_estado_animal` rechaza cambio manual con hogar temporal o adopción activa; `ingresar_hogar_temporal` rechaza animal con adopción activa | Script `04`: 10/10 `ok = true` + prueba real |

- Registro público de usuarios **deshabilitado** en el Dashboard de Supabase (solo invitación). `supabase/config.toml` local alineado.
- `schema.sql` refleja privilegios y funciones actuales.
- Claude no tiene credencial administrativa: los scripts SQL los ejecuta la usuaria en SQL Editor.

## 6. Pruebas automáticas

```
cd frontend
node --test "tests/*.test.mjs"
```

Node 20+ (probado con 24), sin dependencias ni credenciales. 54 pruebas
(formato, errores, router, sesión con cliente simulado, lógica de animales,
adopciones, gastos, archivos y difusión). Detalle en `frontend/tests/README.md`.

Las integraciones reales se prueban desde el navegador con registros QA y los
IDs de `PLAN_PRUEBAS_ACEPTACION.md`.

## 7. Integraciones reales disponibles

- **Supabase Auth / PostgREST / RPC**: configuración pública en `frontend/js/config.js` (local, ignorado por Git). La usuaria autorizó leer solo URL y clave anon/publishable para pruebas; nunca imprimirlas ni versionarlas.
- **Storage**: bucket privado `fotos-animales`, ruta `animales/{id}/principal.webp`, URLs firmadas.
- **Edge Functions**: `crear-carpeta-animal`, `crear-carpeta-proyecto`, `subir-archivo-drive` (multipart), `obtener-link-archivo` (enlace en `data.archivo.url`), `invitar-usuario`.
- **Google Drive**: archivos privados; se abren en el visor de Drive con la cuenta autorizada. Nunca "cualquiera con el enlace".
- Para probar con sesión, la usuaria inicia sesión en el navegador (Claude no ingresa contraseñas). Servidor local: `python -m http.server 5500` desde `frontend/` (conviene desactivar caché del navegador).

## 8. Datos QA existentes (conservar por ahora)

No limpiar ni modificar sin autorización; se usarán en las siguientes etapas.

| Tipo | Registros QA |
|---|---|
| Animales | id 6 "Luna Prueba QA" (microchip QA `000000000000101`, adoptada: adopción 4 Devuelto + adopción 6 Activa); id 7 "Sol Prueba QA" (adoptada: adopción 5) |
| Hogares | id 5 "Hogar Prueba QA", id 6 "Hogar Prueba QA 2" |
| Adoptante | id 3 "Adoptante Prueba QA" (RUT ficticio de prueba) |
| Gastos | ids 4–8 ("Gasto general/exacto/parcial/compartido/fallo parcial Prueba QA") |
| Storage | fotos de Luna y Sol |
| Drive | carpetas "6 - Luna Prueba QA" y "7 - Sol Prueba QA"; 3 PDF QA (documento sanitario, contrato de adopción, comprobante de gasto) |

Datos preexistentes que **tampoco** deben tocarse (limpieza controlada posterior):
5 animales "Nanue" (ids 1–5, probables duplicados de la v2) y el hogar/adopción asociados a ellos.

## 9. Pendientes y limitaciones conocidas

- PA-AUT-05 real (desactivar una cuenta QA) pendiente.
- Invitación: falta pantalla para definir contraseña al aceptar invitación (Etapa 11); probar trigger con una invitación QA real.
- `public.usuario` no tiene política UPDATE: el nombre de la usuaria no es editable desde el frontend.
- Gastos: no existe RPC transaccional gasto + asignaciones (se informa resultado parcial); las asignaciones no se eliminan (sin DELETE).
- Esterilización (Etapa 8): la Edge Function no valida PDF ni unicidad de ficha; decisión: `Adjuntar PDF` / `Abrir PDF`, **sin** `Reemplazar` en el MVP.
- Pruebas manuales pendientes de la usuaria: "Abrir en Drive" con clic real y "Copiar texto/prompt" en su navegador.
- Privilegios por defecto del rol `supabase_admin` los administra Supabase (no modificables desde `postgres`).
- Caché del navegador al actualizar archivos estáticos: resolver al definir el despliegue.

## 10. Decisiones que no deben revertirse

- No reconstruir sobre la v2 ni copiar sus parches.
- Reglas de negocio vía RPC; no replicar transacciones críticas en JS; no inventar tablas, campos ni estados.
- Sin eliminación física de históricos; `ANIMAL.activo` no es estado del proceso.
- "💚 Disponible para adopción" es solo indicador visual de "En hogar temporal".
- Capturar FormData y archivos antes de bloquear controles; un fallo secundario nunca provoca un segundo registro.
- Fechas locales (sin conversión UTC); RUT normalizado `12345678-9`.
- `medio_contacto` con valores exactos (`WhatsApp/Telefono/Correo/Visita/Otro`).
- Nunca `service_role` ni secretos en el frontend; `config.js` fuera de Git.
- Registro público deshabilitado; cuentas solo por invitación.
- Sin IA, portal público, cuestionarios, scoring ni metas de esterilización.

## 11. Próxima etapa: Etapa 8 — Proyectos de esterilización

Alcance (Prompt Maestro §17–§20, Ficha §29.9): listado/creación de proyectos
(`crear-carpeta-proyecto` con reintento), detalle con pestañas Información ·
Nómina · Profesionales · Documentación; alta en nómina con código sugerido
editable, uno o más profesionales y PDF (`subir-archivo-drive`, contexto
`esterilizacion`); profesionales derivados vía `ANIMAL_ESTERILIZACION →
ESTERILIZACION_PROFESIONAL`; documentación del proyecto (contexto `proyecto`).
Puntos de extensión: `NAV_ITEMS`/`ROUTES` en `js/routes.js`, `js/views/files/section.js`
(ya soporta contexto `proyecto`/`esterilizacion` en `js/api/files.js`).

## 12. Flujo de trabajo acordado

1. Desarrollar la etapa o bloque autorizado.
2. Probar (automáticas + reales con datos QA).
3. Commits locales pequeños y coherentes en `frontend-rebuild`.
4. Informe consolidado (cambios, pruebas, IDs del plan, QA, pendientes, hashes).
5. Esperar aprobación de la usuaria.
6. Push de `frontend-rebuild` y confirmar sincronización local/remota.

Prohibido sin autorización: push a `master`, merge, rebase, force push, reset
destructivo, borrar ramas, modificar backend/RLS/Storage/Edge Functions, borrar
o resetear datos reales. **`master` no debe modificarse ni mezclarse hasta
autorización expresa.**
