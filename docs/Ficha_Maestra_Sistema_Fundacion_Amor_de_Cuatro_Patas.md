# Ficha Maestra del Sistema

**Sistema Web de Gestión de Rescate y Adopción Animal — Fundación Amor de Cuatro Patas**

Versión 8 (versión final del MVP) — 25 de septiembre de 2026

Este documento es la referencia técnica y académica del proyecto. Describe el problema abordado, las decisiones de diseño y la implementación real del sistema tal como se encuentra en el repositorio: frontend, base de datos, funciones del servidor, seguridad, despliegue y pruebas. Cuando una característica está pendiente o fuera del alcance, se indica expresamente.

## 1. Identificación del proyecto

| Elemento | Definición |
|---|---|
| Nombre | Sistema Web de Gestión de Rescate y Adopción Animal — Fundación Amor de Cuatro Patas |
| Socio comunitario | Fundación Amor de Cuatro Patas |
| Contexto académico | Proyecto informático desarrollado en modalidad Aprendizaje + Servicio (A+S), asociado a las asignaturas de Arquitectura de Software y Administración de Proyectos Informáticos. |
| Tipo de solución | Sistema web interno desarrollado como Producto Mínimo Viable (MVP) funcional. |
| Usuarias | Presidenta y Tesorera de la Fundación, con el mismo nivel de acceso. Nuevas cuentas solo por invitación. |
| Estado | MVP implementado, desplegado en un entorno de prueba y validado con pruebas automáticas, pruebas de integración contra los servicios reales y pruebas de aceptación. |

## 2. Contexto y problema

La Fundación Amor de Cuatro Patas rescata animales, los cuida, los ubica en hogares temporales y gestiona su adopción y seguimiento. Además, participa en proyectos de esterilización masiva financiados por terceros.

Antes del proyecto, la información se encontraba distribuida entre teléfonos, correos electrónicos, formularios físicos, redes sociales y otros registros. Esta dispersión dificultaba:

- centralizar los antecedentes de cada animal y consultar rápidamente su situación;
- conservar la historia completa de cada caso (estados, salud, hogares, adopciones);
- gestionar adopciones, devoluciones y seguimientos posteriores;
- organizar fotografías, videos y documentos;
- conocer los gastos asociados a cada animal y los gastos generales;
- obtener información consolidada para informes y rendiciones;
- reunir antecedentes para preparar publicaciones de difusión.

**Problema central:** la Fundación requiere una herramienta centralizada que permita organizar, consultar y mantener la trazabilidad de la información asociada a los animales rescatados y a sus proyectos de esterilización, apoyando los procesos de cuidado, adopción, seguimiento, administración y difusión.

## 3. Levantamiento y validación con la Fundación

### 3.1 Proceso de levantamiento

El levantamiento comenzó alrededor del 4 de septiembre de 2026 mediante un cuestionario respondido por la Fundación. Con esa información se elaboraron los primeros requerimientos, reglas de negocio y la definición del MVP.

El 10 de septiembre se realizó una reunión de revalidación en la que las representantes confirmaron que la problemática corresponde a una necesidad real y que la propuesta responde a sus expectativas. Se validaron los módulos principales, el contenido de las fichas y la estrategia de almacenamiento, y se precisaron tres aspectos:

- el flujo de rescate y adopción no es estrictamente lineal: un animal puede volver a estados anteriores;
- una devolución debe conservar todo el historial de la adopción;
- se incorpora como nuevo requerimiento la gestión independiente de proyectos de esterilización masiva.

En la misma instancia se descartó la integración directa con una API de inteligencia artificial y la Fundación indicó que puede asumir, si fuese necesario, costos futuros de almacenamiento en Google Drive o de la herramienta de IA externa que decida utilizar.

### 3.2 Origen de las decisiones

| Origen | Decisiones |
|---|---|
| Alcance inicial (cuestionario) | Fichas de animales, estados e historial, salud, hogares temporales, adopciones y seguimientos, gastos, archivos, informes y apoyo a la difusión. |
| Validación con la Fundación (10/09) | Flujo no lineal con retorno a estados anteriores; devoluciones que conservan el historial; módulo independiente de proyectos de esterilización; difusión sin API de IA (texto base y prompt editable). |
| Decisiones de diseño durante el desarrollo | Reglas de proceso implementadas como funciones transaccionales (RPC) en la base de datos; operaciones con credenciales en Edge Functions; fotografía principal en Supabase Storage y demás archivos en Google Drive; microchip y Registro Nacional en ambos módulos; recuperación segura de operaciones de varios pasos; privilegios mínimos por tabla y columna; documento de esterilización único por animal, en PDF o imagen y sin reemplazo; recuperación de contraseña; despliegue en Cloudflare Pages. |
| Requerimientos recientes de la Fundación | Estado de esterilización de los animales, actualización de la identidad visual e importación de la ficha del adoptante. **Pendientes de implementación** (ver sección 22). |

## 4. Objetivos

### 4.1 Objetivo general

Diseñar y desarrollar un prototipo funcional de un sistema web que permita centralizar y gestionar la información de los animales rescatados por la Fundación Amor de Cuatro Patas, manteniendo su trazabilidad y apoyando los procesos de cuidado, adopción, seguimiento, administración y difusión.

### 4.2 Objetivos específicos

1. Organizar la información de los animales rescatados mediante fichas individuales que integren sus antecedentes, estado, salud, hogares, adopciones, gastos y archivos.
2. Permitir registrar, consultar, actualizar, buscar y filtrar la información, gestionando el estado del animal en cada etapa del proceso y conservando su historia.
3. Gestionar de forma independiente los proyectos de esterilización masiva, con su nómina de animales, profesionales y documentación.
4. Implementar una herramienta de apoyo a la difusión que genere, con información autorizada de la ficha, un texto base y un prompt editable para ser usado en herramientas externas.
5. Proteger la información mediante autenticación, autorización a nivel de base de datos y manejo seguro de credenciales.

## 5. Alcance del MVP

### 5.1 Dentro del alcance (implementado)

