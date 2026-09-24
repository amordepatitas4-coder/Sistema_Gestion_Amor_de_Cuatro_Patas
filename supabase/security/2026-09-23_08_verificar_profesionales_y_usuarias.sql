-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-23_07_profesionales_y_usuarias.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: cada prueba se ejecuta en un
-- sub-bloque que termina SIEMPRE en excepción (se revierte).
-- Simula una usuaria autenticada y activa (misma técnica que el
-- script 04) y, cuando corresponde, el rol anon.
--
-- Usa registros QA: EST-003 del "Proyecto Esterilización QA" y
-- EST-001 del "Proyecto Esterilización QA 2" (un profesional).
-- A1 no depende de cuántos profesionales tenga EST-003: agrega una
-- asociación temporal dentro de la misma prueba (revertida) y la quita.
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

DO $qa$
DECLARE
    v_uid      uuid;
    v_auth     text;
    v_rel      bigint;   -- asociación temporal a quitar (A1)
    v_prof     bigint;   -- profesional no asociado a EST-003
    v_ae       bigint;   -- EST-003
    v_base     bigint;   -- asociaciones de EST-003 antes de la prueba
    v_unica    bigint;   -- relación única (EST-001 del proyecto QA 2)
    v_res      jsonb := '[]'::jsonb;
    v_state    text;
    v_msg      text;
    v_n1       bigint;
    v_n2       bigint;
    v_n3       bigint;
