-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Documento principal único por animal de esterilización — 23/09/2026
--
-- Decisión funcional: cada animal de la nómina
-- de un proyecto tiene UN documento de esterilización (PDF, JPG,
-- PNG o WebP). Hasta ahora la unicidad solo se controlaba en la
-- interfaz; dos cargas simultáneas (dos pestañas o un reintento
-- tras perder la respuesta) podían dejar dos documentos.
--
-- Cambio: índice único sobre esterilizacion_archivo
-- (id_animal_esterilizacion). La tabla solo se utiliza para el
-- documento principal de la nómina; los documentos generales del
-- proyecto usan proyecto_archivo y no se ven afectados.
--
-- Complemento (Edge Function subir-archivo-drive, versionada en el
-- repositorio): verifica el tipo real por contenido, rechaza con
-- 409 si ya existe un documento y, si el índice rechaza el registro
-- por una carga simultánea, elimina el archivo recién subido a Drive.
--
-- Cambio COMPATIBLE: no modifica funciones, políticas ni datos.
-- Se detiene sin cambios si ya existieran duplicados.
-- Ejecutar completo en Supabase → SQL Editor.
-- ============================================================

DO $pre$
DECLARE
    v_duplicados integer;
BEGIN
    SELECT count(*) INTO v_duplicados
    FROM (
        SELECT id_animal_esterilizacion
        FROM public.esterilizacion_archivo
        GROUP BY id_animal_esterilizacion
        HAVING count(*) > 1
    ) d;

    IF v_duplicados > 0 THEN
        RAISE EXCEPTION 'Existen % animales de esterilización con más de un documento. Revisar antes de crear el índice.', v_duplicados;
    END IF;
END
$pre$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_esterilizacion_archivo_documento
    ON public.esterilizacion_archivo (id_animal_esterilizacion);

COMMENT ON INDEX public.uq_esterilizacion_archivo_documento IS
    'Un único documento principal (PDF, JPG, PNG o WebP) por animal de esterilización.';