- Acceso con Supabase Auth, cuentas por invitación, activación/desactivación y recuperación de contraseña.
- Panel principal con indicadores navegables.
- Fichas de animales con fotografía principal, estados e historial.
- Historial sanitario y próximos controles.
- Hogares temporales y permanencias.
- Adoptantes, adopciones, seguimientos y devoluciones.
- Gastos generales y asignados total o parcialmente a uno o varios animales.
- Archivos en Google Drive asociados a animales, adopciones, gastos, proyectos, esterilizaciones y documentación de la Fundación.
- Buscador transversal de documentos.
- Proyectos de esterilización: nómina, profesionales y documentación.
- Informes configurables con exportación a CSV (Excel) e impresión.
- Apoyo a la difusión: texto base y prompt editable.
- Configuración: cuenta, usuarias y catálogos.

### 5.2 Fuera del alcance

- Aplicación móvil nativa y portal público de adopción.
- Postulaciones, cuestionarios o puntajes de adoptantes, y cualquier selección automática.
- Sistema veterinario clínico completo, contabilidad completa, inventario, tienda o donaciones.
- Metas o cupos en los proyectos de esterilización.
- Integración directa con APIs de inteligencia artificial, generación de flyers o imágenes y publicación automática en redes sociales.
- Capacidad máxima de hogares temporales (no validada con la Fundación).

## 6. Organización funcional

El sistema contempla dos áreas que comparten la aplicación, la autenticación y los criterios de seguridad, pero responden a procesos distintos:

- **Rescate y adopción.** El animal rescatado es la entidad central y se relaciona con su estado e historial, salud, hogares temporales, adopciones, adoptantes, seguimientos, gastos y archivos.
- **Proyectos de esterilización masiva.** Proceso independiente: la Fundación postula a proyectos que se ejecutan en un período determinado. Se registran los animales esterilizados (principalmente callejeros que vuelven a su lugar habitual), los profesionales participantes y la documentación. Estos animales **no** se incorporan al flujo de rescate y adopción.

Flujo de referencia del animal rescatado:

```
RESCATE → REGISTRO → (TRATAMIENTO) → HOGAR TEMPORAL → DISPONIBLE PARA ADOPCIÓN
        → ADOPCIÓN → SEGUIMIENTO
                   ↘ DEVOLUCIÓN → vuelve a un estado anterior
```

El flujo no es lineal: el animal puede cambiar de estado según su situación y cada cambio queda registrado.

## 7. Principio de trazabilidad

La información histórica no desaparece cuando cambia la situación del animal. En la implementación esto se traduce en:

- no existe eliminación física de registros de negocio: ninguna política RLS permite DELETE y ningún rol del navegador tiene privilegio DELETE;
- los estados se registran en HISTORIAL_ESTADO; las permanencias, adopciones y seguimientos se cierran con fechas, no se borran;
- los catálogos, hogares y registros se desactivan (`activo = false`) en lugar de eliminarse;
- una devolución finaliza la adopción con estado "Devuelto" y la conserva.

## 8. Requerimientos funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RF-01 | Autenticar a las usuarias autorizadas con el mismo nivel de permisos. | Implementado |
| RF-02 | Gestionar las fichas de animales (registrar, consultar, actualizar, buscar y filtrar), incluyendo microchip y Registro Nacional, conservando los registros históricos. | Implementado |
| RF-03 | Gestionar el estado de cada animal y conservar el historial de sus cambios. | Implementado |
| RF-04 | Gestionar el historial sanitario de cada animal. | Implementado |
| RF-05 | Gestionar los hogares temporales y conservar el historial de permanencias. | Implementado |
| RF-06 | Gestionar el proceso de adopción relacionando animal y adoptante. | Implementado |
| RF-07 | Gestionar el seguimiento post-adopción conservando su historial. | Implementado |
| RF-08 | Gestionar gastos generales y gastos relacionados con uno o más animales. | Implementado |
| RF-09 | Generar informes y consultas con la información registrada. | Implementado |
| RF-10 | Mantener una fotografía principal optimizada de cada animal. | Implementado |
| RF-11 | Crear y relacionar automáticamente una carpeta de Google Drive por animal. | Implementado |
| RF-12 | Agregar fotografías, videos y documentos almacenándolos en Google Drive. | Implementado |
| RF-13 | Acceder desde el sistema a los archivos almacenados en Google Drive. | Implementado |
| RF-14 | Generar un texto base de difusión con información autorizada del animal. | Implementado |
| RF-15 | Generar un prompt estructurado, editable y copiable para herramientas externas. | Implementado |
| RF-16 | Gestionar proyectos de esterilización con su estado, período e historia. | Implementado |
| RF-17 | Registrar los animales esterilizados de cada proyecto, con microchip y Registro Nacional, sin incorporarlos al proceso de rescate. | Implementado |
| RF-18 | Registrar y relacionar los profesionales participantes con cada esterilización. | Implementado |
| RF-19 | Relacionar documentos con proyectos y con esterilizaciones específicas. | Implementado |
| RF-20 | Gestionar cuentas: invitar por correo, activar, desactivar y editar el propio nombre. | Incorporado en el desarrollo |
| RF-21 | Recuperar la contraseña mediante un enlace enviado por correo. | Incorporado en el desarrollo |
| RF-22 | Buscar documentos de forma transversal, con su contexto, filtros y apertura en Drive. | Incorporado en el desarrollo |
| RF-23 | Exportar informes y nóminas a CSV compatible con Excel e imprimir informes. | Incorporado en el desarrollo |

## 9. Requerimientos no funcionales

| ID | Requerimiento | Cómo se aborda en la implementación |
|---|---|---|
| RNF-01 | Interfaz sencilla y comprensible. | Menú de nueve módulos, ficha integral del animal con pestañas, estados vacíos explicativos y mensajes de error en lenguaje claro. |
| RNF-02 | Uso en computador, tablet y teléfono. | Diseño responsive con Bootstrap: menú lateral desplegable, tablas apiladas como tarjetas, filtros plegables y modales a pantalla completa en celular. |
| RNF-03 | Acceso solo para usuarias autenticadas. | Supabase Auth + verificación de perfil activo; ninguna ruta interna se muestra sin sesión activa. |
| RNF-04 | Protección de datos personales. | RLS en todas las tablas; el rol anónimo no obtiene filas; difusión excluye RUT, direcciones y teléfonos. |
| RNF-05 | Integridad de las relaciones. | Claves foráneas, restricciones CHECK/UNIQUE e índices únicos parciales en PostgreSQL. |
| RNF-06 | Trazabilidad histórica. | Sin DELETE; historiales y cierres por fecha (sección 7). |
| RNF-07 | Componentes con responsabilidades separadas. | Capas de presentación, lógica y acceso a datos; módulos por dominio (sección 10). |
| RNF-08 | Navegadores modernos. | HTML, CSS y JavaScript estándar (módulos ES), sin compilación. |
| RNF-09 | Credenciales protegidas. | Secretos solo en Edge Functions; el frontend rechaza claves `service_role`. |
| RNF-10 | Multimedia fuera de la base de datos. | Supabase Storage y Google Drive; la BD guarda rutas e identificadores. |
| RNF-11 | Enlaces accesibles según permisos. | Bucket privado con URLs firmadas; archivos de Drive privados, nunca "cualquiera con el enlace". |
| RNF-12 | Servicios gratuitos o de bajo costo. | Planes gratuitos de Supabase, Google Drive, GitHub y Cloudflare Pages. |
| RNF-13 | Integraciones con autenticación segura. | OAuth 2.0 con Google; JWT verificado en cada Edge Function. |
| RNF-14 | Separación entre animales rescatados y de esterilización. | Tablas ANIMAL y ANIMAL_ESTERILIZACION independientes. |

