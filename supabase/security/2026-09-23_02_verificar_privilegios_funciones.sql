-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación del parche 2026-09-23_01_restringir_privilegios_funciones.sql
--
-- NO DEJA CAMBIOS PERSISTENTES:
--   * cada prueba se ejecuta en un sub-bloque que termina SIEMPRE
--     con una excepción, por lo que todo lo hecho dentro
--     (cambio de rol, claims, inserciones de prueba) se revierte;
--   * las RPC se invocan con identificadores inexistentes (-1)
--     o parámetros que fallan antes de cualquier INSERT/UPDATE;
--   * la prueba del trigger inserta un usuario ficticio QA en
--     auth.users y lo revierte en el mismo sub-bloque.
--
-- Único efecto de sesión: el parámetro qa.resultados, usado para
-- devolver la tabla final. Desaparece al cerrar la sesión.
--
-- Ejecutar completo en Supabase → SQL Editor (rol postgres).
-- Columna ok: true = resultado esperado; false = revisar.
-- ============================================================

DO $qa$
DECLARE
    v_uid        uuid;
    v_rescatado  bigint;
    v_auth       text;
    v_anon       constant text := '{"role":"anon"}';
    v_res        jsonb := '[]'::jsonb;
    v_state      text;
    v_msg        text;
    v_out        text;
    v_ok         boolean;
    v_newid      uuid;
    v_rol        text;
    t            record;
