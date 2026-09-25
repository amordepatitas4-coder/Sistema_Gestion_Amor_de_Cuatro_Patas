-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-25_11_estado_esterilizacion.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: cada prueba se ejecuta en un
-- sub-bloque que termina SIEMPRE en excepción (se revierte).
-- Simula una usuaria autenticada y activa y el rol anon (misma
-- técnica de los scripts 04, 08 y 10). Usa registros QA.
--
-- A. Edición de la ficha: valores válidos e inválidos.
-- B. registrar_animal: llamada anterior (14 parámetros, como el
--    frontend publicado), con valor explícito y con NULL.
-- C. Permisos: anon no ejecuta ni modifica.
-- D. Estructura: columna, CHECK, valor por defecto, una sola
--    versión de la función y su configuración de seguridad.
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

DO $qa$
DECLARE
    v_uid     uuid;
    v_auth    text;
    v_cometa  bigint;
    v_res     jsonb := '[]'::jsonb;
    v_state   text;
    v_msg     text;
    v_id      bigint;
    v_val     text;
    t         record;
    c_args    constant text := '1, NULL, ''Verificación QA esterilización'', ''Hembra'', NULL, NULL, CURRENT_DATE, NULL, NULL, NULL, NULL, NULL, NULL, NULL';
BEGIN
    SELECT id_usuario INTO v_uid FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;
    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;
    SELECT id_animal INTO v_cometa FROM public.animal WHERE nombre = 'Cometa Prueba QA' ORDER BY id_animal LIMIT 1;

    FOR t IN SELECT * FROM (VALUES
        -- A. Edición desde la ficha
        ('A', 'authenticated', 'UPDATE a Esterilizado',
            format('UPDATE public.animal SET estado_esterilizacion = ''Esterilizado'' WHERE id_animal = %s', v_cometa), 'OK'),
        ('A', 'authenticated', 'UPDATE a No esterilizado',
            format('UPDATE public.animal SET estado_esterilizacion = ''No esterilizado'' WHERE id_animal = %s', v_cometa), 'OK'),
        ('A', 'authenticated', 'UPDATE con valor no permitido',
            format('UPDATE public.animal SET estado_esterilizacion = ''Castrado'' WHERE id_animal = %s', v_cometa), '23514'),
        ('A', 'authenticated', 'UPDATE a NULL',
            format('UPDATE public.animal SET estado_esterilizacion = NULL WHERE id_animal = %s', v_cometa), '23502'),
        ('A', 'authenticated', 'Sigue prohibido cambiar el estado del proceso',
            format('UPDATE public.animal SET id_estado_actual = id_estado_actual WHERE id_animal = %s', v_cometa), '42501'),

        -- B. registrar_animal (el valor guardado se compara con el esperado)
        ('B', 'authenticated', 'Llamada anterior de 14 parámetros → Sin información',
            format('SELECT public.registrar_animal(%s)', c_args), 'VAL:Sin información'),
        ('B', 'authenticated', 'Llamada con nombres (como la API) sin el dato → Sin información',
            'SELECT public.registrar_animal(p_id_especie => 1, p_id_rango_etario => NULL, p_nombre => ''Verificación QA'', p_sexo => ''Macho'', p_tamano => NULL, p_fecha_nacimiento => NULL, p_fecha_rescate => CURRENT_DATE, p_lugar_rescate => NULL, p_caracteristicas => NULL, p_personalidad => NULL, p_historia_rescate => NULL, p_observaciones => NULL, p_microchip => NULL, p_estado_registro_nacional => NULL)',
            'VAL:Sin información'),
        ('B', 'authenticated', 'Con valor Esterilizado',
            format('SELECT public.registrar_animal(%s, ''Esterilizado'')', c_args), 'VAL:Esterilizado'),
        ('B', 'authenticated', 'Con NULL explícito → Sin información',
            format('SELECT public.registrar_animal(%s, NULL)', c_args), 'VAL:Sin información'),
        ('B', 'authenticated', 'Con valor no permitido',
            format('SELECT public.registrar_animal(%s, ''Castrado'')', c_args), '23514'),

        -- C. Rol anónimo
        ('C', 'anon', 'anon: ejecutar registrar_animal',
            format('SELECT public.registrar_animal(%s)', c_args), '42501'),
        ('C', 'anon', 'anon: modificar estado_esterilizacion',
            format('UPDATE public.animal SET estado_esterilizacion = ''Esterilizado'' WHERE id_animal = %s', v_cometa), '42501')
        ) AS x(seccion, rol, prueba, sql, esperado)
    LOOP
        v_val := NULL;
        BEGIN
            PERFORM set_config('role', t.rol, true);
            PERFORM set_config('request.jwt.claims',
                CASE WHEN t.rol = 'anon' THEN '{"role":"anon"}' ELSE v_auth END, true);
            IF t.esperado LIKE 'VAL:%' THEN
                EXECUTE t.sql INTO v_id;
                SELECT estado_esterilizacion INTO v_val FROM public.animal WHERE id_animal = v_id;
                RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'guardado: ' || coalesce(v_val, 'NULL');
            ELSE
                EXECUTE t.sql;
                RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg := SQLERRM;
        END;
        v_res := v_res || jsonb_build_object(
            'seccion', t.seccion, 'rol', t.rol, 'prueba', t.prueba,
            'esperado', CASE WHEN t.esperado = 'OK' THEN 'se ejecuta (revertido)'
                             WHEN t.esperado LIKE 'VAL:%' THEN 'guarda ' || substr(t.esperado, 5) || ' (revertido)'
                             ELSE 'error ' || t.esperado END,
            'obtenido', v_state || ': ' || v_msg,
            'ok', CASE WHEN t.esperado = 'OK' THEN v_state = 'QA000'
                       WHEN t.esperado LIKE 'VAL:%' THEN v_state = 'QA000' AND v_msg = 'guardado: ' || substr(t.esperado, 5)
                       ELSE v_state = t.esperado END);
    END LOOP;

    PERFORM set_config('qa.resultados_11', v_res::text, false);
