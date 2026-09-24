-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-23_05_documento_esterilizacion_unico.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: la prueba de inserción duplicada
-- se ejecuta en un sub-bloque que termina SIEMPRE en excepción.
-- Usa un animal de esterilización QA que ya tenga documento
-- (código EST-001 del "Proyecto Esterilización QA").
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

CREATE TEMP TABLE IF NOT EXISTS _verificacion (prueba text, ok boolean, detalle text) ON COMMIT PRESERVE ROWS;
TRUNCATE _verificacion;

INSERT INTO _verificacion
SELECT 'Índice único existe', count(*) = 1, string_agg(indexdef, ' ')
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'uq_esterilizacion_archivo_documento';

INSERT INTO _verificacion
SELECT 'Sin duplicados actuales', count(*) = 0, count(*)::text || ' grupos duplicados'
FROM (SELECT 1 FROM public.esterilizacion_archivo GROUP BY id_animal_esterilizacion HAVING count(*) > 1) d;

DO $qa$
DECLARE
    v_ae      bigint;
    v_archivo bigint;
    v_estado  text;
BEGIN
    SELECT ae.id_animal_esterilizacion INTO v_ae
    FROM public.animal_esterilizacion ae
    JOIN public.proyecto_esterilizacion p ON p.id_proyecto = ae.id_proyecto
    JOIN public.esterilizacion_archivo ea ON ea.id_animal_esterilizacion = ae.id_animal_esterilizacion
    WHERE p.nombre = 'Proyecto Esterilización QA' AND ae.codigo = 'EST-001'
    LIMIT 1;

    IF v_ae IS NULL THEN
        INSERT INTO _verificacion VALUES ('Segundo documento rechazado', NULL, 'No se encontró EST-001 QA con documento');
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.archivo (id_categoria_archivo, nombre_archivo, id_externo)
        SELECT id_categoria_archivo, 'duplicado-qa.pdf', 'qa-verificacion-' || gen_random_uuid()
        FROM public.categoria_archivo WHERE nombre = 'Documento de esterilización'
        RETURNING id_archivo INTO v_archivo;

        INSERT INTO public.esterilizacion_archivo (id_animal_esterilizacion, id_archivo) VALUES (v_ae, v_archivo);
        v_estado := 'ACEPTADO (incorrecto)';
        RAISE EXCEPTION 'revertir';
    EXCEPTION
        WHEN unique_violation THEN v_estado := 'rechazado por índice único';
        WHEN OTHERS THEN IF v_estado IS NULL THEN v_estado := SQLERRM; END IF;
    END;

    INSERT INTO _verificacion VALUES ('Segundo documento rechazado', v_estado = 'rechazado por índice único', v_estado);
END
$qa$;

SELECT * FROM _verificacion;