## 10. Arquitectura del sistema

### 10.1 Estilo arquitectónico

Se seleccionó una arquitectura **Cliente-Servidor complementada con una Arquitectura de Tres Capas**. Se descartaron arquitecturas distribuidas o de microservicios por no justificarse para el tamaño del sistema ni para el plazo del proyecto.

El cliente es una aplicación web de una sola página (SPA) que se ejecuta en el navegador. El servidor está compuesto por servicios gestionados de Supabase (autenticación, API de datos, base de datos PostgreSQL, almacenamiento y funciones) y por Google Drive como servicio externo de archivos.

| Capa | Responsabilidad | Implementación |
|---|---|---|
| Presentación | Interfaces, navegación y captura de acciones. | `frontend/`: HTML, CSS con Bootstrap y vistas en JavaScript (`js/views/`). |
| Lógica de negocio | Validaciones, cálculos y reglas de los procesos. | En el cliente, lógica pura por módulo (`logic.js`) para validar y preparar datos. En el servidor, las reglas que modifican varias tablas se implementan como funciones transaccionales PostgreSQL (RPC) y las operaciones con credenciales como Edge Functions. |
| Acceso a datos | Consultas y escrituras. | `frontend/js/api/` (cliente supabase-js) contra la API de datos de Supabase, protegida por RLS y privilegios por columna. |

### 10.2 Diagrama de componentes

```
Navegador (SPA)
  ├─ Vistas (js/views)  ── lógica pura (logic.js)
  ├─ Núcleo (js/core): sesión, router, formularios, errores, UI
  └─ Acceso a datos (js/api) ── supabase-js ──┐
                                               │ HTTPS + JWT
Supabase ──────────────────────────────────────┤
  ├─ Auth (identidad, invitaciones, recuperación)
  ├─ API de datos (PostgREST) → PostgreSQL: tablas + RLS + RPC
  ├─ Storage: bucket privado fotos-animales
  └─ Edge Functions (Deno) ── OAuth 2.0 ──→ Google Drive API
```

### 10.3 Decisiones de arquitectura

| Decisión | Alternativa descartada | Justificación |
|---|---|---|
| Reglas de proceso en funciones PostgreSQL (RPC) transaccionales. | Coordinar varias escrituras desde JavaScript. | Garantiza atomicidad (todo o nada) y que las reglas se cumplan aunque se acceda a la API sin la interfaz. |
| Seguridad en la base de datos (RLS + privilegios). | Confiar solo en la interfaz. | La API de datos es accesible directamente con una sesión válida; la base de datos debe protegerse por sí misma. |
| Operaciones con Google Drive en Edge Functions. | Llamar a Drive desde el navegador. | Las credenciales OAuth y la clave de servicio no pueden llegar al navegador. |
| Fotografía principal en Supabase Storage y demás archivos en Google Drive. | Todo en Storage o todo en Drive. | La foto se muestra en listados (acceso rápido con URL firmada); los documentos se gestionan en el espacio de la Fundación, que ya utiliza Drive. |
| SPA en JavaScript sin framework ni compilación. | Frameworks con proceso de build. | Menor complejidad para un equipo pequeño; despliegue como sitio estático; el código puede leerse y defenderse directamente. |
| Router por hash (`#/ruta`). | Rutas del servidor. | Funciona en cualquier hosting estático sin reglas de reescritura. |
| Despliegue estático en Cloudflare Pages. | GitHub Pages, servidor propio. | Gratuito, compatible con repositorio privado, HTTPS y encabezados de seguridad. |

## 11. Tecnologías utilizadas

| Área | Tecnología | Función |
|---|---|---|
| Interfaz | HTML5, CSS3 | Estructura y estilos. |
| Componentes y responsive | Bootstrap 5.3.8, Bootstrap Icons 1.13.1 | Grilla, formularios, modales, toasts e iconografía (CDN con verificación de integridad SRI). |
| Lógica del cliente | JavaScript (módulos ES) | Vistas, validaciones, enrutamiento y comunicación con Supabase. |
| Cliente de backend | supabase-js 2.117.1 | Auth, API de datos, RPC, Storage y Edge Functions. |
| Backend como servicio | Supabase | Auth, PostgreSQL, API de datos (PostgREST), Storage y Edge Functions. |
| Base de datos | PostgreSQL | Tablas, restricciones, RLS y funciones PL/pgSQL. |
| Funciones del servidor | Edge Functions (Deno, TypeScript) | Integración con Google Drive e invitación de usuarias. |
| Archivos | Google Drive API + OAuth 2.0 | Carpetas y documentos de la Fundación. |
| Despliegue | Cloudflare Pages | Hosting estático con HTTPS. |
| Pruebas | Node.js `node:test` | Pruebas automáticas de la lógica del frontend. |
| Versionamiento | Git y GitHub | Control de versiones y ramas. |
| Diseño | Figma, Draw.io | Prototipo inicial de interfaces y diagramas (BPMN, DER). |

## 12. Estructura del repositorio

