-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Verificación de 2026-09-24_09_restringir_escritura_directa.sql
--
-- NO DEJA CAMBIOS PERSISTENTES: cada prueba se ejecuta en un
-- sub-bloque que termina SIEMPRE en excepción (se revierte).
-- Simula una usuaria autenticada y activa (técnica de los scripts
-- 04 y 08) y el rol anon. Usa registros QA existentes.
--
-- A. Operaciones directas prohibidas → 42501 (permiso denegado).
-- B. Operaciones que el frontend sí necesita → se ejecutan.
-- C. RPC de proceso → siguen funcionando.
--
-- Ejecutar completo en Supabase → SQL Editor. Columna ok = true.
-- ============================================================

DO $qa$
DECLARE
    v_uid       uuid;
    v_auth      text;
    v_cometa    bigint;
    v_hist      bigint;
    v_proy      bigint;
    v_rel       bigint;
    v_adop      bigint;
    v_hogar     bigint;
    v_trat      bigint;
    v_res       jsonb := '[]'::jsonb;
    v_state     text;
    v_msg       text;
    v_rows      bigint;
    t           record;
BEGIN
    SELECT id_usuario INTO v_uid FROM public.usuario WHERE activo ORDER BY fecha_registro LIMIT 1;
    v_auth := json_build_object('sub', v_uid, 'role', 'authenticated')::text;

    SELECT id_animal INTO v_cometa FROM public.animal WHERE nombre = 'Cometa Prueba QA' ORDER BY id_animal LIMIT 1;
    SELECT id_historial_estado INTO v_hist FROM public.historial_estado WHERE id_animal = v_cometa ORDER BY id_historial_estado LIMIT 1;
    SELECT id_proyecto INTO v_proy FROM public.proyecto_esterilizacion WHERE nombre = 'Proyecto Esterilización QA E2E' LIMIT 1;
    SELECT ep.id_esterilizacion_profesional INTO v_rel
        FROM public.esterilizacion_profesional ep JOIN public.animal_esterilizacion ae USING (id_animal_esterilizacion)
        WHERE ae.id_proyecto = v_proy ORDER BY 1 LIMIT 1;
    SELECT a.id_adopcion INTO v_adop FROM public.adopcion a JOIN public.animal an USING (id_animal)
        WHERE an.nombre = 'Estrella Prueba QA' AND a.fecha_finalizacion IS NULL LIMIT 1;
    SELECT id_hogar INTO v_hogar FROM public.hogar_temporal WHERE nombre_responsable = 'Hogar Prueba QA 3' LIMIT 1;
    SELECT id_estado INTO v_trat FROM public.estado WHERE nombre_estado = 'En tratamiento';

    FOR t IN SELECT * FROM (VALUES
        -- A. Prohibidas para una usuaria activa (antes permitidas por RLS)
        ('A', 'authenticated', 'UPDATE estado del animal sin RPC',
            format('UPDATE public.animal SET id_estado_actual = %s WHERE id_animal = %s', v_trat, v_cometa), '42501'),
        ('A', 'authenticated', 'UPDATE animal.activo',
            format('UPDATE public.animal SET activo = activo WHERE id_animal = %s', v_cometa), '42501'),
        ('A', 'authenticated', 'UPDATE animal.id_carpeta_drive',
            format('UPDATE public.animal SET id_carpeta_drive = id_carpeta_drive WHERE id_animal = %s', v_cometa), '42501'),
        ('A', 'authenticated', 'INSERT animal sin registrar_animal',
            'INSERT INTO public.animal (id_estado_actual, id_especie, sexo, fecha_rescate) VALUES (1, 1, ''Macho'', CURRENT_DATE)', '42501'),
        ('A', 'authenticated', 'UPDATE historial_estado',
            format('UPDATE public.historial_estado SET motivo_cambio = motivo_cambio WHERE id_historial_estado = %s', v_hist), '42501'),
        ('A', 'authenticated', 'INSERT historial_estado',
            format('INSERT INTO public.historial_estado (id_animal, id_estado) VALUES (%s, %s)', v_cometa, v_trat), '42501'),
        ('A', 'authenticated', 'INSERT adopcion sin RPC',
            format('INSERT INTO public.adopcion (id_animal, id_adoptante, id_estado_adopcion, fecha_adopcion) VALUES (%s, 3, 1, CURRENT_DATE)', v_cometa), '42501'),
        ('A', 'authenticated', 'UPDATE adopcion',
            format('UPDATE public.adopcion SET observaciones = observaciones WHERE id_adopcion = %s', v_adop), '42501'),
        ('A', 'authenticated', 'INSERT permanencia sin RPC',
            format('INSERT INTO public.permanencia_animal_hogar (id_animal, id_hogar, fecha_ingreso) VALUES (%s, %s, CURRENT_DATE)', v_cometa, v_hogar), '42501'),
        ('A', 'authenticated', 'INSERT seguimiento sin RPC',
            format('INSERT INTO public.seguimiento (id_adopcion, fecha, medio_contacto) VALUES (%s, CURRENT_DATE, ''Otro'')', v_adop), '42501'),
        ('A', 'authenticated', 'INSERT animal_gasto sin RPC',
            format('INSERT INTO public.animal_gasto (id_animal, id_gasto, monto_asignado) VALUES (%s, 9, 1)', v_cometa), '42501'),
        ('A', 'authenticated', 'INSERT archivo sin Edge Function',
            'INSERT INTO public.archivo (id_categoria_archivo, nombre_archivo, id_externo) VALUES (1, ''x'', ''qa-directo'')', '42501'),
        ('A', 'authenticated', 'INSERT esterilizacion_archivo directo',
            'INSERT INTO public.esterilizacion_archivo (id_animal_esterilizacion, id_archivo) VALUES (1, 1)', '42501'),
        ('A', 'authenticated', 'UPDATE usuario directo',
            format('UPDATE public.usuario SET activo = activo WHERE id_usuario = %L', v_uid), '42501'),
        ('A', 'authenticated', 'UPDATE proyecto.id_carpeta_drive',
            format('UPDATE public.proyecto_esterilizacion SET id_carpeta_drive = id_carpeta_drive WHERE id_proyecto = %s', v_proy), '42501'),
        ('A', 'authenticated', 'UPDATE relación: cambiar profesional',
            format('UPDATE public.esterilizacion_profesional SET id_profesional = id_profesional WHERE id_esterilizacion_profesional = %s', v_rel), '42501'),
        ('A', 'authenticated', 'UPDATE nómina: cambiar de proyecto',
            format('UPDATE public.animal_esterilizacion SET id_proyecto = id_proyecto WHERE id_proyecto = %s', v_proy), '42501'),
        ('A', 'authenticated', 'UPDATE nombre de estado (usado por RPC)',
            'UPDATE public.estado SET nombre_estado = nombre_estado WHERE nombre_estado = ''Adoptado''', '42501'),
        ('A', 'authenticated', 'DELETE hogar',
            format('DELETE FROM public.hogar_temporal WHERE id_hogar = %s', v_hogar), '42501'),
        ('A', 'anon', 'anon: INSERT hogar',
            'INSERT INTO public.hogar_temporal (nombre_responsable) VALUES (''anon'')', '42501'),
        ('A', 'anon', 'anon: UPDATE especie',
            'UPDATE public.especie SET descripcion = descripcion', '42501'),

        -- B. Operaciones directas que el frontend necesita
        ('B', 'authenticated', 'UPDATE datos descriptivos del animal',
            format('UPDATE public.animal SET observaciones = observaciones, foto_principal_path = foto_principal_path WHERE id_animal = %s', v_cometa), 'OK'),
        ('B', 'authenticated', 'UPDATE datos del proyecto',
            format('UPDATE public.proyecto_esterilizacion SET nombre = nombre WHERE id_proyecto = %s', v_proy), 'OK'),
        ('B', 'authenticated', 'INSERT proyecto (sin carpeta)',
            'INSERT INTO public.proyecto_esterilizacion (id_estado_proyecto, nombre) VALUES (1, ''Proyecto verificación QA'')', 'OK'),
        ('B', 'authenticated', 'UPDATE función de la relación',
            format('UPDATE public.esterilizacion_profesional SET funcion = funcion WHERE id_esterilizacion_profesional = %s', v_rel), 'OK'),
        ('B', 'authenticated', 'INSERT/UPDATE hogar',
            format('UPDATE public.hogar_temporal SET observaciones = observaciones WHERE id_hogar = %s', v_hogar), 'OK'),
        ('B', 'authenticated', 'UPDATE descripción de estado',
            'UPDATE public.estado SET descripcion = descripcion WHERE nombre_estado = ''Adoptado''', 'OK'),
        ('B', 'authenticated', 'SELECT historial (lectura)',
            format('SELECT 1 FROM public.historial_estado WHERE id_animal = %s', v_cometa), 'OK'),

        -- C. RPC de proceso siguen operativas
        ('C', 'authenticated', 'RPC cambiar_estado_animal',
            format('SELECT public.cambiar_estado_animal(%s, %s, ''Verificación QA'', NULL)', v_cometa, v_trat), 'OK'),
        ('C', 'authenticated', 'RPC registrar_seguimiento',
            format('SELECT public.registrar_seguimiento(%s, CURRENT_DATE, ''Otro'', ''QA'', NULL)', v_adop), 'OK'),
        ('C', 'authenticated', 'RPC ingresar_hogar_temporal',
            format('SELECT public.ingresar_hogar_temporal(%s, %s, CURRENT_DATE, ''QA'')', v_cometa, v_hogar), 'OK'),
        ('C', 'authenticated', 'RPC registrar_archivo (Fundación)',
            'SELECT public.registrar_archivo(1, ''verificacion-qa.pdf'', ''verificacion-qa.pdf'', ''application/pdf'', ''qa-verificacion-09-'' || gen_random_uuid(), NULL, NULL, ''fundacion'', NULL)', 'OK'),
        ('C', 'authenticated', 'RPC registrar_animal',
            'SELECT public.registrar_animal(1, NULL, ''Verificación QA'', ''Macho'', NULL, NULL, CURRENT_DATE, NULL, NULL, NULL, NULL, NULL, NULL, NULL)', 'OK')
        ) AS x(seccion, rol, prueba, sql, esperado)
    LOOP
        BEGIN
            PERFORM set_config('role', t.rol, true);
            PERFORM set_config('request.jwt.claims',
                CASE WHEN t.rol = 'anon' THEN '{"role":"anon"}' ELSE v_auth END, true);
            EXECUTE t.sql;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            RAISE EXCEPTION USING ERRCODE = 'QA000', MESSAGE = format('ejecutada (%s filas)', v_rows);
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg := SQLERRM;
        END;
        v_res := v_res || jsonb_build_object(
            'seccion', t.seccion, 'rol', t.rol, 'prueba', t.prueba,
            'esperado', CASE WHEN t.esperado = 'OK' THEN 'se ejecuta (revertido)' ELSE '42501 permiso denegado' END,
            'obtenido', v_state || ': ' || v_msg,
            'ok', CASE WHEN t.esperado = 'OK' THEN v_state = 'QA000' ELSE v_state = '42501' END);
    END LOOP;

    PERFORM set_config('qa.resultados_09', v_res::text, false);
