# CLAUDE.md

# Sistema Web de Gestión de Rescate y Adopción Animal --- Fundación Amor de Cuatro Patas

Este archivo contiene las reglas permanentes de trabajo para Claude Code
dentro de este repositorio.

## 1. Alcance del proyecto

Este repositorio corresponde al MVP interno del Sistema Web de Gestión
de Rescate y Adopción Animal de la Fundación Amor de Cuatro Patas.

Estructura principal:

-   `frontend/`: aplicación web cliente.
-   `supabase/`: backend v1.1, esquema, seeds, infraestructura y Edge
    Functions.
-   `docs/`: documentación oficial y criterios de aceptación.

Antes de realizar cualquier trabajo relevante, consultar:

1.  `docs/Ficha_Maestra_Interna_23-09-2026_v7.docx`
2.  `docs/PROMPT_MAESTRO_FRONTEND.md`
3.  `docs/PLAN_PRUEBAS_ACEPTACION.md`

Orden de autoridad ante contradicciones:

1.  Backend v1.1 real.
2.  Ficha Maestra v7.
3.  PROMPT_MAESTRO_FRONTEND.md.
4.  PLAN_PRUEBAS_ACEPTACION.md.
5.  Frontend existente únicamente como referencia cuando corresponda.

Si existe una contradicción real entre estas fuentes, no improvisar ni
modificar el backend para ocultarla. Informarla y esperar decisión.

------------------------------------------------------------------------

## 2. Regla de trabajo por etapas

No implementar todo el sistema de una vez.

La secuencia general es:

1.  Analizar.
2.  Informar hallazgos.
3.  Proponer plan.
4.  Esperar autorización.
5.  Implementar una etapa.
6.  Revisar y probar esa etapa.
7.  Informar cambios y resultados.
8.  Esperar autorización para continuar cuando se haya solicitado
    revisión.

### Primera sesión obligatoria

La primera tarea es exclusivamente de análisis.

No modificar archivos.

Debes:

-   estudiar la documentación;
-   inspeccionar frontend y backend;
-   identificar tablas, RPC, Edge Functions, RLS, Storage y contratos;
-   identificar inconsistencias;
-   presentar plan por etapas;
-   presentar matriz funcionalidad → backend;
-   indicar preguntas realmente bloqueantes.

Esperar autorización explícita antes de comenzar la implementación.

------------------------------------------------------------------------

## 3. Límite del entorno local

Trabaja exclusivamente dentro del directorio raíz de este repositorio.

No:

-   navegues por carpetas personales ajenas al proyecto;
-   busques archivos fuera del repositorio;
-   inspecciones Documentos, Escritorio, Descargas, OneDrive u otras
    carpetas personales salvo autorización explícita;
-   realices búsquedas globales en el computador;
-   copies información del proyecto a ubicaciones externas sin
    autorización.

Si una tarea parece requerir acceso fuera del repositorio, detenerse y
solicitar autorización.

------------------------------------------------------------------------

## 4. Secretos y configuración sensible

No busques credenciales ni secretos.

No leas, muestres, copies, registres, imprimas ni incluyas en commits el
contenido de archivos de configuración sensibles salvo autorización
expresa para una etapa de integración.

En particular:

-   `frontend/js/config.js`
-   `.env`
-   `.env.*`
-   credenciales OAuth;
-   Google client secrets;
-   Google refresh tokens;
-   contraseñas;
-   Supabase `service_role`;
-   cualquier secreto de Edge Functions.

`frontend/js/config.js` está ignorado por Git y debe continuar así.

Puedes utilizar `frontend/js/config.example.js` para comprender la
estructura esperada.

### Cuando llegue la etapa de pruebas reales

No asumas autorización para leer configuración real solo porque el
archivo exista.

Antes de realizar pruebas conectadas a Supabase o Google Drive:

1.  informa exactamente qué necesitas probar;
2.  indica qué configuración necesita utilizar el proceso;
3.  espera autorización explícita;
4.  utiliza únicamente el mínimo acceso necesario;
5.  no imprimas valores sensibles;
6.  no los copies a documentación, código versionado ni commits.

Nunca colocar `service_role` en el frontend.

------------------------------------------------------------------------

## 5. Backend protegido

El backend v1.1 es la fuente técnica de verdad y se considera estable.

No modificar sin autorización explícita:

