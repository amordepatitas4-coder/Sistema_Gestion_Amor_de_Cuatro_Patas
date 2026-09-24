-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Corrección S-1 (QA Etapa 13) — 24/09/2026
--
-- Problema: las tablas tenían GRANT ALL para anon y authenticated, y
-- las políticas RLS permitían INSERT/UPDATE a toda usuaria activa. Por
-- la API se podían saltar las reglas de las RPC (cambiar estados sin
-- historial, editar el historial, crear adopciones o permanencias sin
-- validaciones, reasignar carpetas de Drive, etc.).
--
-- Corrección: privilegios mínimos por tabla y por columna. La RLS
-- existente NO se modifica (sigue exigiendo usuaria activa).
--
--   anon ............ solo SELECT (RLS devuelve vacío); sin escrituras.
--   authenticated ... SELECT en todo; escritura directa solo donde el
--                     frontend la necesita y solo en esas columnas.
--                     Nunca DELETE ni TRUNCATE.
--
-- Las operaciones de proceso siguen funcionando porque se realizan con
-- RPC SECURITY DEFINER (dueño postgres) o con Edge Functions que usan
-- service_role en el servidor (carpetas Drive) / registrar_archivo.
-- service_role y postgres no se modifican.
--
-- Idempotente. No modifica datos. Ejecutar completo en SQL Editor.
-- Verificación: 2026-09-24_10_verificar_escritura_directa.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Punto de partida común: sin privilegios para anon/authenticated
-- ------------------------------------------------------------
REVOKE ALL ON TABLE
    public.adopcion, public.adopcion_archivo, public.adoptante, public.animal,
    public.animal_archivo, public.animal_esterilizacion, public.animal_gasto,
    public.archivo, public.atencion_sanitaria, public.categoria_archivo,
    public.categoria_gasto, public.especie, public.estado, public.estado_adopcion,
    public.estado_proyecto, public.esterilizacion_archivo, public.esterilizacion_profesional,
    public.fundacion_archivo, public.gasto, public.gasto_archivo, public.historial_estado,
    public.hogar_temporal, public.permanencia_animal_hogar, public.profesional,
    public.proyecto_archivo, public.proyecto_esterilizacion, public.rango_etario,
    public.seguimiento, public.tipo_atencion_sanitaria, public.usuario
FROM anon, authenticated;

-- ------------------------------------------------------------
-- 1. Lectura (RLS decide qué filas: usuaria activa)
-- ------------------------------------------------------------
GRANT SELECT ON TABLE
    public.adopcion, public.adopcion_archivo, public.adoptante, public.animal,
    public.animal_archivo, public.animal_esterilizacion, public.animal_gasto,
    public.archivo, public.atencion_sanitaria, public.categoria_archivo,
    public.categoria_gasto, public.especie, public.estado, public.estado_adopcion,
    public.estado_proyecto, public.esterilizacion_archivo, public.esterilizacion_profesional,
    public.fundacion_archivo, public.gasto, public.gasto_archivo, public.historial_estado,
    public.hogar_temporal, public.permanencia_animal_hogar, public.profesional,
    public.proyecto_archivo, public.proyecto_esterilizacion, public.rango_etario,
    public.seguimiento, public.tipo_atencion_sanitaria, public.usuario
TO anon, authenticated;

-- ------------------------------------------------------------
-- 2. Tablas de proceso: SOLO lectura directa.
--    historial_estado, permanencia_animal_hogar, adopcion, seguimiento,
--    animal_gasto, archivo y tablas *_archivo, usuario
--    → se escriben únicamente mediante RPC / Edge Functions.
--    (sin GRANT adicional)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Registros operativos editables por completo (sin DELETE)
-- ------------------------------------------------------------
GRANT INSERT, UPDATE ON TABLE
    public.adoptante, public.gasto, public.atencion_sanitaria, public.hogar_temporal,
    public.profesional
TO authenticated;

-- Catálogos administrables desde Configuración (activar/desactivar, sin DELETE)
GRANT INSERT, UPDATE ON TABLE
    public.especie, public.rango_etario, public.tipo_atencion_sanitaria,
    public.categoria_gasto, public.estado_proyecto, public.categoria_archivo
TO authenticated;

-- Catálogos con significado de proceso (las RPC usan sus nombres):
-- solo se edita la descripción; no se agregan ni renombran ni desactivan.
GRANT UPDATE (descripcion) ON TABLE public.estado, public.estado_adopcion TO authenticated;

-- ------------------------------------------------------------
-- 4. Permisos por columna
-- ------------------------------------------------------------

-- ANIMAL: alta solo con registrar_animal; estado solo con RPC;
-- activo e id_carpeta_drive no se editan desde el cliente.
GRANT UPDATE (
    nombre, id_especie, id_rango_etario, sexo, "tamaño", fecha_nacimiento,
    fecha_rescate, lugar_rescate, caracteristicas, personalidad, historia_rescate,
    observaciones, microchip, estado_registro_nacional, foto_principal_path
) ON TABLE public.animal TO authenticated;

-- PROYECTO: id_carpeta_drive solo lo escribe crear-carpeta-proyecto.
GRANT INSERT (
    id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin,
    responsable, entidad_financiante, descripcion, observaciones
) ON TABLE public.proyecto_esterilizacion TO authenticated;
GRANT UPDATE (
    id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin,
    responsable, entidad_financiante, descripcion, observaciones
) ON TABLE public.proyecto_esterilizacion TO authenticated;

-- NÓMINA: el animal no cambia de proyecto después del alta.
GRANT INSERT (
    id_proyecto, codigo, id_especie, id_rango_etario, sexo, fecha_nacimiento,
    caracteristicas, sector_origen, fecha_esterilizacion, lugar_esterilizacion,
    microchip, estado_registro_nacional, observaciones
) ON TABLE public.animal_esterilizacion TO authenticated;
GRANT UPDATE (
    codigo, id_especie, id_rango_etario, sexo, fecha_nacimiento, caracteristicas,
    sector_origen, fecha_esterilizacion, lugar_esterilizacion, microchip,
    estado_registro_nacional, observaciones
) ON TABLE public.animal_esterilizacion TO authenticated;

-- RELACIÓN PROFESIONAL: se crea con sus tres datos; luego solo se corrige
-- la función (quitar = RPC quitar_profesional_esterilizacion).
GRANT INSERT (id_animal_esterilizacion, id_profesional, funcion)
    ON TABLE public.esterilizacion_profesional TO authenticated;
GRANT UPDATE (funcion) ON TABLE public.esterilizacion_profesional TO authenticated;

COMMIT;