```
README.md                 Presentación del proyecto
docs/                     Documentación académica (esta ficha, despliegue, pruebas)
frontend/                 Aplicación web (sitio estático)
  index.html, css/        Documento base e identidad visual
  js/app.js, routes.js    Punto de entrada y mapa de rutas
  js/supabase.js          Cliente Supabase (lee js/config.js, no versionado)
  js/core/                Sesión, router, formularios, errores, formato, UI
  js/api/                 Acceso a datos por dominio
  js/views/               Pantallas por módulo (y su lógica pura en logic.js)
  tests/                  Pruebas automáticas (node:test)
  tools/write-config.mjs  Genera la configuración pública en el despliegue
supabase/
  schema.sql              Esquema completo: tablas, RPC, RLS y permisos
  seed.sql                Catálogos iniciales
  infrastructure.sql      Trigger de Auth y bucket/políticas de Storage
  functions/              Edge Functions
  security/               Scripts de refuerzo de seguridad y su verificación
  config.toml             Configuración de Supabase CLI (sin secretos)
```

## 13. Modelo de datos

### 13.1 Proceso de diseño

Requerimientos → reglas de negocio → procesos (BPMN) → modelo conceptual → Diagrama Entidad-Relación v1.0 → modelo relacional → diseño físico → implementación en PostgreSQL/Supabase → seguridad e integraciones.

El esquema implementado contiene **30 tablas** en el esquema `public`. El módulo de informes no tiene tablas propias: sus resultados son consultas sobre los registros existentes.

### 13.2 Entidades

| Área | Tablas |
|---|---|
| Usuarias | USUARIO (perfil vinculado a `auth.users`) |
| Rescate y adopción | ANIMAL, HISTORIAL_ESTADO, ATENCION_SANITARIA, HOGAR_TEMPORAL, PERMANENCIA_ANIMAL_HOGAR, ADOPTANTE, ADOPCION, SEGUIMIENTO, GASTO, ANIMAL_GASTO |
| Esterilización | PROYECTO_ESTERILIZACION, ANIMAL_ESTERILIZACION, PROFESIONAL, ESTERILIZACION_PROFESIONAL |
| Archivos | ARCHIVO y sus asociaciones: ANIMAL_ARCHIVO, ADOPCION_ARCHIVO, GASTO_ARCHIVO, PROYECTO_ARCHIVO, ESTERILIZACION_ARCHIVO, FUNDACION_ARCHIVO |
| Catálogos | ESTADO, ESPECIE, RANGO_ETARIO, TIPO_ATENCION_SANITARIA, ESTADO_ADOPCION, CATEGORIA_GASTO, ESTADO_PROYECTO, CATEGORIA_ARCHIVO |

### 13.3 Relaciones principales

- ANIMAL 1:N HISTORIAL_ESTADO, ATENCION_SANITARIA, PERMANENCIA_ANIMAL_HOGAR y ADOPCION.
- HOGAR_TEMPORAL 1:N PERMANENCIA_ANIMAL_HOGAR (relación con atributos propios: fechas de ingreso y salida).
- ADOPTANTE 1:N ADOPCION; ADOPCION 1:N SEGUIMIENTO.
- ANIMAL N:M GASTO mediante ANIMAL_GASTO, con monto asignado.
- PROYECTO_ESTERILIZACION 1:N ANIMAL_ESTERILIZACION; ANIMAL_ESTERILIZACION N:M PROFESIONAL mediante ESTERILIZACION_PROFESIONAL, con la función del profesional.
- ARCHIVO se relaciona con cada contexto mediante una tabla de asociación propia; FUNDACION_ARCHIVO marca la documentación general.

### 13.4 Modelo físico (resumen)

Todas las claves primarias de dominio son `BIGINT GENERATED BY DEFAULT AS IDENTITY`; USUARIO usa `UUID` vinculado a Supabase Auth. Las fechas de negocio son `DATE` y los eventos del sistema `TIMESTAMPTZ`.

| Tabla | Columnas principales | Restricciones destacadas |
|---|---|---|
| ANIMAL | id_estado_actual, id_especie, id_rango_etario, nombre, sexo, tamaño, fecha_nacimiento, fecha_rescate, lugar_rescate, caracteristicas, personalidad, historia_rescate, observaciones, microchip, estado_registro_nacional, foto_principal_path, id_carpeta_drive, activo, fecha_registro | microchip UNIQUE y de 15 dígitos; sexo, tamaño y registro nacional con CHECK; nacimiento ≤ rescate. |
| HISTORIAL_ESTADO | id_animal, id_estado, fecha_inicio, fecha_fin, motivo_cambio, observaciones | fin ≥ inicio; un solo historial abierto por animal. |
| ATENCION_SANITARIA | id_animal, id_tipo_atencion, fecha, veterinario, tratamiento, medicamento, proximo_control, observaciones | próximo control ≥ fecha. |
| HOGAR_TEMPORAL | nombre_responsable, telefono, email, direccion, observaciones, activo | — |
| PERMANENCIA_ANIMAL_HOGAR | id_animal, id_hogar, fecha_ingreso, fecha_salida, observaciones | salida ≥ ingreso; una permanencia activa por animal. |
| ADOPTANTE | nombre, rut, telefono, email, direccion, observaciones | rut UNIQUE (normalizado 12345678-9). |
| ADOPCION | id_animal, id_adoptante, id_estado_adopcion, fecha_adopcion, fecha_finalizacion, motivo_finalizacion, observaciones | finalización ≥ adopción; una adopción activa por animal. |
| SEGUIMIENTO | id_adopcion, fecha, medio_contacto, situacion_animal, observaciones | medio de contacto: WhatsApp, Telefono, Correo, Visita u Otro. |
| GASTO | id_categoria_gasto, fecha, descripcion, monto, observaciones | monto > 0. |
| ANIMAL_GASTO | id_animal, id_gasto, monto_asignado | monto > 0; UNIQUE(animal, gasto); suma ≤ total (RPC). |
| PROYECTO_ESTERILIZACION | id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin, responsable, entidad_financiante, descripcion, observaciones, id_carpeta_drive | fin ≥ inicio. |
| ANIMAL_ESTERILIZACION | id_proyecto, id_especie, id_rango_etario, codigo, sexo, fecha_nacimiento, caracteristicas, sector_origen, fecha_esterilizacion, lugar_esterilizacion, microchip, estado_registro_nacional, observaciones | UNIQUE(proyecto, código) y UNIQUE(proyecto, microchip); microchip de 15 dígitos. |
| PROFESIONAL | nombre, profesion, telefono, email, observaciones | Reutilizable entre proyectos. |
| ESTERILIZACION_PROFESIONAL | id_animal_esterilizacion, id_profesional, funcion | UNIQUE(esterilización, profesional). |
| ARCHIVO | id_categoria_archivo, nombre_archivo, nombre_original, mime_type, id_externo, fecha_documento, fecha_carga, descripcion | id_externo (identificador de Drive) UNIQUE. |
| ESTERILIZACION_ARCHIVO | id_animal_esterilizacion, id_archivo | Un documento de esterilización por animal (índice único parcial). |
| USUARIO | id_usuario (UUID de Auth), nombre, activo, fecha_registro | El correo no se duplica: se obtiene de Supabase Auth. |

