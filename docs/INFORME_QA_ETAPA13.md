# Informe de QA integral — Etapa 13

| Dato | Valor |
|---|---|
| Fecha | 24-09-2026 |
| Entorno principal | `https://sistema-gestion-amor-de-cuatro-patas-frontend-v1.pages.dev/` (Cloudflare Pages) |
| Commit desplegado | `663d9f5` (`frontend-rebuild`); 66 archivos publicados comparados con el commit: idénticos |
| Backend | Supabase + Google Drive reales, con scripts de seguridad 01, 03, 05 y 07 aplicados |
| Pruebas automáticas | 101/101 (`node --test "tests/*.test.mjs"`) |

Convenciones: **PASS** ejecutada con resultado esperado · **FAIL** · **MANUAL
PENDIENTE** requiere intervención física o autorización · **NO APLICA**
justificado. "(Etapa N)" indica que la ejecución real se hizo en esa etapa,
contra el Supabase/Drive real; sin esa marca, se ejecutó en la Etapa 13 sobre
el sitio publicado.

## 1. Matriz de aceptación

| ID | Resultado | Evidencia / observación |
|---|---|---|
| PA-AUT-01 | PASS | Login real en la URL pública; redirige a la ruta pedida antes del login. |
| PA-AUT-02 | PASS | Contraseña incorrecta → "Correo o contraseña incorrectos" (ejecutado por la usuaria). |
| PA-AUT-03 | PASS | Prueba automática `session.test.mjs` (un solo inicio en curso). |
| PA-AUT-04 | PASS | Logout elimina el token; "Atrás" y URL directa muestran solo el login. |
| PA-AUT-05 | MANUAL PENDIENTE | No se desactiva una cuenta real. Servidor verificado: función y RLS rechazan usuaria sin perfil activo (script 08 B3); Edge Functions responden 403 a inactivas. |
| PA-NAV-01 | PASS | 9 módulos en orden, opción activa marcada. |
| PA-NAV-02 | PASS | 28 pantallas en 375/768/1366 px sin desborde; menú lateral en celular. |
| PA-NAV-03 | PASS | Recarga directa en `#/esterilizacion/5/nomina`, atrás/adelante y enlace profundo previo al login. |
| PA-DAS-01 | PASS | KPI = consulta directa a BD (4/0/1/3/7 antes; 4/0/1/4/8 después del E2E). |
| PA-DAS-02 | PASS | Activos excluye Adoptados (REG-12). |
| PA-DAS-03 | PASS | Los 5 KPI navegan con filtro visible ("Filtros aplicados"). |
| PA-DAS-04 | PASS | Rescatados del mes 7 → 8 tras registrar; filtro de fechas visible. |
| PA-ANI-01..08 | PASS | Carga, tarjeta abre ficha al primer render, Lista/Tarjetas con estado, búsqueda por nombre y microchip, filtro estado, sin resultados. |
| PA-REG-01 | PASS | "Cometa Prueba QA" con datos mínimos. |
| PA-REG-02 | PASS | "Estrella Prueba QA" con datos completos. |
| PA-REG-03 | PASS | Microchip QA `000000000000303` aceptado. |
| PA-REG-04 | PASS | 5 dígitos → "exactamente 15 dígitos". |
| PA-REG-05 | PASS | `…101` → "ya se encuentra asociado a un animal registrado" (servidor). |
| PA-REG-06 | PASS | Foto WebP en Storage y visible. |
| PA-REG-07 | PASS | Triple clic → 1 registro. |
| PA-REG-08 | PASS | Drive falla → animal creado una vez, aviso "No vuelvas a registrarlo", reintento de carpeta desde Archivos. |
| PA-REG-09 | PASS | Foto dañada → animal creado, foto pendiente con mensaje claro, "Agregar foto" en ficha. |
| PA-FIC-01..04 | PASS | 8 pestañas exactas; edición sin estado; historial abre (REG-09). |
| PA-EST-01 | PASS | Cambio a En tratamiento con motivo; historial cerrado + actual. |
| PA-EST-02 | PASS | Solo se ofrecen estados no reservados. |
| PA-SAL-01 | PASS | 8 tipos cargados con `id_tipo_atencion` (REG-11). |
| PA-SAL-02..05 | PASS | Atención registrada, estado sin cambio, próximo control anterior rechazado, aparece en Panel. |
| PA-HOG-01 | PASS | "Hogar Prueba QA 3" (triple clic → 1). |
| PA-HOG-02 | PASS | Edición de "Hogar Prueba QA" (Etapa 12). |
| PA-HOG-03..08 | PASS | Ocupación, ingreso, doble hogar rechazado, cambio conserva anterior, finalización con estado válido y fecha validada, indicador 💚 visual. |
| PA-ADO-01..05 | PASS | Adoptante nuevo; RUT duplicado e inválido rechazados; adopción cierra hogar; doble adopción rechazada; acceso desde ficha y módulo. |
| PA-SEG-01..05 | PASS | WhatsApp / `Telefono` / `Correo` (REG-10); fecha anterior rechazada; 3 seguimientos conservados. |
| PA-DEV-01 | PASS | Devolución → nuevo estado; adopción "Devuelto" conservada. |
| PA-GAS-01 | PASS (Etapa 6) | Gasto general QA. |
| PA-GAS-02 | PASS | Asignación igual al total aceptada (REG-05). |
| PA-GAS-03, 04, 08 | PASS (Etapa 6) | Parcial, compartido y fallo en segunda asignación. |
| PA-GAS-05..07 | PASS | Exceso rechazado, indicador "Excede en $1", misma asignación rechazada. |
| PA-ARC-01, 02, 05 | PASS | Subida por contexto, triple clic → 1 archivo, errores comprensibles (tipo, red). |
| PA-ARC-03 | MANUAL PENDIENTE | Enlace de Drive obtenido correctamente desde el dominio publicado; falta clic real en el visor. |
| PA-ARC-04 | MANUAL PENDIENTE | Confirmar en Drive que los archivos no son "cualquiera con el enlace" (el sistema no cambia permisos). |
| PA-DIF-01..05 | PASS | Texto y prompt editables, sin microchip/RUT/hogar/adoptante, sin API de IA. Copiar al portapapeles: manual. |
| PA-PRO-01..04 | PASS | Proyecto sin meta; estructura Drive; fallo Drive → reintento (proyecto 6); 4 pestañas. |
| PA-NOM-01..07 | PASS | Etapa 8 + E2E-02 (microchip `…404`). |
| PA-PRF-01..05 | PASS | Reutilizables, N:M con función, derivados de la nómina; corrección de función y quitar asociación (revisión). |
| PA-PDF-01..06 | PASS | Documento PDF/JPG/PNG/WebP; tipo y unicidad también en servidor; `EST-001.jpg`; abrir desde nómina; sin reemplazo. Ubicación visual en carpeta `Animales`: confirmar en Drive (manual). |
| PA-DOC-01..05 | PASS | Documentación del proyecto separada; buscador transversal con contexto y filtros; sin `id_externo`. |
| PA-INF-01..09 | PASS | Selección persistente, filtros contextuales, fechas, combinaciones, limpiar, sin resultados, CSV con BOM. Impresión: diálogo del navegador manual. |
| PA-CON-01 | PASS | Nombre + correo de Auth (sin duplicar); edición de nombre. |
| PA-CON-02 | MANUAL PENDIENTE | Invitación real requiere un correo QA; validación del servidor verificada. |
| PA-CON-03 | MANUAL PENDIENTE | RPC verificada (script 08); no se desactivó una cuenta real. |
| PA-CON-04 | PASS | Autodesactivación rechazada por el servidor y bloqueada en la interfaz. |
| PA-CON-05 | MANUAL PENDIENTE | Exigiría desactivar la otra cuenta real. Regla presente en `desactivar_usuario`. |
| PA-CAT-01..05 | PASS | 8 catálogos con columnas reales; `id_tipo_atencion`; `nombre_estado`; rango con edades; activar/desactivar sin borrar. |
| §28 Doble submit | PASS | Animal, atención, hogar, ingreso, adopción, seguimiento, gasto, archivo, proyecto, nómina, profesional: 1 operación. Invitación: validación cliente (envío real manual). Auditoría de código: ningún formulario deshabilita inputs antes de FormData. |
| PA-ERR-01 | PASS | Red caída al subir: mensaje, archivo y datos conservados, reintento → 1 archivo. |
| PA-ERR-02 | PASS | Rechazos del servidor comprensibles (microchip, doble hogar/adopción, RUT). |
| PA-ERR-03 | PASS | Animal creado + foto/carpeta fallida diferenciados. |
| PA-SEGUR-01..03 | PASS | Sin service_role ni secretos en frontend ni en el historial Git; `config.js` fuera de Git y generado en Cloudflare con clave *publishable*. |
| PA-SEGUR-04 | PASS | Sin sesión: 22 tablas → `[]`, escrituras rechazadas, Storage privado, Edge Functions 401, registro público deshabilitado. |
| PA-SEGUR-05 | PASS | 16 funciones de negocio: `anon` → permission denied. Ver incidencia S-1 (usuarias autenticadas). |
| PA-TRA-01..05 | PASS | Historial de estados, hogares, adopciones y proyecto finalizado conservados (ver S-1). |
| PA-UX-01..06 | PASS | Revisión integral Etapa 12. |
| PA-RES-01..03 | PASS | Sitio publicado sin desbordes; tablas apiladas y filtros plegables en celular. |
| PA-ACC-01..03 | PASS | Tarjetas por teclado, etiquetas, foco visible y retorno de foco. |
| PA-E2E-01 | PASS | Ciclo completo de "Estrella Prueba QA" con coherencia en Panel, Documentos e Informes. |
| PA-E2E-02 | PASS | "Proyecto Esterilización QA E2E" completo y finalizado; sin tocar el módulo de rescate. |
| REG-01..13 | PASS | Todas reejecutadas en el sitio publicado (REG-13: carpeta Drive fallida + reintento). |

