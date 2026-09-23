-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-23_03_reforzar_procesos_estado_hogar.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: cada prueba se ejecuta en un
-- sub-bloque que termina SIEMPRE en excepción, revirtiendo todo
-- (incluidos los cambios de estado y permanencias de prueba).
-- Único efecto secundario posible: consumo de valores de secuencia
-- (IDs) en las pruebas que sí deben ejecutarse correctamente.
--
-- Utiliza registros QA existentes:
--   Luna Prueba QA (sin procesos abiertos), Sol Prueba QA (con
--   hogar temporal activo), Hogar Prueba QA y el animal que tenga
--   una adopción activa (si existe).
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

DO $qa$
DECLARE
    v_uid        uuid;
    v_auth       text;
    v_luna       bigint;
    v_sol        bigint;
    v_adoptado   bigint;
    v_hogar      bigint;
    v_rescatado  bigint;
    v_trat       bigint;
    v_disp       bigint;
    v_res        jsonb := '[]'::jsonb;
    v_state      text;
    v_msg        text;
    v_out        text;
    t            record;
BEGIN
    SELECT id_usuario INTO v_uid FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;
    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;

    SELECT id_animal INTO v_luna FROM public.animal WHERE nombre = 'Luna Prueba QA' ORDER BY id_animal LIMIT 1;
    SELECT id_animal INTO v_sol FROM public.animal WHERE nombre = 'Sol Prueba QA' ORDER BY id_animal LIMIT 1;
    SELECT id_animal INTO v_adoptado FROM public.adopcion WHERE fecha_finalizacion IS NULL ORDER BY id_adopcion LIMIT 1;
    SELECT id_hogar INTO v_hogar FROM public.hogar_temporal WHERE nombre_responsable = 'Hogar Prueba QA' LIMIT 1;
    SELECT id_estado INTO v_rescatado FROM public.estado WHERE nombre_estado = 'Rescatado';
    SELECT id_estado INTO v_trat FROM public.estado WHERE nombre_estado = 'En tratamiento';
    SELECT id_estado INTO v_disp FROM public.estado WHERE nombre_estado = 'Disponible para adopción';

    FOR t IN
        SELECT * FROM (VALUES
        -- Refuerzos (deben rechazar)
        ('Cambio manual con hogar temporal activo (Sol)',
         format('SELECT public.cambiar_estado_animal(%s, %s, ''QA'', NULL)::text', v_sol, v_rescatado),
         'RECHAZO', 'El animal tiene un hogar temporal activo. Para cambiar su situación debe finalizarse la permanencia.'),
        ('Cambio manual con adopción activa',
         format('SELECT public.cambiar_estado_animal(%s, %s, ''QA'', NULL)::text', v_adoptado, v_rescatado),
         'RECHAZO', 'El animal tiene una adopción activa. Para cambiar su situación debe registrarse la devolución.'),
        ('Ingreso a hogar con adopción activa',
         format('SELECT public.ingresar_hogar_temporal(%s, %s, CURRENT_DATE, ''QA'')::text', v_adoptado, v_hogar),
         'RECHAZO', 'El animal tiene una adopción activa. No puede ingresar a un hogar temporal mientras la adopción esté vigente.'),
        -- Regresiones (deben seguir funcionando; se revierten)
        ('Cambio manual válido (Luna, sin procesos abiertos)',
         format('SELECT public.cambiar_estado_animal(%s, %s, ''QA'', NULL)::text', v_luna, v_trat),
         'EJECUTA', NULL),
        ('Ingreso a hogar válido (Luna)',
         format('SELECT public.ingresar_hogar_temporal(%s, %s, CURRENT_DATE, ''QA'')::text', v_luna, v_hogar),
         'EJECUTA', NULL),
        ('Finalizar hogar sigue cambiando estado (Sol)',
         format('SELECT public.finalizar_hogar_temporal(%s, CURRENT_DATE, %s, ''QA'')::text', v_sol, v_disp),
         'EJECUTA', NULL),
        ('Estado reservado sigue rechazado',
         format('SELECT public.cambiar_estado_animal(%s, (SELECT id_estado FROM public.estado WHERE nombre_estado = ''Adoptado''), ''QA'', NULL)::text', v_luna),
         'RECHAZO', 'El estado Adoptado no puede asignarse manualmente.'),
        ('Doble hogar activo sigue rechazado (Sol)',
         format('SELECT public.ingresar_hogar_temporal(%s, %s, CURRENT_DATE, ''QA'')::text', v_sol, v_hogar),
         'RECHAZO', 'El animal ya posee un hogar temporal activo.')
        ) AS x(prueba, sql, esperado, mensaje)
    LOOP
        IF t.sql IS NULL THEN
            v_res := v_res || jsonb_build_object('seccion', 'A. Reglas', 'prueba', t.prueba,
                'esperado', t.esperado, 'obtenido', 'NO EJECUTADA: faltan datos QA o adopción activa', 'ok', NULL);
            CONTINUE;
        END IF;
        BEGIN
            PERFORM set_config('role', 'authenticated', true);
            PERFORM set_config('request.jwt.claims', v_auth, true);
            EXECUTE t.sql INTO v_out;
            RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = coalesce(v_out, '(sin valor)');
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg := SQLERRM;
        END;
        v_res := v_res || jsonb_build_object(
            'seccion', 'A. Reglas',
            'prueba', t.prueba,
            'esperado', CASE WHEN t.esperado = 'EJECUTA' THEN 'se ejecuta (revertido)' ELSE t.mensaje END,
            'obtenido', CASE WHEN v_state = 'QA000' THEN 'OK → ' || v_msg ELSE v_state || ': ' || v_msg END,
            'ok', CASE WHEN t.esperado = 'EJECUTA' THEN v_state = 'QA000'
                       ELSE v_state = 'P0001' AND v_msg = t.mensaje END);
    END LOOP;

    PERFORM set_config('qa.resultados_03', v_res::text, false);
END
$qa$;

WITH fn AS (
    SELECT p.proname, p.oid, p.prosecdef, p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('cambiar_estado_animal', 'ingresar_hogar_temporal')
)
SELECT seccion, prueba, esperado, obtenido, ok FROM (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados_03')::jsonb)
        AS x(seccion text, prueba text, esperado text, obtenido text, ok boolean)
    UNION ALL
    SELECT 'B. Contrato y privilegios', proname,
           'SECURITY DEFINER, search_path vacío, anon=f, auth=t',
           format('definer=%s config=%s anon=%s auth=%s', prosecdef, proconfig, anon_exec, auth_exec),
           prosecdef AND proconfig = ARRAY['search_path=""'] AND NOT anon_exec AND auth_exec
    FROM fn
) r
ORDER BY seccion, prueba;