END
$qa$;

SELECT seccion, rol, prueba, esperado, obtenido, ok FROM (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados_11')::jsonb)
        AS x(seccion text, rol text, prueba text, esperado text, obtenido text, ok boolean)
    UNION ALL
    -- D. Estructura
    SELECT 'D', '-', 'Columna NOT NULL con valor por defecto Sin información',
           'NO / ''Sin información''', is_nullable || ' / ' || coalesce(column_default, 'sin default'),
           is_nullable = 'NO' AND column_default LIKE '''Sin información''%'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'animal' AND column_name = 'estado_esterilizacion'
    UNION ALL
    SELECT 'D', '-', 'CHECK chk_animal_estado_esterilizacion existe', '1', count(*)::text, count(*) = 1
    FROM pg_constraint WHERE conname = 'chk_animal_estado_esterilizacion'
    UNION ALL
    SELECT 'D', '-', 'Animales existentes con valor válido', '0 inválidos',
           count(*) FILTER (WHERE estado_esterilizacion NOT IN ('Esterilizado', 'No esterilizado', 'Sin información'))::text || ' inválidos',
           count(*) FILTER (WHERE estado_esterilizacion NOT IN ('Esterilizado', 'No esterilizado', 'Sin información')) = 0
    FROM public.animal
    UNION ALL
    SELECT 'D', '-', 'Una sola versión de registrar_animal (15 parámetros)', '1 función / 15',
           count(*)::text || ' función / ' || coalesce(max(p.pronargs)::text, '-'),
           count(*) = 1 AND max(p.pronargs) = 15
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registrar_animal'
    UNION ALL
    SELECT 'D', '-', 'registrar_animal: SECURITY DEFINER y search_path vacío', 'true / search_path=""',
           p.prosecdef::text || ' / ' || coalesce(array_to_string(p.proconfig, ','), '-'),
           p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'registrar_animal'
    UNION ALL
    SELECT 'D', r.rol, 'EXECUTE sobre registrar_animal', CASE r.rol WHEN 'anon' THEN 'false' ELSE 'true' END,
           has_function_privilege(r.rol, p.oid, 'EXECUTE')::text,
           has_function_privilege(r.rol, p.oid, 'EXECUTE') = (r.rol <> 'anon')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rol)
    WHERE n.nspname = 'public' AND p.proname = 'registrar_animal'
    UNION ALL
    SELECT 'D', '-', 'RLS sigue habilitada en animal', 'true', c.relrowsecurity::text, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'animal'
) r
ORDER BY seccion, prueba;