-   `schema.sql`;
-   `seed.sql`;
-   `infrastructure.sql`;
-   `supabase/config.toml`;
-   Edge Functions;
-   tablas;
-   constraints;
-   triggers;
-   RPC;
-   RLS;
-   Storage policies;
-   permisos;
-   datos reales.

Si el frontend no funciona contra el backend:

1.  diagnosticar;
2.  identificar contrato real;
3.  comparar con documentación;
4.  informar causa;
5.  proponer solución;
6.  esperar autorización antes de modificar backend.

No adaptar el backend automáticamente a un error del frontend.

------------------------------------------------------------------------

## 6. Base de datos y servicios reales

Hasta autorización expresa, tratar Supabase y Google Drive como
servicios de producción/proyecto real.

No ejecutar sin autorización:

-   migraciones;
-   `db reset`;
-   `db push`;
-   comandos destructivos;
-   SQL de modificación masiva;
-   DELETE;
-   TRUNCATE;
-   DROP;
-   cambios de RLS;
-   cambios de permisos;
-   cambios de Storage;
-   despliegues de Edge Functions;
-   creación masiva de datos;
-   invitaciones reales de usuarios;
-   modificaciones de archivos Drive.

Para pruebas reales, usar datos QA claramente identificados y seguir
`PLAN_PRUEBAS_ACEPTACION.md`.

------------------------------------------------------------------------

## 7. Git y GitHub

Trabajar en la rama asignada para reconstrucción del frontend,
preferentemente:

`frontend-rebuild`

No:

-   trabajar directamente sobre `master` para implementación;
-   hacer `push` sin autorización;
-   hacer `force push`;
-   reescribir historial;
-   borrar ramas;
-   ejecutar `reset --hard`;
-   limpiar archivos no rastreados de forma destructiva;
-   modificar `.gitignore` para incluir secretos.

Antes de cada commit, revisar que no existan secretos.

Los commits deben ser pequeños, coherentes y describir la etapa
realizada.

Si no se ha autorizado realizar commits automáticamente, dejar los
cambios preparados e informar qué debería confirmarse.

------------------------------------------------------------------------

## 8. Frontend

El frontend debe reconstruirse de forma limpia contra el backend
existente.

No parchear ciegamente regresiones de versiones experimentales.

Principios obligatorios:

-   utilizar RPC cuando la regla de negocio ya existe en backend;
-   no reproducir manualmente transacciones críticas en JavaScript;
-   no inventar tablas, campos, estados o relaciones;
-   no usar eliminación física de históricos;
-   no utilizar localStorage como fuente de verdad;
-   respetar RLS;
-   no abrir acceso a `anon`;
-   no duplicar email de Auth en `public.usuario`;
-   no tratar `ANIMAL.activo` como estado del proceso;
-   no cambiar `activo=false` al adoptar;
-   no introducir funcionalidades fuera del MVP.

Consultar el detalle funcional y visual completo en
`docs/PROMPT_MAESTRO_FRONTEND.md`.

------------------------------------------------------------------------

## 9. Formularios y operaciones asíncronas

Regla obligatoria para todos los formularios:

1.  prevenir submit normal;
2.  capturar valores, `FormData` y archivos;
3.  validar;
4.  conservar en variables los datos necesarios;
5.  recién entonces marcar el formulario como ocupado;
6.  bloquear el botón de envío;
7.  ejecutar la operación;
8.  procesar resultado;
9.  restaurar estado o cerrar formulario.

No deshabilitar inputs antes de construir `FormData`.

Evitar doble submit en todas las operaciones creadoras.

Si una operación principal fue exitosa y una operación secundaria falla,
no presentar todo el proceso como fallido si eso puede inducir a crear
duplicados.

Ejemplo: animal creado + fotografía fallida = el animal sigue creado.

------------------------------------------------------------------------

## 10. Integración y pruebas

No afirmar "funciona" únicamente porque:

-   el código compila;
-   no existen errores de sintaxis;
-   una función parece correcta por inspección.

Diferenciar siempre:

-   revisión estática;
-   prueba local;
-   prueba contra Supabase;
-   prueba contra Google Drive;
-   prueba manual pendiente de la usuaria.

Al finalizar cada etapa, indicar los IDs de pruebas aplicables de:

`docs/PLAN_PRUEBAS_ACEPTACION.md`