Los índices únicos parciales garantizan en la propia base de datos las reglas de "un solo registro vigente": `uq_historial_estado_abierto`, `uq_permanencia_animal_activa`, `uq_adopcion_animal_activa` y `uq_esterilizacion_archivo_documento`.

### 13.5 Catálogos iniciales

| Catálogo | Valores |
|---|---|
| ESTADO | Rescatado; En tratamiento; En hogar temporal; Disponible para adopción; Adoptado |
| ESPECIE | Canino; Felino |
| RANGO_ETARIO | Cachorro (0–12 meses); Joven (13–24); Adulto (25–96); Senior (97 o más) |
| TIPO_ATENCION_SANITARIA | Consulta veterinaria; Vacunación; Desparasitación; Esterilización; Cirugía; Control; Examen; Tratamiento |
| ESTADO_ADOPCION | Activa; Finalizada; Devuelto |
| CATEGORIA_GASTO | Veterinario; Medicamentos; Alimentación; Insumos; Transporte; Otros |
| ESTADO_PROYECTO | Postulado; Aprobado; En ejecución; Finalizado; Cancelado |
| CATEGORIA_ARCHIVO | Contrato de adopción; Documento sanitario; Comprobante de gasto; Documento de proyecto; Documento de esterilización; Documento administrativo; Otro |

Los catálogos se administran desde Configuración. Los valores que usan los procesos (por ejemplo, los estados Rescatado, En hogar temporal y Adoptado, o los estados de adopción Activa y Devuelto) están protegidos: solo puede editarse su descripción.

## 14. Reglas de negocio

