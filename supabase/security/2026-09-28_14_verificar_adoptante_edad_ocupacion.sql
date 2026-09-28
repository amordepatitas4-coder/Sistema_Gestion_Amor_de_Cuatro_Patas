-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-28_13_adoptante_edad_ocupacion.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: cada prueba se ejecuta en un
-- sub-bloque que termina SIEMPRE en excepción (se revierte).
-- Simula una usuaria autenticada y activa y el rol anon (misma
-- técnica de los scripts 04, 08, 10 y 12). Usa el adoptante QA.
--
-- A. Edición y registro: valores válidos e inválidos.
-- B. El RUT sigue siendo obligatorio y único.
-- C. Permisos: anon no modifica.
-- D. Estructura: columnas, CHECK, RUT y RLS.
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

DO $qa$
DECLARE
    v_uid     uuid;
    v_auth    text;
    v_qa      bigint;
    v_rut_qa  text;
    v_res     jsonb := '[]'::jsonb;
    v_state   text;
    v_msg     text;
    t         record;
BEGIN
    SELECT id_usuario INTO v_uid FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;
    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;
    SELECT id_adoptante, rut INTO v_qa, v_rut_qa
    FROM public.adoptante WHERE nombre = 'Adoptante Prueba QA' ORDER BY id_adoptante LIMIT 1;

    FOR t IN SELECT * FROM (VALUES
        -- A. Edición y registro
        ('A', 'authenticated', 'UPDATE edad 34 y ocupación',
            format('UPDATE public.adoptante SET edad = 34, ocupacion = ''Independiente'' WHERE id_adoptante = %s', v_qa), 'OK'),
        ('A', 'authenticated', 'UPDATE edad en el límite (18)',
            format('UPDATE public.adoptante SET edad = 18 WHERE id_adoptante = %s', v_qa), 'OK'),
        ('A', 'authenticated', 'UPDATE edad menor de edad (17)',
            format('UPDATE public.adoptante SET edad = 17 WHERE id_adoptante = %s', v_qa), '23514'),
        ('A', 'authenticated', 'UPDATE edad fuera de rango (111)',
            format('UPDATE public.adoptante SET edad = 111 WHERE id_adoptante = %s', v_qa), '23514'),
        ('A', 'authenticated', 'UPDATE edad y ocupación vacías (NULL)',
            format('UPDATE public.adoptante SET edad = NULL, ocupacion = NULL WHERE id_adoptante = %s', v_qa), 'OK'),
        ('A', 'authenticated', 'UPDATE ocupación de más de 100 caracteres',
            format('UPDATE public.adoptante SET ocupacion = repeat(''x'', 101) WHERE id_adoptante = %s', v_qa), '22001'),
        ('A', 'authenticated', 'INSERT con edad y ocupación',
            'INSERT INTO public.adoptante (nombre, rut, edad, ocupacion) VALUES (''Verificación QA 14'', ''QA-14'', 40, ''Docente'')', 'OK'),

        -- B. RUT
        ('B', 'authenticated', 'INSERT sin RUT',
            'INSERT INTO public.adoptante (nombre, edad) VALUES (''Verificación QA 14'', 40)', '23502'),
        ('B', 'authenticated', 'INSERT con RUT ya registrado',
            format('INSERT INTO public.adoptante (nombre, rut) VALUES (''Verificación QA 14'', %L)', v_rut_qa), '23505'),

        -- C. Rol anónimo
        ('C', 'anon', 'anon: modificar edad',
            format('UPDATE public.adoptante SET edad = 30 WHERE id_adoptante = %s', v_qa), '42501'),
        ('C', 'anon', 'anon: registrar adoptante',
            'INSERT INTO public.adoptante (nombre, rut, edad) VALUES (''Verificación QA 14'', ''QA-14'', 40)', '42501')
        ) AS x(seccion, rol, prueba, sql, esperado)
    LOOP
        BEGIN
            PERFORM set_config('role', t.rol, true);
            PERFORM set_config('request.jwt.claims',
                CASE WHEN t.rol = 'anon' THEN '{"role":"anon"}' ELSE v_auth END, true);
            EXECUTE t.sql;
            RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada';
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg := SQLERRM;
        END;
        v_res := v_res || jsonb_build_object(
            'seccion', t.seccion, 'rol', t.rol, 'prueba', t.prueba,
            'esperado', CASE WHEN t.esperado = 'OK' THEN 'se ejecuta (revertido)' ELSE 'error ' || t.esperado END,
            'obtenido', v_state || ': ' || v_msg,
            'ok', CASE WHEN t.esperado = 'OK' THEN v_state = 'QA000' ELSE v_state = t.esperado END);
    END LOOP;

    PERFORM set_config('qa.resultados_13', v_res::text, false);
END
$qa$;

SELECT seccion, rol, prueba, esperado, obtenido, ok FROM (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados_13')::jsonb)
        AS x(seccion text, rol text, prueba text, esperado text, obtenido text, ok boolean)
    UNION ALL
    -- D. Estructura
    SELECT 'D', '-', 'Columna edad: smallint opcional', 'smallint / YES',
           data_type || ' / ' || is_nullable, data_type = 'smallint' AND is_nullable = 'YES'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'adoptante' AND column_name = 'edad'
    UNION ALL
    SELECT 'D', '-', 'Columna ocupacion: varchar(100) opcional', 'character varying(100) / YES',
           data_type || '(' || character_maximum_length || ') / ' || is_nullable,
           data_type = 'character varying' AND character_maximum_length = 100 AND is_nullable = 'YES'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'adoptante' AND column_name = 'ocupacion'
    UNION ALL
    SELECT 'D', '-', 'CHECK chk_adoptante_edad existe', '1', count(*)::text, count(*) = 1
    FROM pg_constraint WHERE conname = 'chk_adoptante_edad'
    UNION ALL
    SELECT 'D', '-', 'RUT sigue obligatorio', 'NO', is_nullable, is_nullable = 'NO'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'adoptante' AND column_name = 'rut'
    UNION ALL
    SELECT 'D', '-', 'UNIQUE uq_adoptante_rut existe', '1', count(*)::text, count(*) = 1
    FROM pg_constraint WHERE conname = 'uq_adoptante_rut'
    UNION ALL
    SELECT 'D', '-', 'Adoptantes existentes con edad válida', '0 inválidos',
           count(*) FILTER (WHERE edad IS NOT NULL AND edad NOT BETWEEN 18 AND 110)::text || ' inválidos',
           count(*) FILTER (WHERE edad IS NOT NULL AND edad NOT BETWEEN 18 AND 110) = 0
    FROM public.adoptante
    UNION ALL
    SELECT 'D', '-', 'RLS sigue habilitada en adoptante', 'true', c.relrowsecurity::text, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'adoptante'
) r
ORDER BY seccion, prueba;