BEGIN
    -- Datos de apoyo (solo lectura). El UUID no se muestra.
    SELECT id_usuario INTO v_uid
    FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;

    SELECT id_estado INTO v_rescatado
    FROM public.estado WHERE nombre_estado = 'Rescatado';

    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;

    -- --------------------------------------------------------
    -- A. Llamadas bajo rol anon y authenticated
    -- esperado:
    --   SIN_PERMISO  -> SQLSTATE 42501
    --   EJECUTA      -> la función corre (rechazo de negocio)
    --   INTERNA      -> error lanzado dentro de _cambiar_estado_animal
    --   TRUE / CERO / MAYOR_CERO / SIN_ERROR -> valor devuelto
    -- --------------------------------------------------------
    FOR t IN
        SELECT * FROM (VALUES
        -- anon: RPC protegidas
        ('anon', v_anon, '_cambiar_estado_animal',   format('SELECT public._cambiar_estado_animal(-1, %s, NULL, NULL)::text', v_rescatado), 'SIN_PERMISO'),
        ('anon', v_anon, 'cambiar_estado_animal',    format('SELECT public.cambiar_estado_animal(-1, %s, NULL, NULL)::text', v_rescatado), 'SIN_PERMISO'),
        ('anon', v_anon, 'registrar_animal',         'SELECT public.registrar_animal(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'ingresar_hogar_temporal',  'SELECT public.ingresar_hogar_temporal(-1, -1, CURRENT_DATE, NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'cambiar_hogar_temporal',   'SELECT public.cambiar_hogar_temporal(-1, -1, CURRENT_DATE, NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'finalizar_hogar_temporal', format('SELECT public.finalizar_hogar_temporal(-1, CURRENT_DATE, %s, NULL)::text', v_rescatado), 'SIN_PERMISO'),
        ('anon', v_anon, 'registrar_adopcion',       'SELECT public.registrar_adopcion(-1, -1, CURRENT_DATE, NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'registrar_seguimiento',    'SELECT public.registrar_seguimiento(-1, CURRENT_DATE, ''Otro'', NULL, NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'registrar_devolucion',     format('SELECT public.registrar_devolucion(-1, CURRENT_DATE, %s, NULL, NULL)::text', v_rescatado), 'SIN_PERMISO'),
        ('anon', v_anon, 'asignar_gasto_animal',     'SELECT public.asignar_gasto_animal(-1, -1, 1)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'registrar_archivo',        'SELECT public.registrar_archivo(-1, ''qa'', NULL, NULL, ''qa'', NULL, NULL, ''contexto_invalido_qa'', NULL)::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'activar_usuario',          'SELECT public.activar_usuario(''00000000-0000-0000-0000-000000000000'')::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'desactivar_usuario',       'SELECT public.desactivar_usuario(''00000000-0000-0000-0000-000000000000'')::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'es_usuario_activo',        'SELECT public.es_usuario_activo()::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'crear_usuario_publico',    'SELECT public.crear_usuario_publico()::text', 'SIN_PERMISO'),
        ('anon', v_anon, 'SELECT estado (RLS)',      'SELECT count(*)::text FROM public.estado', 'CERO'),

        -- authenticated (usuario activo): acceso conservado
        ('authenticated', v_auth, 'es_usuario_activo',        'SELECT public.es_usuario_activo()::text', 'TRUE'),
        ('authenticated', v_auth, 'SELECT estado (RLS)',      'SELECT count(*)::text FROM public.estado', 'MAYOR_CERO'),
        ('authenticated', v_auth, 'SELECT usuario (RLS)',     'SELECT count(*)::text FROM public.usuario', 'MAYOR_CERO'),
        ('authenticated', v_auth, 'SELECT storage.objects fotos-animales (política Storage)', 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''fotos-animales''', 'SIN_ERROR'),
        ('authenticated', v_auth, '_cambiar_estado_animal directo', format('SELECT public._cambiar_estado_animal(-1, %s, NULL, NULL)::text', v_rescatado), 'SIN_PERMISO'),
        ('authenticated', v_auth, 'cambiar_estado_animal → _cambiar_estado_animal', format('SELECT public.cambiar_estado_animal(-1, %s, NULL, NULL)::text', v_rescatado), 'INTERNA'),
        ('authenticated', v_auth, 'ingresar_hogar_temporal',  'SELECT public.ingresar_hogar_temporal(-1, -1, CURRENT_DATE, NULL)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'cambiar_hogar_temporal',   'SELECT public.cambiar_hogar_temporal(-1, -1, CURRENT_DATE, NULL)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'finalizar_hogar_temporal', format('SELECT public.finalizar_hogar_temporal(-1, CURRENT_DATE, %s, NULL)::text', v_rescatado), 'EJECUTA'),
        ('authenticated', v_auth, 'registrar_adopcion',       'SELECT public.registrar_adopcion(-1, -1, CURRENT_DATE, NULL)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'registrar_seguimiento',    'SELECT public.registrar_seguimiento(-1, CURRENT_DATE, ''Otro'', NULL, NULL)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'registrar_devolucion',     format('SELECT public.registrar_devolucion(-1, CURRENT_DATE, %s, NULL, NULL)::text', v_rescatado), 'EJECUTA'),
        ('authenticated', v_auth, 'asignar_gasto_animal',     'SELECT public.asignar_gasto_animal(-1, -1, 1)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'registrar_archivo',        'SELECT public.registrar_archivo(-1, ''qa'', NULL, NULL, ''qa'', NULL, NULL, ''contexto_invalido_qa'', NULL)::text', 'EJECUTA'),
        ('authenticated', v_auth, 'activar_usuario',          'SELECT public.activar_usuario(''00000000-0000-0000-0000-000000000000'')::text', 'EJECUTA'),
        ('authenticated', v_auth, 'desactivar_usuario',       'SELECT public.desactivar_usuario(''00000000-0000-0000-0000-000000000000'')::text', 'EJECUTA'),
        ('authenticated', v_auth, 'crear_usuario_publico',    'SELECT public.crear_usuario_publico()::text', 'SIN_PERMISO')
        ) AS x(rol, claims, prueba, sql, esperado)
    LOOP
        BEGIN
            PERFORM set_config('role', t.rol, true);
            PERFORM set_config('request.jwt.claims', t.claims, true);
            EXECUTE t.sql INTO v_out;
            -- Forzar reversión de todo lo realizado en el sub-bloque.
            RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = coalesce(v_out, '(sin valor)');
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg   := SQLERRM;
        END;

        v_ok := CASE t.esperado
            WHEN 'SIN_PERMISO' THEN v_state = '42501'
            WHEN 'EJECUTA'     THEN v_state <> '42501'
            WHEN 'INTERNA'     THEN v_state = 'P0001' AND v_msg = 'El animal no existe o se encuentra inactivo.'
            WHEN 'TRUE'        THEN v_state = 'QA000' AND v_msg = 'true'
            WHEN 'CERO'        THEN v_state = 'QA000' AND v_msg = '0'
            WHEN 'MAYOR_CERO'  THEN v_state = 'QA000' AND v_msg ~ '^[1-9][0-9]*$'
            WHEN 'SIN_ERROR'   THEN v_state = 'QA000'
        END;

        v_res := v_res || jsonb_build_object(
            'seccion', 'A. Ejecución como ' || t.rol,
            'prueba', t.prueba,
            'esperado', t.esperado,
            'obtenido', CASE WHEN v_state = 'QA000' THEN 'OK → ' || v_msg
                             ELSE v_state || ': ' || v_msg END,
            'ok', v_ok);
    END LOOP;

    -- --------------------------------------------------------
    -- B. Trigger crear_usuario_publico (inserción QA revertida)
    -- --------------------------------------------------------
    FOREACH v_rol IN ARRAY ARRAY['supabase_auth_admin', 'postgres'] LOOP
        BEGIN
            v_newid := gen_random_uuid();
            PERFORM set_config('role', v_rol, true);
            INSERT INTO auth.users (id, instance_id, aud, role, email,
                                    raw_user_meta_data, created_at, updated_at)
            VALUES (v_newid, '00000000-0000-0000-0000-000000000000',
                    'authenticated', 'authenticated',
                    'qa.trigger.prueba@example.invalid',
                    '{"nombre":"Usuario Prueba QA"}'::jsonb, now(), now());
            PERFORM set_config('role', 'postgres', true);
            SELECT nombre INTO v_out FROM public.usuario WHERE id_usuario = v_newid;
            RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = coalesce(v_out, '(perfil NO creado)');
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg   := SQLERRM;
        END;

        v_res := v_res || jsonb_build_object(
            'seccion', 'B. Trigger auth.users (revertido)',
            'prueba', 'INSERT auth.users como ' || v_rol,
            'esperado', 'perfil "Usuario Prueba QA" creado',
            'obtenido', CASE WHEN v_state = 'QA000' THEN 'OK → ' || v_msg
                             ELSE v_state || ': ' || v_msg END,
            -- NULL = no verificable desde SQL Editor (el rol postgres
            -- no puede adoptar ese rol o no puede insertar en auth.users);
            -- en ese caso se valida con una invitación QA real.
            'ok', CASE WHEN v_state = '42501' THEN NULL
                       ELSE v_state = 'QA000' AND v_msg = 'Usuario Prueba QA' END);
    END LOOP;

    PERFORM set_config('qa.resultados', v_res::text, false);
END
$qa$;


-- ============================================================
-- Resultado único: pruebas + privilegios efectivos + defaults
-- ============================================================
WITH fn AS (
    SELECT p.proname,
           p.oid,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec,
           has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
),
privilegios AS (
    SELECT 'C. Privilegios efectivos' AS seccion,
           proname AS prueba,
           CASE WHEN proname IN ('_cambiar_estado_animal', 'crear_usuario_publico')
                THEN 'public=f anon=f auth=f'
                ELSE 'public=f anon=f auth=t' END AS esperado,
           format('public=%s anon=%s auth=%s',
                  left(public_exec::text,1), left(anon_exec::text,1), left(auth_exec::text,1)) AS obtenido,
           (NOT public_exec AND NOT anon_exec AND
            auth_exec = (proname NOT IN ('_cambiar_estado_animal', 'crear_usuario_publico'))) AS ok
    FROM fn
    UNION ALL
    SELECT 'C. Privilegios efectivos', 'crear_usuario_publico → supabase_auth_admin',
           'true',
           has_function_privilege('supabase_auth_admin', 'public.crear_usuario_publico()', 'EXECUTE')::text,
           has_function_privilege('supabase_auth_admin', 'public.crear_usuario_publico()', 'EXECUTE')
),
defaults AS (
    SELECT 'D. Privilegios por defecto (funciones)' AS seccion,
           format('rol %s, esquema %s', pg_get_userbyid(d.defaclrole),
                  coalesce(n.nspname, '(global)')) AS prueba,
           CASE WHEN pg_get_userbyid(d.defaclrole) = 'postgres'
                THEN 'sin PUBLIC ni anon' ELSE 'administrado por Supabase' END AS esperado,
           d.defaclacl::text AS obtenido,
           CASE WHEN pg_get_userbyid(d.defaclrole) = 'postgres'
                THEN d.defaclacl::text !~ '(^\{|,)=X/' AND d.defaclacl::text !~ '(^\{|,)anon=X'
                ELSE NULL END AS ok
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclobjtype = 'f' AND (d.defaclnamespace = 0 OR n.nspname = 'public')
),
cuentas AS (
    SELECT 'E. Cuentas (informativo)' AS seccion,
           'auth.users total / sin invitación / public.usuario activos' AS prueba,
           'revisar que todas sean cuentas autorizadas' AS esperado,
           format('%s / %s / %s',
                  (SELECT count(*) FROM auth.users),
                  (SELECT count(*) FROM auth.users WHERE invited_at IS NULL),
                  (SELECT count(*) FROM public.usuario WHERE activo)) AS obtenido,
           NULL::boolean AS ok
),
pruebas AS (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados')::jsonb)
        AS x(seccion text, prueba text, esperado text, obtenido text, ok boolean)
)
SELECT seccion, prueba, esperado, obtenido, ok
FROM (
    SELECT * FROM pruebas
    UNION ALL SELECT * FROM privilegios
    UNION ALL SELECT * FROM defaults
    UNION ALL SELECT * FROM cuentas
) r
ORDER BY seccion, prueba;