| ID | Regla | Mecanismo de implementación |
|---|---|---|
| RN-01 | Cada animal rescatado tiene una ficha única. | PK de ANIMAL; microchip único. |
| RN-02 | Los registros se conservan aunque el animal sea adoptado o finalice su proceso. | Sin DELETE; `activo` no representa el proceso. |
| RN-03 | Cada animal mantiene un estado actual. | ANIMAL.id_estado_actual (FK a ESTADO). |
| RN-04 | Cada cambio de estado se conserva en el historial. | HISTORIAL_ESTADO, escrito solo por RPC. |
| RN-05 | Un animal puede registrar múltiples eventos sanitarios. | ANIMAL 1:N ATENCION_SANITARIA. |
| RN-06 | Cada evento sanitario corresponde a un único animal. | FK obligatoria. |
| RN-07 | Un animal puede pasar por distintos hogares temporales. | Historial de permanencias. |
| RN-08 | Un animal solo puede tener un hogar temporal activo. | Índice único parcial `uq_permanencia_animal_activa`. |
| RN-09 | Cada permanencia registra ingreso y, cuando corresponde, salida. | Columnas de fecha con CHECK. |
| RN-10 | Un hogar puede recibir distintos animales en el tiempo. | HOGAR_TEMPORAL 1:N permanencias. |
| RN-11 | Una adopción relaciona un animal con un adoptante identificado. | FK a ANIMAL y ADOPTANTE; RUT obligatorio y único. |
| RN-12 | Los datos del adoptante se usan solo en procesos autorizados. | RLS; exclusión de datos personales en difusión. |
| RN-13 | Una adopción puede tener múltiples seguimientos. | ADOPCION 1:N SEGUIMIENTO. |
| RN-14 | Cada seguimiento conserva sus datos sin sobrescribir los anteriores. | Solo inserción mediante RPC. |
| RN-15 | Los seguimientos se conservan aunque terminen los controles. | Sin DELETE. |
| RN-16 | Si una adopción no continúa, el antecedente se conserva. | Devolución con estado "Devuelto". |
| RN-17 | Un gasto puede ser de un animal, de varios o general. | GASTO + ANIMAL_GASTO opcional. |
| RN-18 | Un animal puede tener múltiples gastos. | Relación N:M. |
| RN-19 | Todo gasto registra fecha, descripción, categoría y monto. | NOT NULL y CHECK. |
| RN-20 | Los documentos se relacionan con distintos contextos. | ARCHIVO + tablas de asociación. |
| RN-21 | Cada animal tiene una fotografía principal optimizada. | Storage: `animales/{id}/principal.webp`. |
| RN-22 | Fotos adicionales, videos y documentos se almacenan en Google Drive. | Edge Function `subir-archivo-drive`. |
| RN-23 | Al registrar un animal se crea su carpeta en Drive; si Drive falla, el animal se conserva y se reintenta. | Edge Function `crear-carpeta-animal` (idempotente) y reintento desde la ficha. |
| RN-24 | Los archivos se cargan desde la interfaz a su carpeta. | Carga multipart a la Edge Function. |
| RN-25 | Todo archivo externo mantiene referencia a su registro. | ARCHIVO.id_externo + asociación. |
| RN-26 | Los archivos se abren en Google Drive. | Edge Function `obtener-link-archivo`. |
| RN-27 | La fotografía se optimiza antes de almacenarse. | Conversión a WebP en el navegador (máx. 1400 px y 2 MB). |
| RN-28 | Los informes usan registros existentes y filtros de la usuaria. | Consultas de solo lectura. |
| RN-29 | La difusión usa solo información autorizada. | Selección explícita de campos. |
| RN-30 | El sistema genera un texto base de difusión. | Plantilla propia. |
| RN-31 | El sistema genera un prompt estructurado y editable. | Plantilla propia, sin llamadas a IA. |
| RN-32 | Todo texto generado puede revisarse y editarse. | Áreas de texto editables. |
| RN-33 | No hay llamadas directas a IA. | Fuera de la arquitectura. |
| RN-34 | No se usa IA para decisiones. | Decisiones humanas. |
| RN-35 | Las usuarias tienen el mismo nivel de acceso. | Sin roles diferenciados. |
| RN-36 | Solo usuarias autenticadas y autorizadas acceden. | Auth + `es_usuario_activo()`. |
| RN-37 | Los datos personales se protegen. | RLS y privilegios mínimos. |
| RN-38 | La información histórica no se elimina físicamente. | Sin DELETE. |
| RN-39 | Sin publicación automática en redes sociales. | Fuera del alcance. |
| RN-40 | Sin generación automática de flyers. | Fuera del alcance. |
| RN-41 | Los proyectos de esterilización se gestionan de forma independiente. | Módulo y tablas propias. |
| RN-42 | Los animales de esterilización no se incorporan como rescatados. | ANIMAL_ESTERILIZACION separada. |
| RN-43 | Un proyecto registra múltiples animales. | Relación 1:N. |
| RN-44 | Cada animal de esterilización conserva su proyecto, fecha y lugar. | FK y columnas propias. |
| RN-45 | Cada esterilización puede tener uno o más profesionales. | ESTERILIZACION_PROFESIONAL. |
| RN-46 | Un profesional puede participar en múltiples esterilizaciones y proyectos. | PROFESIONAL reutilizable. |
| RN-47 | Proyectos y esterilizaciones mantienen documentación. | PROYECTO_ARCHIVO y ESTERILIZACION_ARCHIVO. |
| RN-48 | Los proyectos se conservan al finalizar. | Sin DELETE. |
| RN-49 | Todo animal nuevo comienza en "Rescatado" con su primer historial, en una sola operación. | RPC `registrar_animal`. |
| RN-50 | Todo cambio de estado cierra el historial vigente, abre uno nuevo y actualiza el estado actual como una única operación. | Función interna `_cambiar_estado_animal`. |
| RN-51 | El ingreso a un hogar crea la permanencia y deja el estado "En hogar temporal". | RPC `ingresar_hogar_temporal`. |
| RN-52 | Al finalizar una permanencia se registra la salida y la nueva situación. | RPC `finalizar_hogar_temporal`. |
| RN-53 | El cambio de hogar cierra la permanencia vigente y abre otra, sin cambio de estado artificial. | RPC `cambiar_hogar_temporal`. |
| RN-54 | Registrar una adopción la crea, deja el estado "Adoptado" y cierra el hogar activo. | RPC `registrar_adopcion`. |
| RN-55 | Un seguimiento no puede ser anterior a su adopción. | RPC `registrar_seguimiento`. |
| RN-56 | Una devolución finaliza la adopción como "Devuelto" y define la nueva situación del animal. | RPC `registrar_devolucion`. |
| RN-57 | La suma asignada de un gasto no puede superar su total (la igualdad es válida). | RPC `asignar_gasto_animal`. |
| RN-58 | Todo archivo queda asociado al menos a un contexto. | RPC `registrar_archivo`. |
| RN-59 | Siempre debe quedar al menos una usuaria activa; no hay autodesactivación. | RPC `desactivar_usuario`. |
| RN-60 | Cada proyecto tiene carpeta en Drive con subcarpetas Documentación y Animales. | Edge Function `crear-carpeta-proyecto` (idempotente). |
| RN-61 | El documento de esterilización de cada animal (PDF, JPG, PNG o WebP) se guarda en la subcarpeta Animales como `{código}.{extensión}`; existe uno por animal y no se reemplaza. | Validación del contenido real en `subir-archivo-drive` + índice único. |
| RN-62 | Microchip de 15 dígitos y situación en el Registro Nacional en ambos módulos. | CHECK y UNIQUE (global en ANIMAL; por proyecto en esterilización). |
| RN-63 | Una relación profesional–esterilización puede quitarse si fue ingresada por error, sin eliminar al profesional ni dejar la esterilización sin profesionales. | RPC `quitar_profesional_esterilizacion`. |
| RN-64 | Cada usuaria puede modificar solo su propio nombre; el correo y la contraseña se administran en Supabase Auth. | RPC `actualizar_mi_nombre`; Auth. |
| RN-65 | Desde el navegador solo se escriben directamente las tablas y columnas necesarias; los procesos solo se ejecutan mediante RPC. | Privilegios por tabla y columna (script de seguridad 09). |

## 15. Autenticación y gestión de usuarias

- **Identidad.** Supabase Auth es la única fuente de identidad y credenciales. La tabla `public.usuario` guarda solo el perfil necesario para autorizar (nombre, activo, fecha de registro); el correo se lee desde Auth.
- **Cuentas.** El registro público está deshabilitado. Una usuaria activa invita a otra desde Configuración mediante la Edge Function `invitar-usuario`; la persona invitada recibe un correo y define su contraseña. Un trigger sobre `auth.users` crea automáticamente su perfil.
- **Usuaria activa.** Una sesión válida no basta: el perfil debe estar activo. RLS oculta el perfil de una cuenta inactiva, por lo que la aplicación cierra la sesión e informa que la cuenta no está habilitada. La condición se revalida al navegar (cada cinco minutos) y cuando se renueva el token.
- **Activación y desactivación.** Mediante las RPC `activar_usuario` y `desactivar_usuario`, que impiden la autodesactivación y dejar el sistema sin usuarias activas.
- **Recuperación de contraseña.** "¿Olvidaste tu contraseña?" solicita a Supabase Auth un enlace de un solo uso. El mensaje mostrado es siempre el mismo, exista o no la cuenta, para no revelar correos. El enlace abre "Mi cuenta", donde se define la nueva contraseña.
- **Mi cuenta.** Permite ver el correo, cambiar la contraseña, editar el propio nombre y cerrar sesión.

## 16. Seguridad

### 16.1 Capas de protección

