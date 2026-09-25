# Pruebas y validación

Este documento resume cómo se verificó el sistema. La verificación se organizó en cuatro niveles complementarios: pruebas automáticas de la lógica del frontend, scripts de verificación del backend, pruebas de integración contra los servicios reales y pruebas de aceptación sobre el sitio desplegado.

Criterio general: una funcionalidad no se considera terminada solo porque se visualiza correctamente. Cada flujo se contrastó con el backend real (persistencia, reglas de negocio, trazabilidad, manejo de errores y prevención de duplicados).

## 1. Pruebas automáticas del frontend

- Herramienta: test runner integrado de Node.js (`node:test`), sin dependencias externas.
- Ejecución (desde `frontend/`): `node --test "tests/*.test.mjs"`.
- Resultado actual: **113 pruebas, 113 aprobadas**.
- No requieren red ni credenciales: la sesión se prueba con un cliente de Supabase simulado.

| Archivo | Cobertura |
|---|---|
| `format.test.mjs` | RUT y dígito verificador, fechas locales, microchip, montos en pesos. |
| `errors.test.mjs` | Traducción de errores de red, Auth, base de datos y Edge Functions. |
| `router.test.mjs` | Rutas, filtros en la URL, respuestas de Auth, menú y anclas internas. |
| `session.test.mjs` | Inicio y cierre de sesión, cuenta inactiva, doble envío, revalidación y recuperación de contraseña. |
| `animals-logic.test.mjs` | Filtros, formulario, estados permitidos, hogares y salud. |
| `adoptions-logic.test.mjs` | Adoptantes, adopción, seguimiento y devolución. |
| `expenses-logic.test.mjs` | Montos, asignaciones, igualdad con el total y exceso. |
| `files-logic.test.mjs` | Validación de archivos y difusión con datos autorizados. |
| `sterilization-logic.test.mjs` | Proyectos, nómina, profesionales, documento de esterilización, reintentos sin duplicados y exportación. |
| `documents-logic.test.mjs` | Contexto de cada archivo, búsqueda y filtros. |
| `reports-definitions.test.mjs` | Filtros por informe, fechas, totales y exportación CSV. |
| `settings-logic.test.mjs` | Catálogos contra las columnas reales del esquema, valores protegidos, contraseña y reglas de usuarias. |
| `permissions.test.mjs` | Coherencia entre los privilegios del script de seguridad 09 y las columnas que escribe el frontend. |
| `write-config.test.mjs` | Generación de la configuración pública del despliegue y rechazo de claves de servicio. |

## 2. Verificación del backend

Cada refuerzo de seguridad del backend tiene un script de verificación en `supabase/security/`. Los scripts simulan una usuaria autenticada y activa, y también el rol anónimo; comprueban cada regla y se ejecutan dentro de una transacción que se revierte, por lo que no modifican datos. Todos los casos resultaron correctos.

| Verificación | Qué comprueba |
|---|---|
| 02 | Ninguna función de negocio es ejecutable por el rol anónimo; la función interna de estados no es accesible. |
| 04 | Rechazo del cambio manual de estado con hogar o adopción activa, y del ingreso a hogar con adopción activa. |
| 06 | Un único documento de esterilización por animal. |
| 08 | Quitar relaciones profesional–esterilización, listar usuarias y editar el propio nombre. |
| 10 | Privilegios mínimos: 21 escrituras directas prohibidas son rechazadas, las escrituras necesarias y las RPC siguen funcionando, y RLS permanece habilitado. |

## 3. Pruebas de integración

Se ejecutaron contra Supabase y Google Drive reales, utilizando registros de prueba claramente identificados (por ejemplo, "Luna Prueba QA") y valores ficticios de microchip y RUT. Se probaron Auth, la API de datos, las RPC, Storage, las Edge Functions y la creación de carpetas y archivos en Drive, incluyendo escenarios de falla (Drive no disponible, red interrumpida durante una carga, cargas simultáneas del mismo documento).

## 4. Pruebas de aceptación

Se definió un plan de pruebas de aceptación con casos identificados por módulo (PA-AUT, PA-NAV, PA-DAS, PA-ANI, PA-REG, PA-FIC, PA-EST, PA-SAL, PA-HOG, PA-ADO, PA-SEG, PA-DEV, PA-GAS, PA-ARC, PA-DIF, PA-PRO, PA-NOM, PA-PRF, PA-PDF, PA-DOC, PA-INF, PA-CON, PA-CAT, PA-ERR, PA-SEGUR, PA-TRA, PA-UX, PA-RES, PA-ACC y PA-E2E). El plan se ejecutó sobre el sitio desplegado en Cloudflare Pages.