BEGIN
    SELECT id_usuario INTO v_uid FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;
    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;

    SELECT ae.id_animal_esterilizacion INTO v_ae
    FROM public.animal_esterilizacion ae JOIN public.proyecto_esterilizacion p USING (id_proyecto)
    WHERE p.nombre = 'Proyecto Esterilización QA' AND ae.codigo = 'EST-003';

    SELECT count(*) INTO v_base FROM public.esterilizacion_profesional WHERE id_animal_esterilizacion = v_ae;

    SELECT pr.id_profesional INTO v_prof
    FROM public.profesional pr
    WHERE NOT EXISTS (SELECT 1 FROM public.esterilizacion_profesional ep
                      WHERE ep.id_animal_esterilizacion = v_ae AND ep.id_profesional = pr.id_profesional)
    ORDER BY pr.id_profesional LIMIT 1;

    SELECT ep.id_esterilizacion_profesional INTO v_unica
    FROM public.esterilizacion_profesional ep
    JOIN public.animal_esterilizacion ae USING (id_animal_esterilizacion)
    JOIN public.proyecto_esterilizacion p USING (id_proyecto)
    WHERE p.nombre = 'Proyecto Esterilización QA 2' AND ae.codigo = 'EST-001';

    -- A1. Quitar una asociación válida: solo desaparece esa relación.
    --     Se crea una asociación temporal (revertida al final del bloque).
    BEGIN
        INSERT INTO public.esterilizacion_profesional (id_animal_esterilizacion, id_profesional, funcion)
        VALUES (v_ae, v_prof, 'Asociación temporal QA')
        RETURNING id_esterilizacion_profesional INTO v_rel;
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        PERFORM public.quitar_profesional_esterilizacion(v_rel);
        PERFORM set_config('role', 'postgres', true);
        SELECT count(*) INTO v_n1 FROM public.esterilizacion_profesional WHERE id_esterilizacion_profesional = v_rel;
        SELECT count(*) INTO v_n2 FROM public.profesional WHERE id_profesional = v_prof;
        SELECT count(*) INTO v_n3 FROM public.esterilizacion_profesional WHERE id_animal_esterilizacion = v_ae;
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('relación=%s profesional=%s restantes=%s', v_n1, v_n2, v_n3);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'A1. Quitar asociación (EST-003, asociación temporal)',
        'esperado', format('relación=0 profesional=1 restantes=%s', v_base),
        'obtenido', v_state || ': ' || v_msg,
        'ok', v_state = 'QA000' AND v_msg = format('relación=0 profesional=1 restantes=%s', v_base));

    -- A2. No permite quitar al último profesional del animal.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        PERFORM public.quitar_profesional_esterilizacion(v_unica);
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'eliminada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'A2. Último profesional', 'esperado', 'rechazo P0001',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'P0001' AND v_msg LIKE 'No es posible quitar al último profesional%');

    -- A3. Asociación inexistente.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        PERFORM public.quitar_profesional_esterilizacion(-1);
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'A3. Asociación inexistente', 'esperado', 'La asociación indicada no existe.',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'P0001' AND v_msg = 'La asociación indicada no existe.');

    -- A4. Corregir la función por la política UPDATE existente.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        UPDATE public.esterilizacion_profesional SET funcion = 'Función QA corregida' WHERE id_esterilizacion_profesional = v_unica;
        GET DIAGNOSTICS v_n1 = ROW_COUNT;
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('filas=%s', v_n1);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'A4. Corregir función (UPDATE vía RLS)', 'esperado', 'filas=1',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'QA000' AND v_msg = 'filas=1');

    -- A5. DELETE directo sigue sin estar permitido (RLS sin política DELETE).
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        DELETE FROM public.esterilizacion_profesional WHERE id_esterilizacion_profesional = v_unica;   -- relación real existente
        GET DIAGNOSTICS v_n1 = ROW_COUNT;
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('filas=%s', v_n1);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'A5. DELETE directo desde el cliente', 'esperado', 'filas=0 (bloqueado por RLS)',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'QA000' AND v_msg = 'filas=0');

    -- B1. listar_usuarias como usuaria activa: todas con correo.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        SELECT count(*), count(email) INTO v_n1, v_n2 FROM public.listar_usuarias();
        PERFORM set_config('role', 'postgres', true);
        SELECT count(*) INTO v_n3 FROM public.usuario;
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('filas=%s correos=%s usuarias=%s', v_n1, v_n2, v_n3);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'B1. listar_usuarias (activa)', 'esperado', 'filas = correos = usuarias',
        'obtenido', v_state || ': ' || v_msg,
        'ok', v_state = 'QA000' AND v_msg = format('filas=%s correos=%s usuarias=%s', v_n3, v_n3, v_n3));

    -- B2. anon no puede ejecutar listar_usuarias.
    BEGIN
        PERFORM set_config('role', 'anon', true);
        PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        PERFORM * FROM public.listar_usuarias();
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'B2. listar_usuarias como anon', 'esperado', '42501 permiso denegado',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = '42501');

    -- B3. Usuario autenticado sin perfil activo es rechazado.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
        PERFORM * FROM public.listar_usuarias();
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'B3. listar_usuarias sin usuaria activa', 'esperado', 'Usuario no autorizado o inactivo.',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'P0001' AND v_msg = 'Usuario no autorizado o inactivo.');

    -- C1. actualizar_mi_nombre cambia solo el propio nombre.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        PERFORM public.actualizar_mi_nombre('  Nombre   Prueba QA  ');
        PERFORM set_config('role', 'postgres', true);
        SELECT count(*) INTO v_n1 FROM public.usuario WHERE id_usuario = v_uid AND nombre = 'Nombre Prueba QA';
        SELECT count(*) INTO v_n2 FROM public.usuario WHERE nombre = 'Nombre Prueba QA';
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('propia=%s total=%s', v_n1, v_n2);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'C1. actualizar_mi_nombre (normaliza espacios)', 'esperado', 'propia=1 total=1',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'QA000' AND v_msg = 'propia=1 total=1');

    -- C2. Nombre demasiado corto.
    BEGIN
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', v_auth, true);
        PERFORM public.actualizar_mi_nombre(' a ');
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'C2. Nombre demasiado corto', 'esperado', 'rechazo P0001',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = 'P0001');

    -- C3. anon no puede ejecutar actualizar_mi_nombre.
    BEGIN
        PERFORM set_config('role', 'anon', true);
        PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        PERFORM public.actualizar_mi_nombre('Intento anon');
        RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = 'ejecutada (incorrecto)';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('prueba', 'C3. actualizar_mi_nombre como anon', 'esperado', '42501 permiso denegado',
        'obtenido', v_state || ': ' || v_msg, 'ok', v_state = '42501');

    PERFORM set_config('qa.resultados_07', v_res::text, false);
END
$qa$;

WITH fn AS (
    SELECT p.proname, p.prosecdef, p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('quitar_profesional_esterilizacion', 'listar_usuarias', 'actualizar_mi_nombre')
)
SELECT prueba, esperado, obtenido, ok FROM (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados_07')::jsonb)
        AS x(prueba text, esperado text, obtenido text, ok boolean)
    UNION ALL
    SELECT 'D. Privilegios: ' || proname, 'SECURITY DEFINER, search_path vacío, anon=f, auth=t',
           format('definer=%s config=%s anon=%s auth=%s', prosecdef, proconfig, anon_exec, auth_exec),
           prosecdef AND proconfig = ARRAY['search_path=""'] AND NOT anon_exec AND auth_exec
    FROM fn
    UNION ALL
    SELECT 'D. Sin política DELETE en esterilizacion_profesional', '0 políticas DELETE',
           count(*)::text || ' políticas DELETE', count(*) = 0
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'esterilizacion_profesional' AND cmd = 'DELETE'
) r;