No cambiar los resultados esperados de las pruebas para hacer coincidir
una implementación incorrecta.

------------------------------------------------------------------------

## 11. Datos de prueba

Cuando se autoricen pruebas reales:

-   utilizar registros QA identificables;
-   evitar datos personales reales;
-   no eliminar históricos reales;
-   no mezclar pruebas con información real cuando pueda evitarse;
-   documentar los registros creados.

Ejemplos:

-   `Luna Prueba QA`
-   `Hogar Prueba QA`
-   `Proyecto Esterilización QA`
-   `Veterinario Prueba QA`

Para microchip de prueba, usar únicamente un valor ficticio acordado
para QA y claramente documentado.

------------------------------------------------------------------------

## 12. Google Drive

No cambiar permisos de archivos o carpetas a "cualquiera con el enlace".

No inspeccionar archivos personales de Google Drive fuera de la
estructura creada para el sistema.

La estructura funcional esperada se encuentra en el Prompt Maestro.

No modificar OAuth, tokens o secretos sin autorización.

------------------------------------------------------------------------

## 13. Acciones que requieren autorización previa

Solicitar autorización antes de:

-   comenzar implementación después del análisis inicial;
-   modificar backend;
-   modificar esquema de BD;
-   ejecutar migraciones;
-   ejecutar SQL de escritura manual;
-   conectarse para realizar pruebas que creen/modifiquen datos reales;
-   utilizar configuración sensible local;
-   desplegar Edge Functions;
-   cambiar RLS/permisos;
-   cambiar configuración Storage;
-   modificar Google Drive;
-   invitar usuarios;
-   instalar nuevas dependencias importantes;
-   cambiar arquitectura o stack;
-   hacer push;
-   realizar acciones Git destructivas;
-   acceder fuera del repositorio.

Si existe duda sobre si una acción puede ser destructiva o exponer
información, detenerse y preguntar.

------------------------------------------------------------------------

## 14. Acciones normalmente permitidas durante implementación autorizada

Dentro de una etapa de frontend previamente autorizada puedes:

-   leer documentación del repositorio;
-   inspeccionar código del proyecto;
-   crear/editar HTML, CSS y JavaScript del frontend;
-   ejecutar verificaciones estáticas no destructivas;
-   revisar `git diff`;
-   proponer cambios;
-   crear documentación técnica solicitada.

La autorización para una etapa no implica autorización automática para
backend, servicios reales, secretos, push o acciones destructivas.

------------------------------------------------------------------------

## 15. Comunicación después de cada etapa

Entregar un resumen con:

### Cambios realizados

Archivos creados/modificados.

### Integración

Tablas/RPC/Edge Functions involucradas.

### Pruebas realizadas

Qué se verificó realmente.

### Pruebas pendientes

IDs del Plan de Pruebas que requieren ejecución real/manual.

### Riesgos o incidencias

Problemas detectados y causa probable.

### Siguiente etapa propuesta

No continuar automáticamente si se pidió revisión previa.

------------------------------------------------------------------------

## 16. Regla ante errores

No aplicar parches sucesivos sin identificar la causa raíz.

Ante un error:

1.  reproducir;
2.  identificar capa responsable;
3.  inspeccionar contrato real;
4.  explicar causa;
5.  proponer corrección mínima y coherente;
6.  comprobar regresiones relacionadas.

Especial atención a las regresiones `REG-01` a `REG-13` del Plan de
Pruebas.

------------------------------------------------------------------------

## 17. Funcionalidades fuera de alcance

No implementar sin nueva decisión:

-   portal público;
-   app móvil nativa;
-   postulaciones;
-   cuestionarios;
-   scoring/ranking de adoptantes;
-   donaciones;
-   inventario;
-   tienda;
-   contabilidad completa;
-   API de IA;
-   flyers automáticos;
-   publicación automática en redes sociales;
-   metas/cupos de esterilización;
-   sistema veterinario clínico completo.

------------------------------------------------------------------------

## 18. Regla final

La prioridad es preservar:

1.  seguridad;
2.  trazabilidad histórica;
3.  contrato real del backend;
4.  requerimientos validados;
5.  consistencia funcional;
6.  experiencia de usuario.

Ante incertidumbre:

**inspeccionar → explicar → proponer → solicitar autorización →
modificar → probar.**

No asumir permiso por conveniencia técnica.