END
$qa$;

SELECT seccion, rol, prueba, esperado, obtenido, ok FROM (
    SELECT * FROM jsonb_to_recordset(current_setting('qa.resultados_09')::jsonb)
        AS x(seccion text, rol text, prueba text, esperado text, obtenido text, ok boolean)
    UNION ALL
    -- D. Ninguna tabla pública con DELETE/TRUNCATE para anon o authenticated
    SELECT 'D', r.rol, 'Sin DELETE/TRUNCATE en tablas públicas', '0 tablas',
           count(*) FILTER (WHERE has_table_privilege(r.rol, c.oid, 'DELETE') OR has_table_privilege(r.rol, c.oid, 'TRUNCATE'))::text || ' tablas',
           count(*) FILTER (WHERE has_table_privilege(r.rol, c.oid, 'DELETE') OR has_table_privilege(r.rol, c.oid, 'TRUNCATE')) = 0
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rol)
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY r.rol
    UNION ALL
    -- E. RLS sigue habilitada en todas las tablas públicas
    SELECT 'E', '-', 'RLS habilitada en todas las tablas', '0 tablas sin RLS',
           count(*) FILTER (WHERE NOT c.relrowsecurity)::text || ' tablas sin RLS',
           count(*) FILTER (WHERE NOT c.relrowsecurity) = 0
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
) r
ORDER BY seccion, prueba;
