# Backend — Supabase

Esta carpeta contiene la definición del backend: base de datos PostgreSQL, seguridad, almacenamiento y funciones del servidor. No incluye secretos ni datos reales.

| Archivo o carpeta | Contenido |
|---|---|
| `schema.sql` | Esquema completo del esquema `public`: funciones RPC, 30 tablas, restricciones, índices, políticas RLS y permisos. Refleja el estado final del backend. |
| `seed.sql` | Catálogos iniciales (estados, especies, rangos etarios, tipos de atención, estados de adopción y de proyecto, categorías de gasto y de archivo). |
| `infrastructure.sql` | Objetos administrados por Supabase fuera de `public`: trigger sobre `auth.users` que crea el perfil de cada usuaria y bucket privado `fotos-animales` con sus políticas. |
| `functions/` | Edge Functions (Deno/TypeScript): `crear-carpeta-animal`, `crear-carpeta-proyecto`, `subir-archivo-drive`, `obtener-link-archivo` e `invitar-usuario`. |
| `security/` | Scripts de cambios y refuerzos de seguridad aplicados sobre el proyecto (01, 03, 05, 07, 09, 11) y sus scripts de verificación (02, 04, 06, 08, 10, 12). |
| `config.toml` | Configuración de Supabase CLI para desarrollo local (sin secretos; el registro público está deshabilitado). |

## Principios de diseño

- **Seguridad en la base de datos.** RLS está habilitado en todas las tablas y todas las políticas exigen `es_usuario_activo()`. El rol anónimo no obtiene filas y no existen políticas de eliminación.
- **Reglas de negocio en RPC.** Los procesos que modifican varias tablas (registrar un animal, cambiar su estado, ingresar o cambiar de hogar, adoptar, devolver, asignar gastos, registrar archivos, gestionar usuarias) son funciones `SECURITY DEFINER` transaccionales que validan primero a la usuaria.
- **Privilegios mínimos.** El navegador solo puede escribir directamente en las tablas y columnas que lo requieren; las tablas de proceso son de solo lectura para él.
- **Trazabilidad.** Los registros no se eliminan: se cierran por fecha o se desactivan.
- **Credenciales fuera del cliente.** Las operaciones con Google Drive y la invitación de usuarias se ejecutan en Edge Functions, donde residen los secretos.

## Scripts de seguridad

Cada script de refuerzo va acompañado de un script de verificación que simula a una usuaria activa y al rol anónimo, comprueba cada caso y revierte todos los cambios. Los scripts se ejecutan completos en el editor SQL de Supabase.

| Refuerzo | Verificación | Tema |
|---|---|---|
| `2026-09-23_01_restringir_privilegios_funciones.sql` | `…_02_verificar_privilegios_funciones.sql` | Ejecución de funciones solo para usuarias autenticadas. |
| `2026-09-23_03_reforzar_procesos_estado_hogar.sql` | `…_04_verificar_procesos_estado_hogar.sql` | Coherencia entre estados, hogares y adopciones. |
| `2026-09-23_05_documento_esterilizacion_unico.sql` | `…_06_verificar_documento_esterilizacion.sql` | Un documento de esterilización por animal. |
| `2026-09-23_07_profesionales_y_usuarias.sql` | `…_08_verificar_profesionales_y_usuarias.sql` | Relaciones con profesionales y gestión de usuarias. |
| `2026-09-24_09_restringir_escritura_directa.sql` | `…_10_verificar_escritura_directa.sql` | Privilegios mínimos por tabla y columna. |
| `2026-09-25_11_estado_esterilizacion.sql` | `…_12_verificar_estado_esterilizacion.sql` | Estado de esterilización del animal rescatado. |

## Instalación en un proyecto nuevo

En el editor SQL de Supabase se ejecutan, en orden, `schema.sql`, `seed.sql` e `infrastructure.sql`. `schema.sql` ya refleja el estado final, por lo que los scripts de `security/` no necesitan aplicarse; sus scripts de verificación sirven para comprobar la instalación. Las Edge Functions se despliegan con la verificación de JWT habilitada y sus credenciales se configuran como secretos del proyecto, nunca en el repositorio.