| Grupo | Resultado |
|---|---|
| Autenticación y navegación | Aprobado. Inicio y cierre de sesión, rutas profundas, botón Atrás y 28 pantallas revisadas en 375, 768 y 1366 px. |
| Panel principal | Aprobado. Los cinco indicadores coinciden con consultas directas a la base de datos y navegan con su filtro. |
| Animales, ficha y estados | Aprobado. Registro mínimo y completo, microchip válido, inválido y duplicado, foto, triple clic que genera un solo registro y fallas secundarias informadas sin duplicar. |
| Salud, hogares, adopciones, seguimientos y devoluciones | Aprobado. Reglas de fechas, un solo hogar y una sola adopción activa, historial conservado. |
| Gastos | Aprobado. Gasto general, parcial, compartido, igual al total y rechazo del exceso. |
| Archivos, documentos y difusión | Aprobado. Carga por contexto, apertura en Drive, buscador transversal, texto y prompt sin datos personales. |
| Proyectos de esterilización | Aprobado. Proyecto, carpeta en Drive y reintento, nómina, profesionales, documento en PDF o imagen validado también en el servidor. |
| Informes | Aprobado. Selección persistente, filtros por informe, combinaciones, exportación CSV y descarga. |
| Configuración y catálogos | Aprobado. Cuenta, rechazo de autodesactivación, catálogos con columnas reales, activar y desactivar sin borrar. |
| Errores y doble envío | Aprobado. Mensajes comprensibles; ningún formulario genera operaciones duplicadas. |
| Seguridad | Aprobado. Sin secretos en el frontend ni en el historial; sin sesión no se obtienen datos, las escrituras son rechazadas y Storage es privado. |
| Trazabilidad | Aprobado. Historial de estados, hogares, adopciones y proyectos finalizados conservados. |
| Experiencia, responsive y accesibilidad | Aprobado. Contraste AA, uso con teclado, foco visible, tablas y filtros adaptados a celular. |
| Punta a punta | Aprobado. Ciclo completo de un animal (registro → salud → hogar → adopción → seguimiento → devolución → nueva adopción) y ciclo completo de un proyecto de esterilización. |

### 4.1 Regresiones controladas

Durante el desarrollo se identificaron fallos que no debían reaparecer. Todos se volvieron a ejecutar sobre el sitio desplegado con resultado aprobado.

| ID | Riesgo controlado | Resultado exigido |
|---|---|---|
| REG-01 | Tarjetas de animales no clickeables al primer render. | Abren la ficha inmediatamente. |
| REG-02 | Indicadores del panel sin navegación. | Todos navegan con su filtro. |
| REG-03 | `registrar_animal` llamado con parámetros incompletos. | Se envía la firma completa. |
| REG-04 | Datos perdidos por deshabilitar campos antes de leer el formulario. | Se capturan antes de bloquear. |
| REG-05 | Gasto igual al total rechazado. | La igualdad se acepta. |
| REG-06 | Archivo seleccionado que aparece como inexistente. | El archivo se conserva al enviar. |
| REG-07 | Carga a Drive con formulario incompleto. | Envío multipart completo. |
| REG-08 | Informe seleccionado sin indicación visual. | La selección permanece marcada. |
| REG-09 | Historial que redirige al panel. | Abre el historial correcto. |
| REG-10 | Medio de contacto enviado con un valor no admitido. | Se envían los valores exactos del backend. |
| REG-11 | Clave primaria de un catálogo deducida incorrectamente. | Se usa la clave real (`id_tipo_atencion`). |
| REG-12 | Animales adoptados contados como activos. | Se excluye el estado Adoptado. |
| REG-13 | Reintento tras una falla secundaria que duplica el animal. | Se conserva el registro creado y se informa la falla parcial. |

## 5. Incidencia de seguridad S-1

**Hallazgo.** Durante la auditoría se detectó que las políticas RLS permitían a una usuaria activa escribir directamente, mediante la API, en tablas de proceso (por ejemplo, el estado actual del animal o el historial de estados), omitiendo las validaciones de las RPC. La interfaz no lo hacía, pero la base de datos debía impedirlo por sí misma. El riesgo práctico era bajo (solo usuarias internas autenticadas), pero afectaba la integridad y la trazabilidad.

**Corrección.** El script `2026-09-24_09_restringir_escritura_directa.sql` aplica privilegios mínimos por tabla y columna: el navegador conserva solo las escrituras que necesita y las tablas de proceso quedan de solo lectura. Las RPC y Edge Functions no se ven afectadas porque se ejecutan con privilegios propios.

**Verificación.** El script 10 confirmó el rechazo de las escrituras prohibidas y el funcionamiento de las permitidas. Se repitieron las pruebas de los flujos afectados (edición de animal, cambio de estado, atención sanitaria, proyecto, nómina, profesionales y catálogos) con resultado correcto. La prueba automática `permissions.test.mjs` detecta futuras diferencias entre los permisos y lo que escribe el frontend.

## 6. Validación manual

Confirmadas sobre el sitio desplegado:

- carga de una fotografía tomada desde un teléfono;
- apertura de archivos en el visor de Google Drive;
- descarga de informes.

Pendientes (requieren cuentas o acciones que no se ejecutaron sobre cuentas reales):

- desactivación de una cuenta y comportamiento de una sesión inactiva (verificado en el servidor, no con una cuenta real);
- invitación real de una cuenta nueva;
- prueba completa de recuperación de contraseña con correo real;
- revisión en Drive de que ningún archivo esté compartido como "cualquiera con el enlace";
- impresión de informes y copia al portapapeles en el navegador de las usuarias.

## 7. Validación con la Fundación

La propuesta fue validada con la Fundación en la reunión del 10 de septiembre de 2026 (ver Ficha Maestra, sección 3). Posteriormente, la Fundación solicitó tres mejoras (estado de esterilización de los animales, actualización de la identidad visual e importación de la ficha del adoptante), que se registran como pendientes en la sección 23 de la Ficha Maestra.