| Medida | Descripción |
|---|---|
| Row Level Security | Habilitado en todas las tablas. Todas las políticas exigen `es_usuario_activo()` y se aplican solo al rol `authenticated`. El rol anónimo no tiene políticas y no obtiene filas. No existen políticas DELETE. |
| Privilegios mínimos | El navegador recibe SELECT y solo la escritura necesaria: INSERT/UPDATE en tablas de datos editables (adoptante, gasto, hogar, atención, profesional, catálogos) y UPDATE por columna donde corresponde (por ejemplo, solo columnas descriptivas de ANIMAL). Historiales, permanencias, adopciones, seguimientos, asignaciones y archivos no tienen escritura directa. |
| RPC seguras | Funciones `SECURITY DEFINER` con `search_path` vacío, que validan primero la usuaria activa y referencian objetos con su esquema. `EXECUTE` revocado a PUBLIC y anónimos. |
| Edge Functions | Verificación del JWT; comprobación de usuaria activa; uso del cliente con privilegios de servicio solo después de verificar. |
| Secretos | La clave de servicio y las credenciales OAuth de Google existen solo como secretos de las Edge Functions. El frontend solo conoce la URL del proyecto y la clave pública (anon/publishable), y se niega a iniciar si recibe una clave de servicio. |
| Archivos | Bucket privado con URLs firmadas temporales. Archivos de Drive privados; nunca "cualquiera con el enlace". El navegador nunca recibe el identificador interno de Drive. |
| Validación de archivos | Tamaño máximo de 10 MB; el documento de esterilización se valida por su contenido real (firma del archivo), no por la extensión. |
| Frontend | Plantillas con escape automático contra XSS; prevención de doble envío; mensajes de error que no exponen detalles técnicos. |
| Despliegue | HTTPS, encabezados `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, política de referencia y `noindex` para buscadores. |

### 16.2 Scripts de refuerzo de seguridad

Tras la implementación inicial del backend (v1.1) se realizaron revisiones de seguridad. Cada corrección se versionó como script en `supabase/security/`, acompañado de un script de verificación que se ejecuta dentro de una transacción revertida y comprueba cada caso.

| Script | Corrección | Verificación |
|---|---|---|
| 01 / 02 | Revocar EXECUTE de funciones a anónimos y PUBLIC; la función interna de estados queda inaccesible desde la API. | 02 |
| 03 / 04 | El cambio manual de estado se rechaza si el animal está en hogar temporal o adoptado; no se puede ingresar a un hogar un animal con adopción activa. Bloqueo de fila para operaciones concurrentes. | 04 |
| 05 / 06 | Un único documento de esterilización por animal (índice único). | 06 |
| 07 / 08 | RPC para quitar relaciones profesional–esterilización, listar usuarias con su correo y editar el propio nombre. | 08 |
| 09 / 10 | Privilegios mínimos por tabla y columna (incidencia S-1: una usuaria activa podía escribir directamente en tablas de proceso omitiendo las RPC). | 10 |

## 17. Funciones del servidor

### 17.1 RPC (funciones PostgreSQL)

| Función | Responsabilidad |
|---|---|
| `registrar_animal` | Crea el animal en estado Rescatado con su primer historial; valida microchip único. |
| `cambiar_estado_animal` | Cambio manual controlado; rechaza estados reservados a procesos y animales en hogar o adoptados. |
| `_cambiar_estado_animal` | Interna: cierra el historial vigente y abre el nuevo. No expuesta. |
| `ingresar_hogar_temporal` / `cambiar_hogar_temporal` / `finalizar_hogar_temporal` | Gestión de permanencias y del estado asociado. |
| `registrar_adopcion` / `registrar_seguimiento` / `registrar_devolucion` | Proceso de adopción completo. |
| `asignar_gasto_animal` | Asignación de gastos con control del total. |
| `registrar_archivo` | Registro de ARCHIVO y su asociación (usada por la Edge Function de carga). |
| `quitar_profesional_esterilizacion` | Quita una relación ingresada por error. |
| `listar_usuarias` / `actualizar_mi_nombre` / `activar_usuario` / `desactivar_usuario` | Gestión de usuarias. |
| `es_usuario_activo` | Base de todas las políticas RLS. |
| `crear_usuario_publico` | Trigger que crea el perfil al invitar una cuenta. |

### 17.2 Edge Functions

| Función | Responsabilidad |
|---|---|
| `crear-carpeta-animal` | Crea o recupera la carpeta del animal en Drive y guarda su identificador. |
| `crear-carpeta-proyecto` | Crea o recupera la carpeta del proyecto con subcarpetas Documentación y Animales. |
| `subir-archivo-drive` | Recibe el archivo, determina la carpeta según el contexto, lo sube a Drive y lo registra con `registrar_archivo`. Si el registro falla, elimina el archivo subido (compensación). |
| `obtener-link-archivo` | Recibe `id_archivo`, verifica la autorización y devuelve el enlace del visor de Drive. |
| `invitar-usuario` | Envía la invitación por correo con la API administrativa de Auth. |

Las funciones de carpetas son idempotentes: si la carpeta ya existe, la recuperan en lugar de crear otra, lo que permite reintentar sin duplicados.

## 18. Almacenamiento

### 18.1 Supabase Storage

Bucket privado `fotos-animales` para la fotografía principal. Ruta: `animales/{id_animal}/principal.webp`. En la base de datos se guarda solo la ruta. Antes de subirla, el navegador convierte la imagen a WebP, limita su lado mayor a 1400 px y reduce la calidad o el tamaño hasta quedar bajo 2 MB. Las imágenes se muestran mediante URLs firmadas que expiran.

### 18.2 Google Drive

Integración mediante Google Drive API y OAuth 2.0 con la cuenta de la Fundación. Estructura:

```
Amor de Cuatro Patas - Sistema/
  Animales/
    {id} - {nombre}/                 archivos del animal y de sus adopciones
  Proyectos de Esterilización/
    {id} - {nombre del proyecto}/
      Documentación/                 documentos del proyecto
      Animales/                      {código}.{ext}: documento de cada esterilización
  Documentación Fundación/           documentos generales
    Gastos/                          comprobantes de gastos