## 2. Incidencia de seguridad pendiente de decisión

**S-1 — Una usuaria activa puede omitir las reglas de las RPC escribiendo
directamente en tablas de proceso.** Las políticas RLS permiten INSERT/UPDATE a
cualquier usuaria activa en todas las tablas. Verificado sin alterar datos
(UPDATE con el mismo valor): `animal.id_estado_actual` y `historial_estado`
aceptan UPDATE directo. Por la API podrían cambiarse estados sin historial,
editar el historial o crear adopciones/permanencias/asignaciones sin las
validaciones de las RPC. La interfaz no lo hace (solo escribe directamente en
catálogos, adoptante, hogar, gasto, atención, proyecto, nómina, profesional,
relación profesional y columnas descriptivas de `animal`).

Riesgo: bajo en la práctica (solo dos usuarias internas autenticadas), pero
afecta trazabilidad e integridad. Corrección propuesta (requiere autorización):
revocar INSERT/UPDATE directos de `authenticated` sobre `historial_estado`,
`permanencia_animal_hogar`, `adopcion`, `seguimiento`, `animal_gasto`,
`archivo` y tablas `*_archivo`, y limitar UPDATE de `animal` y
`proyecto_esterilizacion` a sus columnas editables (sin estado, `activo` ni
carpeta Drive). Las RPC SECURITY DEFINER y las Edge Functions siguen
funcionando. Script versionado + verificación, como los anteriores.

## 3. Observaciones menores

- Cloudflare publica también `tools/` y `tests/` (sin secretos).
- Caché tras un despliegue: encabezados `no-cache` verificados; el efecto real
  se comprobará en el próximo despliegue.

## 4. Datos QA creados en la Etapa 13

Animales: id 9 "Estrella Prueba QA" (microchip `000000000000303`, adoptada:
adopción 7 Devuelto + 8 Activa), id 10 "Cometa Prueba QA", id 11 "Luz Prueba QA".
Adoptante id 4 "Adoptante Dos Prueba QA" (RUT ficticio `11111111-1`).
Hogar "Hogar Prueba QA 3". Gasto id 9 "Gasto integral Prueba QA (Etapa 13)".
Proyectos id 5 "Proyecto Esterilización QA E2E" (finalizado, EST-001 microchip
`000000000000404`, documento `EST-001.jpg`) e id 6 "Proyecto Esterilización QA
Fallo Drive". Profesional "Profesional Doble Clic QA". Archivos:
`certificado-estrella-qa.pdf`, `documento-red-qa.pdf`, `convenio-proyecto-qa.pdf`.