```

Los archivos se abren en el visor nativo de Drive y su acceso depende de los permisos de la cuenta de la Fundación.

## 19. Módulos y procesos

| Módulo | Funcionalidad |
|---|---|
| Panel principal | Indicadores: animales activos (registro activo que no está Adoptado), en tratamiento, en hogar temporal, adoptados y rescatados en el mes. Cada indicador abre Animales con el filtro aplicado. Además, próximos controles sanitarios y hogares ocupados. |
| Animales | Listado en tarjetas o lista, búsqueda por nombre o microchip y filtros por estado, especie, sexo y fecha de rescate (conservados en la URL). Registro con foto opcional. |
| Ficha del animal | Pestañas Resumen, Salud, Hogares, Adopción, Gastos, Archivos, Historial y Difusión. Edición de datos descriptivos, cambio de foto y cambio manual de estado. |
| Estados | El registro inicia en Rescatado. Los estados "En hogar temporal" y "Adoptado" solo se asignan mediante sus procesos. El indicador "Disponible para adopción" que se muestra junto a "En hogar temporal" es solo visual. |
| Salud | Atenciones (tipo, fecha, veterinario, tratamiento, medicamento, próximo control). Registrar una atención no cambia el estado del animal. |
| Hogares temporales | Registro y edición de hogares, animales alojados, historial y asignación. Desde la ficha: ingresar, cambiar de hogar y finalizar la permanencia indicando la nueva situación. |
| Adopciones | Adoptantes (RUT normalizado y validado), registro de adopción desde el módulo o la ficha, seguimientos, devolución y documentos de la adopción. |
| Gastos | Gasto general o asignado total o parcialmente a uno o varios animales, con total, asignado y saldo no asignado; comprobantes en Drive. |
| Proyectos de esterilización | Proyectos con estado y período. Pestañas Información, Nómina, Profesionales (derivados de la nómina) y Documentación. El alta en la nómina registra el animal, sus profesionales con su función y el documento de esterilización. Exportación de la nómina. |
| Documentos | Buscador transversal de todos los archivos con su contexto, filtros y apertura en Drive; carga de documentos generales de la Fundación. |
| Informes | Seis informes: animales, adopciones, atenciones sanitarias, hogares temporales, gastos y esterilizaciones. Cada uno con filtros propios, resumen calculado desde las filas, exportación CSV e impresión. |
| Difusión | Texto base y prompt editables generados desde la ficha (nombre, especie, sexo, edad aproximada o rango etario, tamaño, personalidad, historia y características). Excluye datos personales, microchip y observaciones internas. |
| Configuración | Mi cuenta, Usuarias y Catálogos. |

### 19.1 Operaciones de varios pasos

Algunos procesos no tienen una única transacción en el backend (registrar un animal y luego crear su carpeta y subir su foto; crear un gasto y luego asignarlo; agregar un animal a la nómina con profesionales y documento). La interfaz aplica tres criterios:

1. Todo se valida antes de iniciar, incluido el contenido real del documento.
2. Una vez creado el registro principal, el formulario se reemplaza por un resumen de pasos y ya no puede reenviarse; un fallo secundario se informa como tarea pendiente, sin presentar el proceso como fallido.
3. Los reintentos no duplican: si se pierde la respuesta del servidor, se busca el registro idéntico recién creado y se continúa con él; las relaciones y documentos existentes se omiten.

## 20. Frontend

- **Organización.** `js/core` (servicios transversales), `js/api` (acceso a datos por dominio) y `js/views` (pantallas). La lógica sin dependencias del navegador se separa en `logic.js` para poder probarla con Node.
- **Navegación.** Router por hash con rutas profundas (`#/animales/12/salud`) y filtros en la URL, compatibles con el botón Atrás.
- **Formularios.** Patrón común `bindForm`: se capturan los datos y archivos, se valida y recién entonces se bloquea el botón de envío (nunca los campos), evitando el doble envío.
- **Errores.** Traducción de errores de red, Auth, base de datos (restricciones UNIQUE/CHECK, excepciones de las RPC) y Edge Functions a mensajes comprensibles.
- **Normalización.** Fechas locales sin desfase horario, montos en pesos chilenos, RUT `12345678-9` con dígito verificador y microchip de 15 dígitos.
- **Accesibilidad y uso en celular.** Contraste AA, foco visible y retorno del foco al cerrar modales, enlace "Saltar al contenido", tablas apiladas y filtros plegables en pantallas pequeñas.
- **Identidad visual.** Menú lateral azul petróleo, superficies claras, fucsia de la Fundación como acento y colores semánticos para estados. Existe un espacio reemplazable para el logo oficial, que aún no se ha incorporado.

## 21. Despliegue

El frontend se publica como sitio estático en **Cloudflare Pages**, conectado al repositorio de GitHub de la Fundación:

- directorio raíz `frontend`, sin framework;
- el comando `node tools/write-config.mjs` genera `js/config.js` a partir de las variables de entorno `SUPABASE_URL` y `SUPABASE_ANON_KEY`, y rechaza claves de servicio;
- el archivo `_headers` define los encabezados de seguridad, `noindex` y la política de caché;
- en Supabase, las URL del sitio están autorizadas para las redirecciones de invitación y recuperación de contraseña.

Las Edge Functions se despliegan en Supabase y sus secretos se configuran en el panel de Supabase. Los scripts SQL se ejecutan en el editor SQL de Supabase.

## 22. Pruebas y validación

| Nivel | Qué se verificó |
|---|---|
| Pruebas automáticas | 113 pruebas con `node:test` sobre la lógica del frontend: formato y RUT, errores, router, sesión con cliente simulado, lógica de cada módulo, informes, configuración, generación de la configuración y coherencia entre los permisos del script 09 y las columnas que escribe el frontend. |
| Verificación del backend | Scripts SQL de verificación (02, 04, 06, 08 y 10) que simulan una usuaria activa y el rol anónimo, comprueban cada regla y revierten todos los cambios. |
| Integración | Pruebas contra Supabase y Google Drive reales con registros de prueba identificados. |
| Aceptación | Plan de pruebas de aceptación por módulo, ejecutado sobre el sitio desplegado, incluidos flujos de punta a punta y trece casos de regresión. Resultado: sin defectos funcionales abiertos. |
| Seguridad | Auditoría de acceso anónimo, privilegios de funciones y escritura directa; la incidencia S-1 fue corregida y verificada. |
| Validación manual | Foto tomada desde un celular, apertura de archivos en Drive y descarga de informes. |

El detalle se presenta en `docs/PRUEBAS_Y_VALIDACION.md`.

## 23. Requerimientos recientes de la Fundación

Con posterioridad a la implementación, la Fundación solicitó tres mejoras. A la fecha de este documento **ninguna está implementada**; se registran como trabajo pendiente:

| Requerimiento | Estado |
|---|---|
| Estado de esterilización de los animales | Pendiente. Requiere definir con la Fundación cómo se registra y si modifica el modelo de datos. |
| Actualización de la identidad visual (logo y colores oficiales) | Pendiente. La interfaz ya dispone de un espacio reemplazable para el logo oficial. |
| Importación de la ficha del adoptante | Pendiente. Requiere definir el formato de origen de la ficha. |
