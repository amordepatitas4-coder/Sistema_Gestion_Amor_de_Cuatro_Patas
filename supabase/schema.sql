


-- Esquema de la base de datos (volcado de Supabase, backend v1.1 + scripts de seguridad).
-- Orden: funciones (RPC) → tablas → claves y restricciones → índices → políticas RLS → permisos.
-- Todas las RPC son SECURITY DEFINER con search_path vacío: se ejecutan con permisos del dueño,
-- validan primero que la usuaria esté activa y referencian objetos con su esquema (public.x).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






-- Función interna (prefijo "_"): cierra el historial vigente y abre uno nuevo. No se expone al
-- navegador; la usan las RPC de procesos (hogar, adopción, devolución) y cambiar_estado_animal.
CREATE OR REPLACE FUNCTION "public"."_cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_estado_actual BIGINT;
    v_id_historial_actual BIGINT;
BEGIN

    -- 1. Obtener el estado actual del animal.
    SELECT id_estado_actual
    INTO v_id_estado_actual
    FROM public.animal
    WHERE id_animal = p_id_animal
      AND activo = TRUE
    FOR UPDATE;

    IF v_id_estado_actual IS NULL THEN
        RAISE EXCEPTION 'El animal no existe o se encuentra inactivo.';
    END IF;


    -- 2. Verificar que el nuevo estado exista y esté activo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.estado
        WHERE id_estado = p_id_nuevo_estado
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION 'El estado solicitado no existe o se encuentra inactivo.';
    END IF;


    -- 3. No tiene sentido cambiar al mismo estado.
    IF v_id_estado_actual = p_id_nuevo_estado THEN
        RAISE EXCEPTION 'El animal ya se encuentra en el estado solicitado.';
    END IF;


    -- 4. Localizar el historial actualmente abierto.
    SELECT id_historial_estado
    INTO v_id_historial_actual
    FROM public.historial_estado
    WHERE id_animal = p_id_animal
      AND fecha_fin IS NULL
    FOR UPDATE;

    IF v_id_historial_actual IS NULL THEN
        RAISE EXCEPTION
            'El animal no posee un historial de estado abierto.';
    END IF;


    -- 5. Cerrar el historial anterior.
    UPDATE public.historial_estado
    SET fecha_fin = CURRENT_TIMESTAMP
    WHERE id_historial_estado = v_id_historial_actual;


    -- 6. Crear el nuevo historial.
    INSERT INTO public.historial_estado (
        id_animal,
        id_estado,
        fecha_inicio,
        motivo_cambio,
        observaciones
    )
    VALUES (
        p_id_animal,
        p_id_nuevo_estado,
        CURRENT_TIMESTAMP,
        p_motivo_cambio,
        p_observaciones
    );


    -- 7. Actualizar el estado actual de la ficha.
    UPDATE public.animal
    SET id_estado_actual = p_id_nuevo_estado
    WHERE id_animal = p_id_animal;

END;
$$;


ALTER FUNCTION "public"."_cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") OWNER TO "postgres";


-- RPC de administración de usuarias: reactiva una cuenta (activo = true).
CREATE OR REPLACE FUNCTION "public"."activar_usuario"("p_id_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN

    -- Verificar usuario autenticado y activo.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION
            'Usuario no autorizado o inactivo.';
    END IF;


    -- Verificar existencia.
    IF NOT EXISTS (
        SELECT 1
        FROM public.usuario
        WHERE id_usuario = p_id_usuario
    ) THEN
        RAISE EXCEPTION
            'El usuario indicado no existe.';
    END IF;


    -- Reactivar usuario.
    UPDATE public.usuario
    SET activo = TRUE
    WHERE id_usuario = p_id_usuario;

END;
$$;


ALTER FUNCTION "public"."activar_usuario"("p_id_usuario" "uuid") OWNER TO "postgres";


-- RPC: la usuaria cambia solo su propio nombre (auth.uid()); public.usuario no tiene UPDATE directo.
CREATE OR REPLACE FUNCTION "public".actualizar_mi_nombre(p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    IF char_length(v_nombre) < 2 THEN
        RAISE EXCEPTION 'El nombre debe tener al menos 2 caracteres.';
    END IF;

    IF char_length(v_nombre) > 150 THEN
        RAISE EXCEPTION 'El nombre no puede superar los 150 caracteres.';
    END IF;

    UPDATE public.usuario
    SET nombre = v_nombre
    WHERE id_usuario = auth.uid();
END;
$$;


ALTER FUNCTION "public"."actualizar_mi_nombre"("p_nombre" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."actualizar_mi_nombre"("p_nombre" "text") IS 'La usuaria activa actualiza solo su propio nombre en public.usuario.';


-- RPC: asigna parte de un gasto a un animal validando que la suma no supere el total (RN-57).
CREATE OR REPLACE FUNCTION "public"."asignar_gasto_animal"("p_id_gasto" bigint, "p_id_animal" bigint, "p_monto_asignado" bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
    v_monto_gasto BIGINT;
    v_total_asignado BIGINT;
    v_id_animal_gasto BIGINT;
BEGIN

    -- Verificar usuario autenticado y activo.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;


    -- El monto asignado debe ser positivo.
    IF p_monto_asignado <= 0 THEN
        RAISE EXCEPTION
            'El monto asignado debe ser mayor que cero.';
    END IF;


    -- Obtener y bloquear el gasto durante la operación.
    SELECT monto
    INTO v_monto_gasto
    FROM public.gasto
    WHERE id_gasto = p_id_gasto
    FOR UPDATE;


    IF v_monto_gasto IS NULL THEN
        RAISE EXCEPTION
            'El gasto indicado no existe.';
    END IF;


    -- Verificar que el animal exista y esté activo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.animal
        WHERE id_animal = p_id_animal
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION
            'El animal no existe o se encuentra inactivo.';
    END IF;


    -- Un mismo gasto no debe asignarse dos veces
    -- al mismo animal.
    IF EXISTS (
        SELECT 1
        FROM public.animal_gasto
        WHERE id_gasto = p_id_gasto
          AND id_animal = p_id_animal
    ) THEN
        RAISE EXCEPTION
            'El gasto ya posee una asignación para este animal.';
    END IF;


    -- Calcular cuánto del gasto ya se encuentra asignado.
    SELECT COALESCE(SUM(monto_asignado), 0)
    INTO v_total_asignado
    FROM public.animal_gasto
    WHERE id_gasto = p_id_gasto;


    -- RN-57:
    -- Las asignaciones no pueden superar el gasto total.
    IF v_total_asignado + p_monto_asignado > v_monto_gasto THEN
        RAISE EXCEPTION
            'La asignación supera el monto total del gasto. Disponible: $%',
            v_monto_gasto - v_total_asignado;
    END IF;


    -- Crear asociación gasto-animal.
    INSERT INTO public.animal_gasto (
        id_animal,
        id_gasto,
        monto_asignado
    )
    VALUES (
        p_id_animal,
        p_id_gasto,
        p_monto_asignado
    )
    RETURNING id_animal_gasto
    INTO v_id_animal_gasto;


    RETURN v_id_animal_gasto;

END;
$_$;


ALTER FUNCTION "public"."asignar_gasto_animal"("p_id_gasto" bigint, "p_id_animal" bigint, "p_monto_asignado" bigint) OWNER TO "postgres";


-- RPC de cambio manual de estado. Rechaza estados reservados a procesos y animales con
-- permanencia o adopción activa (refuerzo del script de seguridad 03).
CREATE OR REPLACE FUNCTION "public"."cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_nombre_nuevo_estado VARCHAR(50);
BEGIN

    -- 1. Solo una usuaria autenticada y activa
    --    puede ejecutar esta operación.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;


    -- 2. Obtener el nombre del estado solicitado.
    SELECT nombre_estado
    INTO v_nombre_nuevo_estado
    FROM public.estado
    WHERE id_estado = p_id_nuevo_estado
      AND activo = TRUE;

    IF v_nombre_nuevo_estado IS NULL THEN
        RAISE EXCEPTION
            'El estado solicitado no existe o se encuentra inactivo.';
    END IF;


    -- 3. Estos estados dependen de procesos específicos.
    IF v_nombre_nuevo_estado IN (
        'En hogar temporal',
        'Adoptado'
    ) THEN
        RAISE EXCEPTION
            'El estado % no puede asignarse manualmente.',
            v_nombre_nuevo_estado;
    END IF;


    -- 4. Bloquear el animal para serializar operaciones
    --    concurrentes sobre su situación.
    PERFORM 1
    FROM public.animal
    WHERE id_animal = p_id_animal
    FOR UPDATE;


    -- 5. Un cambio manual no puede dejar procesos abiertos:
    --    la salida de un hogar temporal o de una adopción
    --    se registra mediante su propio proceso.
    IF EXISTS (
        SELECT 1
        FROM public.permanencia_animal_hogar
        WHERE id_animal = p_id_animal
          AND fecha_salida IS NULL
    ) THEN
        RAISE EXCEPTION
            'El animal tiene un hogar temporal activo. Para cambiar su situación debe finalizarse la permanencia.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.adopcion
        WHERE id_animal = p_id_animal
          AND fecha_finalizacion IS NULL
    ) THEN
        RAISE EXCEPTION
            'El animal tiene una adopción activa. Para cambiar su situación debe registrarse la devolución.';
    END IF;


    -- 6. Ejecutar el cambio mediante la función interna.
    PERFORM public._cambiar_estado_animal(
        p_id_animal,
        p_id_nuevo_estado,
        p_motivo_cambio,
        p_observaciones
    );

END;
$$;


ALTER FUNCTION "public"."cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") OWNER TO "postgres";


-- RPC: cierra la permanencia actual y abre otra en el nuevo hogar, en una sola transacción.
CREATE OR REPLACE FUNCTION "public"."cambiar_hogar_temporal"("p_id_animal" bigint, "p_id_nuevo_hogar" bigint, "p_fecha_cambio" "date", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_permanencia_actual BIGINT;
    v_id_hogar_actual BIGINT;
    v_fecha_ingreso DATE;
    v_id_nueva_permanencia BIGINT;
    v_nombre_estado_actual VARCHAR(50);
BEGIN

    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    -- Buscar la permanencia activa.
    SELECT
        id_permanencia,
        id_hogar,
        fecha_ingreso
    INTO
        v_id_permanencia_actual,
        v_id_hogar_actual,
        v_fecha_ingreso
    FROM public.permanencia_animal_hogar
    WHERE id_animal = p_id_animal
      AND fecha_salida IS NULL
    FOR UPDATE;

    IF v_id_permanencia_actual IS NULL THEN
        RAISE EXCEPTION 'El animal no posee un hogar temporal activo.';
    END IF;

    -- Verificar que realmente esté en estado "En hogar temporal".
    SELECT e.nombre_estado
    INTO v_nombre_estado_actual
    FROM public.animal a
    JOIN public.estado e
        ON e.id_estado = a.id_estado_actual
    WHERE a.id_animal = p_id_animal
      AND a.activo = TRUE;

    IF v_nombre_estado_actual IS DISTINCT FROM 'En hogar temporal' THEN
        RAISE EXCEPTION
            'El estado actual del animal no corresponde a En hogar temporal.';
    END IF;

    -- Validar nuevo hogar.
    IF NOT EXISTS (
        SELECT 1
        FROM public.hogar_temporal
        WHERE id_hogar = p_id_nuevo_hogar
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION 'El nuevo hogar temporal no existe o se encuentra inactivo.';
    END IF;

    -- No tiene sentido cambiar al mismo hogar.
    IF v_id_hogar_actual = p_id_nuevo_hogar THEN
        RAISE EXCEPTION 'El animal ya se encuentra en el hogar temporal seleccionado.';
    END IF;

    -- Validar fecha.
    IF p_fecha_cambio < v_fecha_ingreso THEN
        RAISE EXCEPTION
            'La fecha de cambio no puede ser anterior al ingreso al hogar actual.';
    END IF;

    -- Cerrar permanencia anterior.
    UPDATE public.permanencia_animal_hogar
    SET fecha_salida = p_fecha_cambio
    WHERE id_permanencia = v_id_permanencia_actual;

    -- Crear nueva permanencia.
    INSERT INTO public.permanencia_animal_hogar (
        id_animal,
        id_hogar,
        fecha_ingreso,
        observaciones
    )
    VALUES (
        p_id_animal,
        p_id_nuevo_hogar,
        p_fecha_cambio,
        p_observaciones
    )
    RETURNING id_permanencia INTO v_id_nueva_permanencia;

    RETURN v_id_nueva_permanencia;

END;
$$;


ALTER FUNCTION "public"."cambiar_hogar_temporal"("p_id_animal" bigint, "p_id_nuevo_hogar" bigint, "p_fecha_cambio" "date", "p_observaciones" "text") OWNER TO "postgres";


-- Trigger sobre auth.users (ver infrastructure.sql): crea el perfil en public.usuario al invitar
-- a una usuaria. El correo NO se copia: se lee siempre desde Supabase Auth.
CREATE OR REPLACE FUNCTION "public"."crear_usuario_publico"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    INSERT INTO public.usuario (
        id_usuario,
        nombre
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'nombre',
            split_part(NEW.email, '@', 1)
        )
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."crear_usuario_publico"() OWNER TO "postgres";


-- RPC: desactiva una cuenta sin borrarla; impide autodesactivarse y dejar el sistema sin usuarias activas (RN-59).
CREATE OR REPLACE FUNCTION "public"."desactivar_usuario"("p_id_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_total_activos INTEGER;
BEGIN

    -- Verificar usuario autenticado y activo.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION
            'Usuario no autorizado o inactivo.';
    END IF;


    -- Verificar existencia del usuario objetivo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.usuario
        WHERE id_usuario = p_id_usuario
    ) THEN
        RAISE EXCEPTION
            'El usuario indicado no existe.';
    END IF;


    -- Evitar autodesactivación.
    IF p_id_usuario = auth.uid() THEN
        RAISE EXCEPTION
            'No puede desactivar su propia cuenta.';
    END IF;


    -- Verificar que actualmente esté activo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.usuario
        WHERE id_usuario = p_id_usuario
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION
            'El usuario ya se encuentra inactivo.';
    END IF;


    -- Bloquear las filas activas mientras se comprueba
    -- la cantidad de usuarios disponibles.
    PERFORM 1
    FROM public.usuario
    WHERE activo = TRUE
    FOR UPDATE;


    -- Contar usuarios activos.
    SELECT COUNT(*)
    INTO v_total_activos
    FROM public.usuario
    WHERE activo = TRUE;


    -- Nunca dejar el sistema sin usuarios activos.
    IF v_total_activos <= 1 THEN
        RAISE EXCEPTION
            'No es posible dejar el sistema sin usuarios activos.';
    END IF;


    -- Desactivar usuario.
    UPDATE public.usuario
    SET activo = FALSE
    WHERE id_usuario = p_id_usuario;

END;
$$;


ALTER FUNCTION "public"."desactivar_usuario"("p_id_usuario" "uuid") OWNER TO "postgres";


-- Base de la seguridad: la usan todas las políticas RLS y las RPC. true solo si la sesión (auth.uid())
-- corresponde a un perfil con activo = true. Una cuenta desactivada pierde acceso aunque su sesión siga vigente.
CREATE OR REPLACE FUNCTION "public"."es_usuario_activo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuario
        WHERE id_usuario = auth.uid()
          AND activo = TRUE
    );
$$;


ALTER FUNCTION "public"."es_usuario_activo"() OWNER TO "postgres";


-- RPC: cierra la permanencia activa y registra la nueva situación (estado) del animal.
CREATE OR REPLACE FUNCTION "public"."finalizar_hogar_temporal"("p_id_animal" bigint, "p_fecha_salida" "date", "p_id_nuevo_estado" bigint, "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_permanencia BIGINT;
    v_fecha_ingreso DATE;
    v_nombre_estado VARCHAR(50);
BEGIN

    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    -- Buscar y bloquear permanencia activa.
    SELECT
        id_permanencia,
        fecha_ingreso
    INTO
        v_id_permanencia,
        v_fecha_ingreso
    FROM public.permanencia_animal_hogar
    WHERE id_animal = p_id_animal
      AND fecha_salida IS NULL
    FOR UPDATE;

    IF v_id_permanencia IS NULL THEN
        RAISE EXCEPTION 'El animal no posee un hogar temporal activo.';
    END IF;

    -- La salida no puede ser anterior al ingreso.
    IF p_fecha_salida < v_fecha_ingreso THEN
        RAISE EXCEPTION
            'La fecha de salida no puede ser anterior a la fecha de ingreso.';
    END IF;

    -- Revisar el nuevo estado.
    SELECT nombre_estado
    INTO v_nombre_estado
    FROM public.estado
    WHERE id_estado = p_id_nuevo_estado
      AND activo = TRUE;

    IF v_nombre_estado IS NULL THEN
        RAISE EXCEPTION 'El nuevo estado no existe o se encuentra inactivo.';
    END IF;

    -- Salir de un hogar no puede dejar al animal
    -- nuevamente en "En hogar temporal".
    IF v_nombre_estado = 'En hogar temporal' THEN
        RAISE EXCEPTION
            'Para cambiar de hogar temporal debe utilizarse la operación correspondiente.';
    END IF;

    -- Adoptado requiere su propio proceso.
    IF v_nombre_estado = 'Adoptado' THEN
        RAISE EXCEPTION
            'El estado Adoptado solo puede asignarse mediante el proceso de adopción.';
    END IF;

    -- Cerrar permanencia.
    UPDATE public.permanencia_animal_hogar
    SET
        fecha_salida = p_fecha_salida,
        observaciones = CASE
            WHEN p_observaciones IS NULL THEN observaciones
            WHEN observaciones IS NULL THEN p_observaciones
            ELSE observaciones || E'\n' || p_observaciones
        END
    WHERE id_permanencia = v_id_permanencia;

    -- Cambiar estado e historial.
    PERFORM public._cambiar_estado_animal(
        p_id_animal,
        p_id_nuevo_estado,
        'Salida de hogar temporal',
        p_observaciones
    );

END;
$$;


ALTER FUNCTION "public"."finalizar_hogar_temporal"("p_id_animal" bigint, "p_fecha_salida" "date", "p_id_nuevo_estado" bigint, "p_observaciones" "text") OWNER TO "postgres";


-- RPC: crea la permanencia y deja al animal En hogar temporal. Bloquea la fila del animal (FOR UPDATE)
-- para evitar dos ingresos simultáneos.
CREATE OR REPLACE FUNCTION "public"."ingresar_hogar_temporal"("p_id_animal" bigint, "p_id_hogar" bigint, "p_fecha_ingreso" "date", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_permanencia BIGINT;
    v_id_estado_hogar BIGINT;
BEGIN

    -- Verificar usuario autorizado.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    -- Verificar y bloquear animal activo.
    PERFORM 1
    FROM public.animal
    WHERE id_animal = p_id_animal
      AND activo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El animal no existe o se encuentra inactivo.';
    END IF;

    -- Un animal con adopción vigente (o en estado Adoptado)
    -- no puede ingresar a un hogar temporal: primero debe
    -- registrarse la devolución.
    IF EXISTS (
        SELECT 1
        FROM public.adopcion
        WHERE id_animal = p_id_animal
          AND fecha_finalizacion IS NULL
    ) OR EXISTS (
        SELECT 1
        FROM public.animal a
        JOIN public.estado e
            ON e.id_estado = a.id_estado_actual
        WHERE a.id_animal = p_id_animal
          AND e.nombre_estado = 'Adoptado'
    ) THEN
        RAISE EXCEPTION
            'El animal tiene una adopción activa. No puede ingresar a un hogar temporal mientras la adopción esté vigente.';
    END IF;

    -- Verificar hogar activo.
    IF NOT EXISTS (
        SELECT 1
        FROM public.hogar_temporal
        WHERE id_hogar = p_id_hogar
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION 'El hogar temporal no existe o se encuentra inactivo.';
    END IF;

    -- Comprobar que no tenga otra permanencia activa.
    IF EXISTS (
        SELECT 1
        FROM public.permanencia_animal_hogar
        WHERE id_animal = p_id_animal
          AND fecha_salida IS NULL
    ) THEN
        RAISE EXCEPTION 'El animal ya posee un hogar temporal activo.';
    END IF;

    -- Obtener estado "En hogar temporal".
    SELECT id_estado
    INTO v_id_estado_hogar
    FROM public.estado
    WHERE nombre_estado = 'En hogar temporal'
      AND activo = TRUE;

    IF v_id_estado_hogar IS NULL THEN
        RAISE EXCEPTION 'No existe el estado activo En hogar temporal.';
    END IF;

    -- Crear permanencia.
    INSERT INTO public.permanencia_animal_hogar (
        id_animal,
        id_hogar,
        fecha_ingreso,
        observaciones
    )
    VALUES (
        p_id_animal,
        p_id_hogar,
        p_fecha_ingreso,
        p_observaciones
    )
    RETURNING id_permanencia INTO v_id_permanencia;

    -- Actualizar estado e historial.
    PERFORM public._cambiar_estado_animal(
        p_id_animal,
        v_id_estado_hogar,
        'Ingreso a hogar temporal',
        p_observaciones
    );

    RETURN v_id_permanencia;

END;
$$;


ALTER FUNCTION "public"."ingresar_hogar_temporal"("p_id_animal" bigint, "p_id_hogar" bigint, "p_fecha_ingreso" "date", "p_observaciones" "text") OWNER TO "postgres";


-- RPC de lectura: une public.usuario con el correo de auth.users (tabla no accesible desde el navegador).
CREATE OR REPLACE FUNCTION "public".listar_usuarias()
RETURNS TABLE (
    id_usuario uuid,
    nombre text,
    email text,
    activo boolean,
    fecha_registro timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    RETURN QUERY
    SELECT u.id_usuario, u.nombre::text, a.email::text, u.activo, u.fecha_registro
    FROM public.usuario u
    LEFT JOIN auth.users a ON a.id = u.id_usuario
    ORDER BY u.fecha_registro;
END;
$$;


ALTER FUNCTION "public"."listar_usuarias"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."listar_usuarias"() IS 'Usuarias internas con su correo de Supabase Auth (solo lectura) para Configuración → Usuarias.';


-- RPC: elimina solo una relación profesional ↔ esterilización ingresada por error; nunca el profesional
-- ni la última relación del animal.
CREATE OR REPLACE FUNCTION "public".quitar_profesional_esterilizacion(p_id_esterilizacion_profesional bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_id_animal_esterilizacion bigint;
    v_total integer;
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    SELECT id_animal_esterilizacion
    INTO v_id_animal_esterilizacion
    FROM public.esterilizacion_profesional
    WHERE id_esterilizacion_profesional = p_id_esterilizacion_profesional;

    IF v_id_animal_esterilizacion IS NULL THEN
        RAISE EXCEPTION 'La asociación indicada no existe.';
    END IF;

    -- Serializa operaciones concurrentes sobre el mismo animal.
    PERFORM 1
    FROM public.animal_esterilizacion
    WHERE id_animal_esterilizacion = v_id_animal_esterilizacion
    FOR UPDATE;

    SELECT count(*)
    INTO v_total
    FROM public.esterilizacion_profesional
    WHERE id_animal_esterilizacion = v_id_animal_esterilizacion;

    IF v_total <= 1 THEN
        RAISE EXCEPTION 'No es posible quitar al último profesional asociado. Agrega primero el profesional correcto.';
    END IF;

    DELETE FROM public.esterilizacion_profesional
    WHERE id_esterilizacion_profesional = p_id_esterilizacion_profesional;
END;
$$;


ALTER FUNCTION "public"."quitar_profesional_esterilizacion"("p_id_esterilizacion_profesional" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."quitar_profesional_esterilizacion"("p_id_esterilizacion_profesional" bigint) IS 'Corrige una asociación profesional–esterilización ingresada por error. No elimina al profesional ni permite dejar al animal sin profesionales.';


-- RPC: crea la adopción (Activa), cierra la permanencia en hogar si existe y deja al animal Adoptado.
CREATE OR REPLACE FUNCTION "public"."registrar_adopcion"("p_id_animal" bigint, "p_id_adoptante" bigint, "p_fecha_adopcion" "date", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_adopcion BIGINT;
    v_id_estado_adopcion BIGINT;
    v_id_estado_adoptado BIGINT;
    v_id_permanencia BIGINT;
    v_fecha_ingreso DATE;
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    -- Verificar animal.
    IF NOT EXISTS (
        SELECT 1
        FROM public.animal
        WHERE id_animal = p_id_animal
          AND activo = TRUE
    ) THEN
        RAISE EXCEPTION 'El animal no existe o se encuentra inactivo.';
    END IF;

    -- Verificar adoptante.
    IF NOT EXISTS (
        SELECT 1
        FROM public.adoptante
        WHERE id_adoptante = p_id_adoptante
    ) THEN
        RAISE EXCEPTION 'El adoptante no existe.';
    END IF;

    -- Impedir dos adopciones abiertas.
    IF EXISTS (
        SELECT 1
        FROM public.adopcion
        WHERE id_animal = p_id_animal
          AND fecha_finalizacion IS NULL
    ) THEN
        RAISE EXCEPTION 'El animal ya posee una adopción activa.';
    END IF;

    -- Obtener estado inicial de la adopción.
    SELECT id_estado_adopcion
    INTO v_id_estado_adopcion
    FROM public.estado_adopcion
    WHERE nombre = 'Activa'
      AND activo = TRUE;

    IF v_id_estado_adopcion IS NULL THEN
        RAISE EXCEPTION 'No existe el estado de adopción Activa.';
    END IF;

    -- Obtener estado del animal.
    SELECT id_estado
    INTO v_id_estado_adoptado
    FROM public.estado
    WHERE nombre_estado = 'Adoptado'
      AND activo = TRUE;

    IF v_id_estado_adoptado IS NULL THEN
        RAISE EXCEPTION 'No existe el estado Adoptado.';
    END IF;

    -- Si tiene hogar temporal activo, lo cerramos.
    SELECT id_permanencia, fecha_ingreso
    INTO v_id_permanencia, v_fecha_ingreso
    FROM public.permanencia_animal_hogar
    WHERE id_animal = p_id_animal
      AND fecha_salida IS NULL
    FOR UPDATE;

    IF v_id_permanencia IS NOT NULL THEN

        IF p_fecha_adopcion < v_fecha_ingreso THEN
            RAISE EXCEPTION
                'La fecha de adopción no puede ser anterior al ingreso al hogar temporal.';
        END IF;

        UPDATE public.permanencia_animal_hogar
        SET fecha_salida = p_fecha_adopcion
        WHERE id_permanencia = v_id_permanencia;

    END IF;

    -- Crear adopción.
    INSERT INTO public.adopcion (
        id_animal,
        id_adoptante,
        id_estado_adopcion,
        fecha_adopcion,
        observaciones
    )
    VALUES (
        p_id_animal,
        p_id_adoptante,
        v_id_estado_adopcion,
        p_fecha_adopcion,
        p_observaciones
    )
    RETURNING id_adopcion INTO v_id_adopcion;

    -- Cambiar estado del animal.
    PERFORM public._cambiar_estado_animal(
        p_id_animal,
        v_id_estado_adoptado,
        'Registro de adopción',
        p_observaciones
    );

    RETURN v_id_adopcion;
END;
$$;


ALTER FUNCTION "public"."registrar_adopcion"("p_id_animal" bigint, "p_id_adoptante" bigint, "p_fecha_adopcion" "date", "p_observaciones" "text") OWNER TO "postgres";


-- RPC de alta: valida microchip único, crea el animal en estado Rescatado y su primer historial.
-- p_estado_esterilizacion es opcional (por defecto 'Sin información').
CREATE OR REPLACE FUNCTION "public"."registrar_animal"("p_id_especie" bigint, "p_id_rango_etario" bigint, "p_nombre" character varying, "p_sexo" character varying, "p_tamano" character varying, "p_fecha_nacimiento" "date", "p_fecha_rescate" "date", "p_lugar_rescate" character varying, "p_caracteristicas" "text", "p_personalidad" "text", "p_historia_rescate" "text", "p_observaciones" "text", "p_microchip" character varying, "p_estado_registro_nacional" character varying, "p_estado_esterilizacion" character varying DEFAULT 'Sin información'::character varying) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_estado_rescatado BIGINT;
    v_id_animal BIGINT;
BEGIN

    -- 1. Verificar que quien ejecuta la función sea
    --    una usuaria autenticada y activa.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;


    -- 2. Validar que el microchip no se encuentre asociado
    --    previamente a otro animal.
    IF p_microchip IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM public.animal
            WHERE microchip = p_microchip
       )
    THEN
        RAISE EXCEPTION
            'El microchip % ya se encuentra asociado a un animal registrado.',
            p_microchip;
    END IF;


    -- 3. Obtener el identificador del estado "Rescatado".
    SELECT id_estado
    INTO v_id_estado_rescatado
    FROM public.estado
    WHERE nombre_estado = 'Rescatado'
      AND activo = TRUE;

    IF v_id_estado_rescatado IS NULL THEN
        RAISE EXCEPTION
            'No existe un estado activo denominado Rescatado.';
    END IF;


    -- 4. Crear la ficha del animal con estado inicial Rescatado.
    --    Si no se informa la esterilización, queda 'Sin información'.
    INSERT INTO public.animal (
        id_estado_actual,
        id_especie,
        id_rango_etario,
        nombre,
        sexo,
        tamaño,
        fecha_nacimiento,
        fecha_rescate,
        lugar_rescate,
        caracteristicas,
        personalidad,
        historia_rescate,
        observaciones,
        microchip,
        estado_registro_nacional,
        estado_esterilizacion
    )
    VALUES (
        v_id_estado_rescatado,
        p_id_especie,
        p_id_rango_etario,
        p_nombre,
        p_sexo,
        p_tamano,
        p_fecha_nacimiento,
        p_fecha_rescate,
        p_lugar_rescate,
        p_caracteristicas,
        p_personalidad,
        p_historia_rescate,
        p_observaciones,
        p_microchip,
        p_estado_registro_nacional,
        COALESCE(p_estado_esterilizacion, 'Sin información')
    )
    RETURNING id_animal INTO v_id_animal;


    -- 5. Crear automáticamente el primer registro
    --    del historial de estados.
    INSERT INTO public.historial_estado (
        id_animal,
        id_estado,
        fecha_inicio,
        motivo_cambio,
        observaciones
    )
    VALUES (
        v_id_animal,
        v_id_estado_rescatado,
        CURRENT_TIMESTAMP,
        'Registro inicial del animal',
        NULL
    );


    -- 6. Devolver el ID del animal recién creado.
    RETURN v_id_animal;

END;
$$;


ALTER FUNCTION "public"."registrar_animal"("p_id_especie" bigint, "p_id_rango_etario" bigint, "p_nombre" character varying, "p_sexo" character varying, "p_tamano" character varying, "p_fecha_nacimiento" "date", "p_fecha_rescate" "date", "p_lugar_rescate" character varying, "p_caracteristicas" "text", "p_personalidad" "text", "p_historia_rescate" "text", "p_observaciones" "text", "p_microchip" character varying, "p_estado_registro_nacional" character varying, "p_estado_esterilizacion" character varying) OWNER TO "postgres";


-- RPC usada por la Edge Function subir-archivo-drive: registra ARCHIVO y lo asocia a su contexto
-- (animal, adopción, gasto, proyecto, esterilización o Fundación) en una sola transacción.
CREATE OR REPLACE FUNCTION "public"."registrar_archivo"("p_id_categoria_archivo" bigint, "p_nombre_archivo" character varying, "p_nombre_original" character varying, "p_mime_type" character varying, "p_id_externo" character varying, "p_fecha_documento" "date", "p_descripcion" "text", "p_tipo_contexto" character varying, "p_id_contexto" bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_archivo BIGINT;
BEGIN

    -- Verificar usuario autenticado y activo.
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION
            'Usuario no autorizado o inactivo.';
    END IF;


    -- Verificar tipo de contexto permitido.
    IF p_tipo_contexto NOT IN (
        'animal',
        'adopcion',
        'gasto',
        'proyecto',
        'esterilizacion',
        'fundacion'
    ) THEN
        RAISE EXCEPTION
            'Tipo de contexto de archivo no válido.';
    END IF;


    -- Todos los contextos, excepto Fundación,
    -- requieren el ID del registro relacionado.
    IF p_tipo_contexto <> 'fundacion'
       AND p_id_contexto IS NULL THEN

        RAISE EXCEPTION
            'Debe indicarse el registro al cual pertenece el archivo.';

    END IF;


    -- Crear registro principal del archivo.
    INSERT INTO public.archivo (
        id_categoria_archivo,
        nombre_archivo,
        nombre_original,
        mime_type,
        id_externo,
        fecha_documento,
        descripcion
    )
    VALUES (
        p_id_categoria_archivo,
        p_nombre_archivo,
        p_nombre_original,
        p_mime_type,
        p_id_externo,
        p_fecha_documento,
        p_descripcion
    )
    RETURNING id_archivo
    INTO v_id_archivo;


    -- Asociar el archivo según su contexto.
    CASE p_tipo_contexto

        -- ----------------------------------------------------
        -- ARCHIVO DE ANIMAL
        -- ----------------------------------------------------
        WHEN 'animal' THEN

            INSERT INTO public.animal_archivo (
                id_animal,
                id_archivo
            )
            VALUES (
                p_id_contexto,
                v_id_archivo
            );


        -- ----------------------------------------------------
        -- ARCHIVO DE ADOPCIÓN
        -- ----------------------------------------------------
        WHEN 'adopcion' THEN

            INSERT INTO public.adopcion_archivo (
                id_adopcion,
                id_archivo
            )
            VALUES (
                p_id_contexto,
                v_id_archivo
            );


        -- ----------------------------------------------------
        -- ARCHIVO DE GASTO
        -- ----------------------------------------------------
        WHEN 'gasto' THEN

            INSERT INTO public.gasto_archivo (
                id_gasto,
                id_archivo
            )
            VALUES (
                p_id_contexto,
                v_id_archivo
            );


        -- ----------------------------------------------------
        -- ARCHIVO DE PROYECTO DE ESTERILIZACIÓN
        -- ----------------------------------------------------
        WHEN 'proyecto' THEN

            INSERT INTO public.proyecto_archivo (
                id_proyecto,
                id_archivo
            )
            VALUES (
                p_id_contexto,
                v_id_archivo
            );


        -- ----------------------------------------------------
        -- ARCHIVO DE ESTERILIZACIÓN
        -- ----------------------------------------------------
        WHEN 'esterilizacion' THEN

            INSERT INTO public.esterilizacion_archivo (
                id_animal_esterilizacion,
                id_archivo
            )
            VALUES (
                p_id_contexto,
                v_id_archivo
            );


        -- ----------------------------------------------------
        -- DOCUMENTACIÓN GENERAL DE LA FUNDACIÓN
        -- ----------------------------------------------------
        WHEN 'fundacion' THEN

            INSERT INTO public.fundacion_archivo (
                id_archivo
            )
            VALUES (
                v_id_archivo
            );

    END CASE;


    RETURN v_id_archivo;

END;
$$;


ALTER FUNCTION "public"."registrar_archivo"("p_id_categoria_archivo" bigint, "p_nombre_archivo" character varying, "p_nombre_original" character varying, "p_mime_type" character varying, "p_id_externo" character varying, "p_fecha_documento" "date", "p_descripcion" "text", "p_tipo_contexto" character varying, "p_id_contexto" bigint) OWNER TO "postgres";


-- RPC: finaliza la adopción como Devuelto (queda en el historial) y asigna la nueva situación del animal.
CREATE OR REPLACE FUNCTION "public"."registrar_devolucion"("p_id_adopcion" bigint, "p_fecha_devolucion" "date", "p_id_nuevo_estado" bigint, "p_motivo" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_id_animal BIGINT;
    v_fecha_adopcion DATE;
    v_id_estado_devuelto BIGINT;
    v_nombre_nuevo_estado VARCHAR(50);
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    -- Obtener y bloquear adopción activa.
    SELECT id_animal, fecha_adopcion
    INTO v_id_animal, v_fecha_adopcion
    FROM public.adopcion
    WHERE id_adopcion = p_id_adopcion
      AND fecha_finalizacion IS NULL
    FOR UPDATE;

    IF v_id_animal IS NULL THEN
        RAISE EXCEPTION 'La adopción no existe o ya se encuentra finalizada.';
    END IF;

    IF p_fecha_devolucion < v_fecha_adopcion THEN
        RAISE EXCEPTION
            'La fecha de devolución no puede ser anterior a la fecha de adopción.';
    END IF;

    -- Obtener estado "Devuelto".
    SELECT id_estado_adopcion
    INTO v_id_estado_devuelto
    FROM public.estado_adopcion
    WHERE nombre = 'Devuelto'
      AND activo = TRUE;

    IF v_id_estado_devuelto IS NULL THEN
        RAISE EXCEPTION 'No existe el estado de adopción Devuelto.';
    END IF;

    -- Comprobar nuevo estado del animal.
    SELECT nombre_estado
    INTO v_nombre_nuevo_estado
    FROM public.estado
    WHERE id_estado = p_id_nuevo_estado
      AND activo = TRUE;

    IF v_nombre_nuevo_estado IS NULL THEN
        RAISE EXCEPTION 'El nuevo estado del animal no existe o está inactivo.';
    END IF;

    -- Una devolución no puede dejarlo Adoptado.
    IF v_nombre_nuevo_estado = 'Adoptado' THEN
        RAISE EXCEPTION
            'Un animal devuelto no puede conservar el estado Adoptado.';
    END IF;

    -- Tampoco puede inventar un hogar temporal sin permanencia.
    IF v_nombre_nuevo_estado = 'En hogar temporal' THEN
        RAISE EXCEPTION
            'Para ingresar el animal a un hogar temporal debe utilizarse el proceso correspondiente.';
    END IF;

    -- Finalizar adopción conservando su historia.
    UPDATE public.adopcion
    SET
        id_estado_adopcion = v_id_estado_devuelto,
        fecha_finalizacion = p_fecha_devolucion,
        motivo_finalizacion = p_motivo,
        observaciones = CASE
            WHEN p_observaciones IS NULL THEN observaciones
            WHEN observaciones IS NULL THEN p_observaciones
            ELSE observaciones || E'\n' || p_observaciones
        END
    WHERE id_adopcion = p_id_adopcion;

    -- Cambiar situación actual del animal.
    PERFORM public._cambiar_estado_animal(
        v_id_animal,
        p_id_nuevo_estado,
        'Devolución de adopción',
        p_observaciones
    );
END;
$$;


ALTER FUNCTION "public"."registrar_devolucion"("p_id_adopcion" bigint, "p_fecha_devolucion" "date", "p_id_nuevo_estado" bigint, "p_motivo" "text", "p_observaciones" "text") OWNER TO "postgres";


-- RPC: registra un contacto posterior a la adopción; la fecha no puede ser anterior a la adopción.
CREATE OR REPLACE FUNCTION "public"."registrar_seguimiento"("p_id_adopcion" bigint, "p_fecha" "date", "p_medio_contacto" character varying, "p_situacion_animal" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_fecha_adopcion DATE;
    v_id_seguimiento BIGINT;
BEGIN
    IF NOT public.es_usuario_activo() THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo.';
    END IF;

    SELECT fecha_adopcion
    INTO v_fecha_adopcion
    FROM public.adopcion
    WHERE id_adopcion = p_id_adopcion;

    IF v_fecha_adopcion IS NULL THEN
        RAISE EXCEPTION 'La adopción indicada no existe.';
    END IF;

    IF p_fecha < v_fecha_adopcion THEN
        RAISE EXCEPTION
            'La fecha del seguimiento no puede ser anterior a la fecha de adopción.';
    END IF;

    INSERT INTO public.seguimiento (
        id_adopcion,
        fecha,
        medio_contacto,
        situacion_animal,
        observaciones
    )
    VALUES (
        p_id_adopcion,
        p_fecha,
        p_medio_contacto,
        p_situacion_animal,
        p_observaciones
    )
    RETURNING id_seguimiento INTO v_id_seguimiento;

    RETURN v_id_seguimiento;
END;
$$;


ALTER FUNCTION "public"."registrar_seguimiento"("p_id_adopcion" bigint, "p_fecha" "date", "p_medio_contacto" character varying, "p_situacion_animal" "text", "p_observaciones" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


-- Tablas. Convención: id_* bigint como PK, FK con prefijo fk_, CHECK con prefijo chk_ y UNIQUE con uq_.
-- Los catálogos tienen columna activo: se desactivan en lugar de borrarse, para conservar el historial.
CREATE TABLE IF NOT EXISTS "public"."adopcion" (
    "id_adopcion" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_adoptante" bigint NOT NULL,
    "id_estado_adopcion" bigint NOT NULL,
    "fecha_adopcion" "date" NOT NULL,
    "fecha_finalizacion" "date",
    "motivo_finalizacion" "text",
    "observaciones" "text",
    CONSTRAINT "chk_adopcion_fechas" CHECK ((("fecha_finalizacion" IS NULL) OR ("fecha_finalizacion" >= "fecha_adopcion")))
);


ALTER TABLE "public"."adopcion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."adopcion_archivo" (
    "id_adopcion_archivo" bigint NOT NULL,
    "id_adopcion" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."adopcion_archivo" OWNER TO "postgres";


ALTER TABLE "public"."adopcion_archivo" ALTER COLUMN "id_adopcion_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."adopcion_archivo_id_adopcion_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."adopcion" ALTER COLUMN "id_adopcion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."adopcion_id_adopcion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."adoptante" (
    "id_adoptante" bigint NOT NULL,
    "nombre" character varying(150) NOT NULL,
    "rut" character varying(12) NOT NULL,
    "telefono" character varying(30),
    "email" character varying(254),
    "direccion" "text",
    "observaciones" "text"
);


ALTER TABLE "public"."adoptante" OWNER TO "postgres";


ALTER TABLE "public"."adoptante" ALTER COLUMN "id_adoptante" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."adoptante_id_adoptante_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."animal" (
    "id_animal" bigint NOT NULL,
    "id_estado_actual" bigint NOT NULL,
    "id_especie" bigint NOT NULL,
    "id_rango_etario" bigint,
    "nombre" character varying(100),
    "sexo" character varying(20) NOT NULL,
    "tamaño" character varying(20),
    "fecha_nacimiento" "date",
    "fecha_rescate" "date" NOT NULL,
    "lugar_rescate" character varying(255),
    "caracteristicas" "text",
    "personalidad" "text",
    "historia_rescate" "text",
    "observaciones" "text",
    "foto_principal_path" "text",
    "id_carpeta_drive" character varying(255),
    "activo" boolean DEFAULT true NOT NULL,
    "fecha_registro" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "microchip" character varying(15),
    "estado_registro_nacional" character varying(20),
    "estado_esterilizacion" character varying(20) DEFAULT 'Sin información'::character varying NOT NULL,
    CONSTRAINT "chk_animal_estado_esterilizacion" CHECK ((("estado_esterilizacion")::"text" = ANY ((ARRAY['Esterilizado'::character varying, 'No esterilizado'::character varying, 'Sin información'::character varying])::"text"[]))),
    CONSTRAINT "chk_animal_estado_registro_nacional" CHECK ((("estado_registro_nacional" IS NULL) OR (("estado_registro_nacional")::"text" = ANY ((ARRAY['Inscrito'::character varying, 'No inscrito'::character varying, 'No verificado'::character varying])::"text"[])))),
    CONSTRAINT "chk_animal_fechas" CHECK ((("fecha_nacimiento" IS NULL) OR ("fecha_nacimiento" <= "fecha_rescate"))),
    CONSTRAINT "chk_animal_microchip" CHECK ((("microchip" IS NULL) OR (("microchip")::"text" ~ '^[0-9]{15}$'::"text"))),
    CONSTRAINT "chk_animal_sexo" CHECK ((("sexo")::"text" = ANY ((ARRAY['Macho'::character varying, 'Hembra'::character varying, 'Desconocido'::character varying])::"text"[]))),
    CONSTRAINT "chk_animal_tamano" CHECK ((("tamaño" IS NULL) OR (("tamaño")::"text" = ANY ((ARRAY['Pequeño'::character varying, 'Mediano'::character varying, 'Grande'::character varying])::"text"[]))))
);


ALTER TABLE "public"."animal" OWNER TO "postgres";


COMMENT ON COLUMN "public"."animal"."estado_esterilizacion" IS 'Situación de esterilización del animal rescatado: Esterilizado, No esterilizado o Sin información. Independiente de las atenciones sanitarias.';


CREATE TABLE IF NOT EXISTS "public"."animal_archivo" (
    "id_animal_archivo" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."animal_archivo" OWNER TO "postgres";


ALTER TABLE "public"."animal_archivo" ALTER COLUMN "id_animal_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."animal_archivo_id_animal_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."animal_esterilizacion" (
    "id_animal_esterilizacion" bigint NOT NULL,
    "id_proyecto" bigint NOT NULL,
    "id_especie" bigint NOT NULL,
    "id_rango_etario" bigint,
    "codigo" character varying(50) NOT NULL,
    "sexo" character varying(20) NOT NULL,
    "fecha_nacimiento" "date",
    "caracteristicas" "text",
    "sector_origen" character varying(255),
    "fecha_esterilizacion" "date",
    "lugar_esterilizacion" character varying(255),
    "observaciones" "text",
    "microchip" character varying(15),
    "estado_registro_nacional" character varying(20),
    CONSTRAINT "chk_animal_esterilizacion_fechas" CHECK ((("fecha_nacimiento" IS NULL) OR ("fecha_esterilizacion" IS NULL) OR ("fecha_nacimiento" <= "fecha_esterilizacion"))),
    CONSTRAINT "chk_animal_esterilizacion_microchip" CHECK ((("microchip" IS NULL) OR (("microchip")::"text" ~ '^[0-9]{15}$'::"text"))),
    CONSTRAINT "chk_animal_esterilizacion_sexo" CHECK ((("sexo")::"text" = ANY ((ARRAY['Macho'::character varying, 'Hembra'::character varying, 'Desconocido'::character varying])::"text"[]))),
    CONSTRAINT "chk_esterilizacion_estado_registro_nacional" CHECK ((("estado_registro_nacional" IS NULL) OR (("estado_registro_nacional")::"text" = ANY ((ARRAY['Inscrito'::character varying, 'No inscrito'::character varying, 'No verificado'::character varying])::"text"[]))))
);


ALTER TABLE "public"."animal_esterilizacion" OWNER TO "postgres";


ALTER TABLE "public"."animal_esterilizacion" ALTER COLUMN "id_animal_esterilizacion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."animal_esterilizacion_id_animal_esterilizacion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."animal_gasto" (
    "id_animal_gasto" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_gasto" bigint NOT NULL,
    "monto_asignado" bigint NOT NULL,
    CONSTRAINT "chk_animal_gasto_monto" CHECK ((("monto_asignado")::numeric > (0)::numeric))
);


ALTER TABLE "public"."animal_gasto" OWNER TO "postgres";


ALTER TABLE "public"."animal_gasto" ALTER COLUMN "id_animal_gasto" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."animal_gasto_id_animal_gasto_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."animal" ALTER COLUMN "id_animal" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."animal_id_animal_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."archivo" (
    "id_archivo" bigint NOT NULL,
    "id_categoria_archivo" bigint NOT NULL,
    "nombre_archivo" character varying(255) NOT NULL,
    "nombre_original" character varying(255),
    "mime_type" character varying(100),
    "id_externo" character varying(255) NOT NULL,
    "fecha_documento" "date",
    "fecha_carga" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "descripcion" "text"
);


ALTER TABLE "public"."archivo" OWNER TO "postgres";


ALTER TABLE "public"."archivo" ALTER COLUMN "id_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."archivo_id_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."atencion_sanitaria" (
    "id_atencion_sanitaria" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_tipo_atencion" bigint NOT NULL,
    "fecha" "date" NOT NULL,
    "veterinario" character varying(150),
    "tratamiento" "text",
    "medicamento" "text",
    "proximo_control" "date",
    "observaciones" "text",
    CONSTRAINT "chk_atencion_proximo_control" CHECK ((("proximo_control" IS NULL) OR ("proximo_control" >= "fecha")))
);


ALTER TABLE "public"."atencion_sanitaria" OWNER TO "postgres";


ALTER TABLE "public"."atencion_sanitaria" ALTER COLUMN "id_atencion_sanitaria" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."atencion_sanitaria_id_atencion_sanitaria_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."categoria_archivo" (
    "id_categoria_archivo" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."categoria_archivo" OWNER TO "postgres";


ALTER TABLE "public"."categoria_archivo" ALTER COLUMN "id_categoria_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."categoria_archivo_id_categoria_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."categoria_gasto" (
    "id_categoria_gasto" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."categoria_gasto" OWNER TO "postgres";


ALTER TABLE "public"."categoria_gasto" ALTER COLUMN "id_categoria_gasto" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."categoria_gasto_id_categoria_gasto_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."especie" (
    "id_especie" bigint NOT NULL,
    "nombre" character varying(50) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."especie" OWNER TO "postgres";


ALTER TABLE "public"."especie" ALTER COLUMN "id_especie" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."especie_id_especie_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."estado" (
    "id_estado" bigint NOT NULL,
    "nombre_estado" character varying(50) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."estado" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estado_adopcion" (
    "id_estado_adopcion" bigint NOT NULL,
    "nombre" character varying(50) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."estado_adopcion" OWNER TO "postgres";


ALTER TABLE "public"."estado_adopcion" ALTER COLUMN "id_estado_adopcion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."estado_adopcion_id_estado_adopcion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."estado" ALTER COLUMN "id_estado" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."estado_id_estado_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."estado_proyecto" (
    "id_estado_proyecto" bigint NOT NULL,
    "nombre" character varying(50) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."estado_proyecto" OWNER TO "postgres";


ALTER TABLE "public"."estado_proyecto" ALTER COLUMN "id_estado_proyecto" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."estado_proyecto_id_estado_proyecto_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."esterilizacion_archivo" (
    "id_esterilizacion_archivo" bigint NOT NULL,
    "id_animal_esterilizacion" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."esterilizacion_archivo" OWNER TO "postgres";


ALTER TABLE "public"."esterilizacion_archivo" ALTER COLUMN "id_esterilizacion_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."esterilizacion_archivo_id_esterilizacion_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."esterilizacion_profesional" (
    "id_esterilizacion_profesional" bigint NOT NULL,
    "id_animal_esterilizacion" bigint NOT NULL,
    "id_profesional" bigint NOT NULL,
    "funcion" character varying(100) NOT NULL
);


ALTER TABLE "public"."esterilizacion_profesional" OWNER TO "postgres";


ALTER TABLE "public"."esterilizacion_profesional" ALTER COLUMN "id_esterilizacion_profesional" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."esterilizacion_profesional_id_esterilizacion_profesional_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fundacion_archivo" (
    "id_fundacion_archivo" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."fundacion_archivo" OWNER TO "postgres";


ALTER TABLE "public"."fundacion_archivo" ALTER COLUMN "id_fundacion_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fundacion_archivo_id_fundacion_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gasto" (
    "id_gasto" bigint NOT NULL,
    "id_categoria_gasto" bigint NOT NULL,
    "fecha" "date" NOT NULL,
    "descripcion" "text" NOT NULL,
    "monto" bigint NOT NULL,
    "observaciones" "text",
    CONSTRAINT "chk_gasto_monto" CHECK ((("monto")::numeric > (0)::numeric))
);


ALTER TABLE "public"."gasto" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gasto_archivo" (
    "id_gasto_archivo" bigint NOT NULL,
    "id_gasto" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."gasto_archivo" OWNER TO "postgres";


ALTER TABLE "public"."gasto_archivo" ALTER COLUMN "id_gasto_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."gasto_archivo_id_gasto_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."gasto" ALTER COLUMN "id_gasto" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."gasto_id_gasto_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."historial_estado" (
    "id_historial_estado" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_estado" bigint NOT NULL,
    "fecha_inicio" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "fecha_fin" timestamp with time zone,
    "motivo_cambio" "text",
    "observaciones" "text",
    CONSTRAINT "chk_historial_estado_fechas" CHECK ((("fecha_fin" IS NULL) OR ("fecha_fin" >= "fecha_inicio")))
);


ALTER TABLE "public"."historial_estado" OWNER TO "postgres";


ALTER TABLE "public"."historial_estado" ALTER COLUMN "id_historial_estado" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."historial_estado_id_historial_estado_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."hogar_temporal" (
    "id_hogar" bigint NOT NULL,
    "nombre_responsable" character varying(150) NOT NULL,
    "telefono" character varying(30),
    "email" character varying(254),
    "direccion" "text",
    "observaciones" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."hogar_temporal" OWNER TO "postgres";


ALTER TABLE "public"."hogar_temporal" ALTER COLUMN "id_hogar" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."hogar_temporal_id_hogar_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."permanencia_animal_hogar" (
    "id_permanencia" bigint NOT NULL,
    "id_animal" bigint NOT NULL,
    "id_hogar" bigint NOT NULL,
    "fecha_ingreso" "date" NOT NULL,
    "fecha_salida" "date",
    "observaciones" "text",
    CONSTRAINT "chk_permanencia_fechas" CHECK ((("fecha_salida" IS NULL) OR ("fecha_salida" >= "fecha_ingreso")))
);


ALTER TABLE "public"."permanencia_animal_hogar" OWNER TO "postgres";


ALTER TABLE "public"."permanencia_animal_hogar" ALTER COLUMN "id_permanencia" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."permanencia_animal_hogar_id_permanencia_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profesional" (
    "id_profesional" bigint NOT NULL,
    "nombre" character varying(150) NOT NULL,
    "profesion" character varying(100) NOT NULL,
    "telefono" character varying(30),
    "email" character varying(254),
    "observaciones" "text"
);


ALTER TABLE "public"."profesional" OWNER TO "postgres";


ALTER TABLE "public"."profesional" ALTER COLUMN "id_profesional" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."profesional_id_profesional_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."proyecto_archivo" (
    "id_proyecto_archivo" bigint NOT NULL,
    "id_proyecto" bigint NOT NULL,
    "id_archivo" bigint NOT NULL
);


ALTER TABLE "public"."proyecto_archivo" OWNER TO "postgres";


ALTER TABLE "public"."proyecto_archivo" ALTER COLUMN "id_proyecto_archivo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."proyecto_archivo_id_proyecto_archivo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."proyecto_esterilizacion" (
    "id_proyecto" bigint NOT NULL,
    "id_estado_proyecto" bigint NOT NULL,
    "nombre" character varying(150) NOT NULL,
    "fecha_postulacion" "date",
    "fecha_inicio" "date",
    "fecha_fin" "date",
    "responsable" character varying(150),
    "entidad_financiante" character varying(150),
    "descripcion" "text",
    "observaciones" "text",
    "id_carpeta_drive" character varying(255),
    CONSTRAINT "chk_proyecto_fechas" CHECK ((("fecha_inicio" IS NULL) OR ("fecha_fin" IS NULL) OR ("fecha_fin" >= "fecha_inicio")))
);


ALTER TABLE "public"."proyecto_esterilizacion" OWNER TO "postgres";


ALTER TABLE "public"."proyecto_esterilizacion" ALTER COLUMN "id_proyecto" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."proyecto_esterilizacion_id_proyecto_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rango_etario" (
    "id_rango_etario" bigint NOT NULL,
    "nombre" character varying(50) NOT NULL,
    "edad_min_meses" integer NOT NULL,
    "edad_max_meses" integer,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "chk_rango_edad_min" CHECK (("edad_min_meses" >= 0)),
    CONSTRAINT "chk_rango_edades" CHECK ((("edad_max_meses" IS NULL) OR ("edad_max_meses" > "edad_min_meses")))
);


ALTER TABLE "public"."rango_etario" OWNER TO "postgres";


ALTER TABLE "public"."rango_etario" ALTER COLUMN "id_rango_etario" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."rango_etario_id_rango_etario_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."seguimiento" (
    "id_seguimiento" bigint NOT NULL,
    "id_adopcion" bigint NOT NULL,
    "fecha" "date" NOT NULL,
    "medio_contacto" character varying(30) NOT NULL,
    "situacion_animal" "text",
    "observaciones" "text",
    CONSTRAINT "chk_seguimiento_medio" CHECK ((("medio_contacto")::"text" = ANY ((ARRAY['WhatsApp'::character varying, 'Telefono'::character varying, 'Correo'::character varying, 'Visita'::character varying, 'Otro'::character varying])::"text"[])))
);


ALTER TABLE "public"."seguimiento" OWNER TO "postgres";


ALTER TABLE "public"."seguimiento" ALTER COLUMN "id_seguimiento" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."seguimiento_id_seguimiento_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tipo_atencion_sanitaria" (
    "id_tipo_atencion" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."tipo_atencion_sanitaria" OWNER TO "postgres";


ALTER TABLE "public"."tipo_atencion_sanitaria" ALTER COLUMN "id_tipo_atencion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tipo_atencion_sanitaria_id_tipo_atencion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."usuario" (
    "id_usuario" "uuid" NOT NULL,
    "nombre" character varying(150) NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "fecha_registro" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."usuario" OWNER TO "postgres";


ALTER TABLE ONLY "public"."adopcion"
    ADD CONSTRAINT "pk_adopcion" PRIMARY KEY ("id_adopcion");



ALTER TABLE ONLY "public"."adopcion_archivo"
    ADD CONSTRAINT "pk_adopcion_archivo" PRIMARY KEY ("id_adopcion_archivo");



ALTER TABLE ONLY "public"."adoptante"
    ADD CONSTRAINT "pk_adoptante" PRIMARY KEY ("id_adoptante");



ALTER TABLE ONLY "public"."animal"
    ADD CONSTRAINT "pk_animal" PRIMARY KEY ("id_animal");



ALTER TABLE ONLY "public"."animal_archivo"
    ADD CONSTRAINT "pk_animal_archivo" PRIMARY KEY ("id_animal_archivo");



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "pk_animal_esterilizacion" PRIMARY KEY ("id_animal_esterilizacion");



ALTER TABLE ONLY "public"."animal_gasto"
    ADD CONSTRAINT "pk_animal_gasto" PRIMARY KEY ("id_animal_gasto");



ALTER TABLE ONLY "public"."archivo"
    ADD CONSTRAINT "pk_archivo" PRIMARY KEY ("id_archivo");



ALTER TABLE ONLY "public"."atencion_sanitaria"
    ADD CONSTRAINT "pk_atencion_sanitaria" PRIMARY KEY ("id_atencion_sanitaria");



ALTER TABLE ONLY "public"."categoria_archivo"
    ADD CONSTRAINT "pk_categoria_archivo" PRIMARY KEY ("id_categoria_archivo");



ALTER TABLE ONLY "public"."categoria_gasto"
    ADD CONSTRAINT "pk_categoria_gasto" PRIMARY KEY ("id_categoria_gasto");



ALTER TABLE ONLY "public"."especie"
    ADD CONSTRAINT "pk_especie" PRIMARY KEY ("id_especie");



ALTER TABLE ONLY "public"."estado"
    ADD CONSTRAINT "pk_estado" PRIMARY KEY ("id_estado");



ALTER TABLE ONLY "public"."estado_adopcion"
    ADD CONSTRAINT "pk_estado_adopcion" PRIMARY KEY ("id_estado_adopcion");



ALTER TABLE ONLY "public"."estado_proyecto"
    ADD CONSTRAINT "pk_estado_proyecto" PRIMARY KEY ("id_estado_proyecto");



ALTER TABLE ONLY "public"."esterilizacion_archivo"
    ADD CONSTRAINT "pk_esterilizacion_archivo" PRIMARY KEY ("id_esterilizacion_archivo");



ALTER TABLE ONLY "public"."esterilizacion_profesional"
    ADD CONSTRAINT "pk_esterilizacion_profesional" PRIMARY KEY ("id_esterilizacion_profesional");



ALTER TABLE ONLY "public"."fundacion_archivo"
    ADD CONSTRAINT "pk_fundacion_archivo" PRIMARY KEY ("id_fundacion_archivo");



ALTER TABLE ONLY "public"."gasto"
    ADD CONSTRAINT "pk_gasto" PRIMARY KEY ("id_gasto");



ALTER TABLE ONLY "public"."gasto_archivo"
    ADD CONSTRAINT "pk_gasto_archivo" PRIMARY KEY ("id_gasto_archivo");



ALTER TABLE ONLY "public"."historial_estado"
    ADD CONSTRAINT "pk_historial_estado" PRIMARY KEY ("id_historial_estado");



ALTER TABLE ONLY "public"."hogar_temporal"
    ADD CONSTRAINT "pk_hogar_temporal" PRIMARY KEY ("id_hogar");



ALTER TABLE ONLY "public"."permanencia_animal_hogar"
    ADD CONSTRAINT "pk_permanencia_animal_hogar" PRIMARY KEY ("id_permanencia");



ALTER TABLE ONLY "public"."profesional"
    ADD CONSTRAINT "pk_profesional" PRIMARY KEY ("id_profesional");



ALTER TABLE ONLY "public"."proyecto_archivo"
    ADD CONSTRAINT "pk_proyecto_archivo" PRIMARY KEY ("id_proyecto_archivo");



ALTER TABLE ONLY "public"."proyecto_esterilizacion"
    ADD CONSTRAINT "pk_proyecto_esterilizacion" PRIMARY KEY ("id_proyecto");



ALTER TABLE ONLY "public"."rango_etario"
    ADD CONSTRAINT "pk_rango_etario" PRIMARY KEY ("id_rango_etario");



ALTER TABLE ONLY "public"."seguimiento"
    ADD CONSTRAINT "pk_seguimiento" PRIMARY KEY ("id_seguimiento");



ALTER TABLE ONLY "public"."tipo_atencion_sanitaria"
    ADD CONSTRAINT "pk_tipo_atencion_sanitaria" PRIMARY KEY ("id_tipo_atencion");



ALTER TABLE ONLY "public"."usuario"
    ADD CONSTRAINT "pk_usuario" PRIMARY KEY ("id_usuario");



ALTER TABLE ONLY "public"."adopcion_archivo"
    ADD CONSTRAINT "uq_adopcion_archivo" UNIQUE ("id_adopcion", "id_archivo");



ALTER TABLE ONLY "public"."adoptante"
    ADD CONSTRAINT "uq_adoptante_rut" UNIQUE ("rut");



ALTER TABLE ONLY "public"."animal_archivo"
    ADD CONSTRAINT "uq_animal_archivo" UNIQUE ("id_animal", "id_archivo");



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "uq_animal_esterilizacion_codigo" UNIQUE ("id_proyecto", "codigo");



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "uq_animal_esterilizacion_proyecto_microchip" UNIQUE ("id_proyecto", "microchip");



ALTER TABLE ONLY "public"."animal_gasto"
    ADD CONSTRAINT "uq_animal_gasto" UNIQUE ("id_animal", "id_gasto");



ALTER TABLE ONLY "public"."animal"
    ADD CONSTRAINT "uq_animal_microchip" UNIQUE ("microchip");



ALTER TABLE ONLY "public"."archivo"
    ADD CONSTRAINT "uq_archivo_id_externo" UNIQUE ("id_externo");



ALTER TABLE ONLY "public"."categoria_archivo"
    ADD CONSTRAINT "uq_categoria_archivo_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."categoria_gasto"
    ADD CONSTRAINT "uq_categoria_gasto_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."especie"
    ADD CONSTRAINT "uq_especie_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."estado_adopcion"
    ADD CONSTRAINT "uq_estado_adopcion_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."estado"
    ADD CONSTRAINT "uq_estado_nombre" UNIQUE ("nombre_estado");



ALTER TABLE ONLY "public"."estado_proyecto"
    ADD CONSTRAINT "uq_estado_proyecto_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."esterilizacion_archivo"
    ADD CONSTRAINT "uq_esterilizacion_archivo" UNIQUE ("id_animal_esterilizacion", "id_archivo");



ALTER TABLE ONLY "public"."esterilizacion_profesional"
    ADD CONSTRAINT "uq_esterilizacion_profesional" UNIQUE ("id_animal_esterilizacion", "id_profesional");



ALTER TABLE ONLY "public"."fundacion_archivo"
    ADD CONSTRAINT "uq_fundacion_archivo" UNIQUE ("id_archivo");



ALTER TABLE ONLY "public"."gasto_archivo"
    ADD CONSTRAINT "uq_gasto_archivo" UNIQUE ("id_gasto", "id_archivo");



ALTER TABLE ONLY "public"."proyecto_archivo"
    ADD CONSTRAINT "uq_proyecto_archivo" UNIQUE ("id_proyecto", "id_archivo");



ALTER TABLE ONLY "public"."rango_etario"
    ADD CONSTRAINT "uq_rango_etario_nombre" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tipo_atencion_sanitaria"
    ADD CONSTRAINT "uq_tipo_atencion_sanitaria_nombre" UNIQUE ("nombre");



CREATE INDEX "idx_adopcion_adoptante" ON "public"."adopcion" USING "btree" ("id_adoptante");



CREATE INDEX "idx_adopcion_animal" ON "public"."adopcion" USING "btree" ("id_animal");



CREATE INDEX "idx_adopcion_archivo_adopcion" ON "public"."adopcion_archivo" USING "btree" ("id_adopcion");



CREATE INDEX "idx_adopcion_archivo_archivo" ON "public"."adopcion_archivo" USING "btree" ("id_archivo");



CREATE INDEX "idx_adopcion_estado" ON "public"."adopcion" USING "btree" ("id_estado_adopcion");



CREATE INDEX "idx_animal_archivo_animal" ON "public"."animal_archivo" USING "btree" ("id_animal");



CREATE INDEX "idx_animal_archivo_archivo" ON "public"."animal_archivo" USING "btree" ("id_archivo");



CREATE INDEX "idx_animal_especie" ON "public"."animal" USING "btree" ("id_especie");



CREATE INDEX "idx_animal_estado_actual" ON "public"."animal" USING "btree" ("id_estado_actual");



CREATE INDEX "idx_animal_esterilizacion_especie" ON "public"."animal_esterilizacion" USING "btree" ("id_especie");



CREATE INDEX "idx_animal_esterilizacion_proyecto" ON "public"."animal_esterilizacion" USING "btree" ("id_proyecto");



CREATE INDEX "idx_animal_esterilizacion_rango" ON "public"."animal_esterilizacion" USING "btree" ("id_rango_etario");



CREATE INDEX "idx_animal_gasto_animal" ON "public"."animal_gasto" USING "btree" ("id_animal");



CREATE INDEX "idx_animal_gasto_gasto" ON "public"."animal_gasto" USING "btree" ("id_gasto");



CREATE INDEX "idx_animal_rango_etario" ON "public"."animal" USING "btree" ("id_rango_etario");



CREATE INDEX "idx_archivo_categoria" ON "public"."archivo" USING "btree" ("id_categoria_archivo");



CREATE INDEX "idx_archivo_fecha_documento" ON "public"."archivo" USING "btree" ("fecha_documento");



CREATE INDEX "idx_atencion_sanitaria_animal" ON "public"."atencion_sanitaria" USING "btree" ("id_animal");



CREATE INDEX "idx_atencion_sanitaria_tipo" ON "public"."atencion_sanitaria" USING "btree" ("id_tipo_atencion");



CREATE INDEX "idx_esterilizacion_archivo_animal" ON "public"."esterilizacion_archivo" USING "btree" ("id_animal_esterilizacion");



CREATE INDEX "idx_esterilizacion_archivo_archivo" ON "public"."esterilizacion_archivo" USING "btree" ("id_archivo");



CREATE INDEX "idx_esterilizacion_profesional_animal" ON "public"."esterilizacion_profesional" USING "btree" ("id_animal_esterilizacion");



CREATE INDEX "idx_esterilizacion_profesional_profesional" ON "public"."esterilizacion_profesional" USING "btree" ("id_profesional");



CREATE INDEX "idx_gasto_archivo_archivo" ON "public"."gasto_archivo" USING "btree" ("id_archivo");



CREATE INDEX "idx_gasto_archivo_gasto" ON "public"."gasto_archivo" USING "btree" ("id_gasto");



CREATE INDEX "idx_gasto_categoria" ON "public"."gasto" USING "btree" ("id_categoria_gasto");



CREATE INDEX "idx_gasto_fecha" ON "public"."gasto" USING "btree" ("fecha");



CREATE INDEX "idx_historial_estado_animal" ON "public"."historial_estado" USING "btree" ("id_animal");



CREATE INDEX "idx_historial_estado_estado" ON "public"."historial_estado" USING "btree" ("id_estado");



CREATE INDEX "idx_permanencia_animal" ON "public"."permanencia_animal_hogar" USING "btree" ("id_animal");



CREATE INDEX "idx_permanencia_hogar" ON "public"."permanencia_animal_hogar" USING "btree" ("id_hogar");



CREATE INDEX "idx_proyecto_archivo_archivo" ON "public"."proyecto_archivo" USING "btree" ("id_archivo");



CREATE INDEX "idx_proyecto_archivo_proyecto" ON "public"."proyecto_archivo" USING "btree" ("id_proyecto");



CREATE INDEX "idx_proyecto_estado" ON "public"."proyecto_esterilizacion" USING "btree" ("id_estado_proyecto");



CREATE INDEX "idx_seguimiento_adopcion" ON "public"."seguimiento" USING "btree" ("id_adopcion");



CREATE INDEX "idx_seguimiento_fecha" ON "public"."seguimiento" USING "btree" ("fecha");



-- Índices únicos parciales: garantizan en la BD reglas de negocio de "un solo registro vigente"
-- (una adopción activa por animal, un historial abierto, una permanencia activa, un documento por esterilización).
CREATE UNIQUE INDEX "uq_adopcion_animal_activa" ON "public"."adopcion" USING "btree" ("id_animal") WHERE ("fecha_finalizacion" IS NULL);



CREATE UNIQUE INDEX "uq_esterilizacion_archivo_documento" ON "public"."esterilizacion_archivo" USING "btree" ("id_animal_esterilizacion");



COMMENT ON INDEX "public"."uq_esterilizacion_archivo_documento" IS 'Un único documento principal (PDF, JPG, PNG o WebP) por animal de esterilización.';



CREATE UNIQUE INDEX "uq_historial_estado_abierto" ON "public"."historial_estado" USING "btree" ("id_animal") WHERE ("fecha_fin" IS NULL);



CREATE UNIQUE INDEX "uq_permanencia_animal_activa" ON "public"."permanencia_animal_hogar" USING "btree" ("id_animal") WHERE ("fecha_salida" IS NULL);



ALTER TABLE ONLY "public"."adopcion"
    ADD CONSTRAINT "fk_adopcion_adoptante" FOREIGN KEY ("id_adoptante") REFERENCES "public"."adoptante"("id_adoptante") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."adopcion"
    ADD CONSTRAINT "fk_adopcion_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."adopcion_archivo"
    ADD CONSTRAINT "fk_adopcion_archivo_adopcion" FOREIGN KEY ("id_adopcion") REFERENCES "public"."adopcion"("id_adopcion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adopcion_archivo"
    ADD CONSTRAINT "fk_adopcion_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adopcion"
    ADD CONSTRAINT "fk_adopcion_estado" FOREIGN KEY ("id_estado_adopcion") REFERENCES "public"."estado_adopcion"("id_estado_adopcion") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_archivo"
    ADD CONSTRAINT "fk_animal_archivo_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animal_archivo"
    ADD CONSTRAINT "fk_animal_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animal"
    ADD CONSTRAINT "fk_animal_especie" FOREIGN KEY ("id_especie") REFERENCES "public"."especie"("id_especie") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal"
    ADD CONSTRAINT "fk_animal_estado_actual" FOREIGN KEY ("id_estado_actual") REFERENCES "public"."estado"("id_estado") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "fk_animal_esterilizacion_especie" FOREIGN KEY ("id_especie") REFERENCES "public"."especie"("id_especie") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "fk_animal_esterilizacion_proyecto" FOREIGN KEY ("id_proyecto") REFERENCES "public"."proyecto_esterilizacion"("id_proyecto") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_esterilizacion"
    ADD CONSTRAINT "fk_animal_esterilizacion_rango" FOREIGN KEY ("id_rango_etario") REFERENCES "public"."rango_etario"("id_rango_etario") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_gasto"
    ADD CONSTRAINT "fk_animal_gasto_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal_gasto"
    ADD CONSTRAINT "fk_animal_gasto_gasto" FOREIGN KEY ("id_gasto") REFERENCES "public"."gasto"("id_gasto") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."animal"
    ADD CONSTRAINT "fk_animal_rango_etario" FOREIGN KEY ("id_rango_etario") REFERENCES "public"."rango_etario"("id_rango_etario") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."archivo"
    ADD CONSTRAINT "fk_archivo_categoria" FOREIGN KEY ("id_categoria_archivo") REFERENCES "public"."categoria_archivo"("id_categoria_archivo") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."atencion_sanitaria"
    ADD CONSTRAINT "fk_atencion_sanitaria_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."atencion_sanitaria"
    ADD CONSTRAINT "fk_atencion_sanitaria_tipo" FOREIGN KEY ("id_tipo_atencion") REFERENCES "public"."tipo_atencion_sanitaria"("id_tipo_atencion") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."esterilizacion_archivo"
    ADD CONSTRAINT "fk_esterilizacion_archivo_animal" FOREIGN KEY ("id_animal_esterilizacion") REFERENCES "public"."animal_esterilizacion"("id_animal_esterilizacion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."esterilizacion_archivo"
    ADD CONSTRAINT "fk_esterilizacion_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."esterilizacion_profesional"
    ADD CONSTRAINT "fk_esterilizacion_profesional_animal" FOREIGN KEY ("id_animal_esterilizacion") REFERENCES "public"."animal_esterilizacion"("id_animal_esterilizacion") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."esterilizacion_profesional"
    ADD CONSTRAINT "fk_esterilizacion_profesional_profesional" FOREIGN KEY ("id_profesional") REFERENCES "public"."profesional"("id_profesional") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fundacion_archivo"
    ADD CONSTRAINT "fk_fundacion_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gasto_archivo"
    ADD CONSTRAINT "fk_gasto_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gasto_archivo"
    ADD CONSTRAINT "fk_gasto_archivo_gasto" FOREIGN KEY ("id_gasto") REFERENCES "public"."gasto"("id_gasto") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gasto"
    ADD CONSTRAINT "fk_gasto_categoria" FOREIGN KEY ("id_categoria_gasto") REFERENCES "public"."categoria_gasto"("id_categoria_gasto") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."historial_estado"
    ADD CONSTRAINT "fk_historial_estado_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."historial_estado"
    ADD CONSTRAINT "fk_historial_estado_estado" FOREIGN KEY ("id_estado") REFERENCES "public"."estado"("id_estado") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."permanencia_animal_hogar"
    ADD CONSTRAINT "fk_permanencia_animal" FOREIGN KEY ("id_animal") REFERENCES "public"."animal"("id_animal") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."permanencia_animal_hogar"
    ADD CONSTRAINT "fk_permanencia_hogar" FOREIGN KEY ("id_hogar") REFERENCES "public"."hogar_temporal"("id_hogar") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."proyecto_archivo"
    ADD CONSTRAINT "fk_proyecto_archivo_archivo" FOREIGN KEY ("id_archivo") REFERENCES "public"."archivo"("id_archivo") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proyecto_archivo"
    ADD CONSTRAINT "fk_proyecto_archivo_proyecto" FOREIGN KEY ("id_proyecto") REFERENCES "public"."proyecto_esterilizacion"("id_proyecto") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proyecto_esterilizacion"
    ADD CONSTRAINT "fk_proyecto_estado" FOREIGN KEY ("id_estado_proyecto") REFERENCES "public"."estado_proyecto"("id_estado_proyecto") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."seguimiento"
    ADD CONSTRAINT "fk_seguimiento_adopcion" FOREIGN KEY ("id_adopcion") REFERENCES "public"."adopcion"("id_adopcion") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."usuario"
    ADD CONSTRAINT "fk_usuario_auth" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



-- Políticas RLS: todas exigen es_usuario_activo() y se aplican solo al rol authenticated.
-- anon no tiene políticas, por lo que no ve ni modifica ninguna fila. No existen políticas DELETE.
-- Qué columnas puede escribir cada tabla lo limitan además los GRANT del final (script de seguridad 09).
CREATE POLICY "Usuarios activos pueden actualizar adopciones" ON "public"."adopcion" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar adoptantes" ON "public"."adoptante" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar animales" ON "public"."animal" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar animales de esterilización" ON "public"."animal_esterilizacion" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos" ON "public"."archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de adopciones" ON "public"."adopcion_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de animales" ON "public"."animal_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de esterilizaciones" ON "public"."esterilizacion_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de fundación" ON "public"."fundacion_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de gastos" ON "public"."gasto_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar archivos de proyectos" ON "public"."proyecto_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar asignaciones de gasto" ON "public"."animal_gasto" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar atenciones sanitarias" ON "public"."atencion_sanitaria" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar categorías de archivo" ON "public"."categoria_archivo" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar categorías de gasto" ON "public"."categoria_gasto" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar especies" ON "public"."especie" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar estados" ON "public"."estado" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar estados de adopción" ON "public"."estado_adopcion" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar estados de proyecto" ON "public"."estado_proyecto" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar gastos" ON "public"."gasto" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar historial de estados" ON "public"."historial_estado" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar hogares temporales" ON "public"."hogar_temporal" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar permanencias" ON "public"."permanencia_animal_hogar" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar profesionales" ON "public"."profesional" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar profesionales de esterilizac" ON "public"."esterilizacion_profesional" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar proyectos de esterilización" ON "public"."proyecto_esterilizacion" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar rangos etarios" ON "public"."rango_etario" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar seguimientos" ON "public"."seguimiento" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden actualizar tipos de atención sanitaria" ON "public"."tipo_atencion_sanitaria" FOR UPDATE TO "authenticated" USING ("public"."es_usuario_activo"()) WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar adopciones" ON "public"."adopcion" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar adoptantes" ON "public"."adoptante" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar animales" ON "public"."animal" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar animales de esterilización" ON "public"."animal_esterilizacion" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos" ON "public"."archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de adopciones" ON "public"."adopcion_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de animales" ON "public"."animal_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de esterilizaciones" ON "public"."esterilizacion_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de fundación" ON "public"."fundacion_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de gastos" ON "public"."gasto_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar archivos de proyectos" ON "public"."proyecto_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar asignaciones de gasto" ON "public"."animal_gasto" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar atenciones sanitarias" ON "public"."atencion_sanitaria" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar categorías de archivo" ON "public"."categoria_archivo" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar categorías de gasto" ON "public"."categoria_gasto" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar especies" ON "public"."especie" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar estados" ON "public"."estado" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar estados de adopción" ON "public"."estado_adopcion" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar estados de proyecto" ON "public"."estado_proyecto" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar gastos" ON "public"."gasto" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar historial de estados" ON "public"."historial_estado" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar hogares temporales" ON "public"."hogar_temporal" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar permanencias" ON "public"."permanencia_animal_hogar" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar profesionales" ON "public"."profesional" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar profesionales de esterilizaci" ON "public"."esterilizacion_profesional" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar proyectos de esterilización" ON "public"."proyecto_esterilizacion" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar rangos etarios" ON "public"."rango_etario" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar seguimientos" ON "public"."seguimiento" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar tipos de atención sanitaria" ON "public"."tipo_atencion_sanitaria" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden consultar usuarios" ON "public"."usuario" FOR SELECT TO "authenticated" USING ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar adopciones" ON "public"."adopcion" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar adoptantes" ON "public"."adoptante" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar animales" ON "public"."animal" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar animales de esterilización" ON "public"."animal_esterilizacion" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos" ON "public"."archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de adopciones" ON "public"."adopcion_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de animales" ON "public"."animal_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de esterilizaciones" ON "public"."esterilizacion_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de fundación" ON "public"."fundacion_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de gastos" ON "public"."gasto_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar archivos de proyectos" ON "public"."proyecto_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar asignaciones de gasto" ON "public"."animal_gasto" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar atenciones sanitarias" ON "public"."atencion_sanitaria" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar categorías de archivo" ON "public"."categoria_archivo" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar categorías de gasto" ON "public"."categoria_gasto" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar especies" ON "public"."especie" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar estados" ON "public"."estado" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar estados de adopción" ON "public"."estado_adopcion" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar estados de proyecto" ON "public"."estado_proyecto" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar gastos" ON "public"."gasto" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar historial de estados" ON "public"."historial_estado" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar hogares temporales" ON "public"."hogar_temporal" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar permanencias" ON "public"."permanencia_animal_hogar" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar profesionales" ON "public"."profesional" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar profesionales de esterilizaci" ON "public"."esterilizacion_profesional" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar proyectos de esterilización" ON "public"."proyecto_esterilizacion" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar rangos etarios" ON "public"."rango_etario" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar seguimientos" ON "public"."seguimiento" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



CREATE POLICY "Usuarios activos pueden insertar tipos de atención sanitaria" ON "public"."tipo_atencion_sanitaria" FOR INSERT TO "authenticated" WITH CHECK ("public"."es_usuario_activo"());



-- RLS activado en todas las tablas: sin una política que lo permita, la fila no es visible.
ALTER TABLE "public"."adopcion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adopcion_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adoptante" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animal_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animal_esterilizacion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animal_gasto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atencion_sanitaria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categoria_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categoria_gasto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."especie" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estado" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estado_adopcion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estado_proyecto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."esterilizacion_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."esterilizacion_profesional" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundacion_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gasto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gasto_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_estado" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hogar_temporal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permanencia_animal_hogar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profesional" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proyecto_archivo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proyecto_esterilizacion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rango_etario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seguimiento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipo_atencion_sanitaria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuario" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


-- Permisos. Las RPC y Edge Functions escriben con privilegios propios; el navegador (authenticated)
-- solo recibe SELECT y la escritura mínima por tabla/columna. anon tiene SELECT, pero RLS no le devuelve filas.
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































-- Funciones: se revoca el acceso por defecto (PUBLIC) y se concede EXECUTE solo a quien corresponde.
REVOKE ALL ON FUNCTION "public"."_cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activar_usuario"("p_id_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activar_usuario"("p_id_usuario" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activar_usuario"("p_id_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."actualizar_mi_nombre"("p_nombre" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."actualizar_mi_nombre"("p_nombre" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_mi_nombre"("p_nombre" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."asignar_gasto_animal"("p_id_gasto" bigint, "p_id_animal" bigint, "p_monto_asignado" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asignar_gasto_animal"("p_id_gasto" bigint, "p_id_animal" bigint, "p_monto_asignado" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."asignar_gasto_animal"("p_id_gasto" bigint, "p_id_animal" bigint, "p_monto_asignado" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cambiar_estado_animal"("p_id_animal" bigint, "p_id_nuevo_estado" bigint, "p_motivo_cambio" "text", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cambiar_hogar_temporal"("p_id_animal" bigint, "p_id_nuevo_hogar" bigint, "p_fecha_cambio" "date", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cambiar_hogar_temporal"("p_id_animal" bigint, "p_id_nuevo_hogar" bigint, "p_fecha_cambio" "date", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cambiar_hogar_temporal"("p_id_animal" bigint, "p_id_nuevo_hogar" bigint, "p_fecha_cambio" "date", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_usuario_publico"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_usuario_publico"() TO "service_role";
GRANT ALL ON FUNCTION "public"."crear_usuario_publico"() TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."desactivar_usuario"("p_id_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."desactivar_usuario"("p_id_usuario" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."desactivar_usuario"("p_id_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."es_usuario_activo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."es_usuario_activo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."es_usuario_activo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalizar_hogar_temporal"("p_id_animal" bigint, "p_fecha_salida" "date", "p_id_nuevo_estado" bigint, "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalizar_hogar_temporal"("p_id_animal" bigint, "p_fecha_salida" "date", "p_id_nuevo_estado" bigint, "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalizar_hogar_temporal"("p_id_animal" bigint, "p_fecha_salida" "date", "p_id_nuevo_estado" bigint, "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingresar_hogar_temporal"("p_id_animal" bigint, "p_id_hogar" bigint, "p_fecha_ingreso" "date", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingresar_hogar_temporal"("p_id_animal" bigint, "p_id_hogar" bigint, "p_fecha_ingreso" "date", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingresar_hogar_temporal"("p_id_animal" bigint, "p_id_hogar" bigint, "p_fecha_ingreso" "date", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."listar_usuarias"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listar_usuarias"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."listar_usuarias"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."quitar_profesional_esterilizacion"("p_id_esterilizacion_profesional" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quitar_profesional_esterilizacion"("p_id_esterilizacion_profesional" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."quitar_profesional_esterilizacion"("p_id_esterilizacion_profesional" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_adopcion"("p_id_animal" bigint, "p_id_adoptante" bigint, "p_fecha_adopcion" "date", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_adopcion"("p_id_animal" bigint, "p_id_adoptante" bigint, "p_fecha_adopcion" "date", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_adopcion"("p_id_animal" bigint, "p_id_adoptante" bigint, "p_fecha_adopcion" "date", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_animal"("p_id_especie" bigint, "p_id_rango_etario" bigint, "p_nombre" character varying, "p_sexo" character varying, "p_tamano" character varying, "p_fecha_nacimiento" "date", "p_fecha_rescate" "date", "p_lugar_rescate" character varying, "p_caracteristicas" "text", "p_personalidad" "text", "p_historia_rescate" "text", "p_observaciones" "text", "p_microchip" character varying, "p_estado_registro_nacional" character varying, "p_estado_esterilizacion" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_animal"("p_id_especie" bigint, "p_id_rango_etario" bigint, "p_nombre" character varying, "p_sexo" character varying, "p_tamano" character varying, "p_fecha_nacimiento" "date", "p_fecha_rescate" "date", "p_lugar_rescate" character varying, "p_caracteristicas" "text", "p_personalidad" "text", "p_historia_rescate" "text", "p_observaciones" "text", "p_microchip" character varying, "p_estado_registro_nacional" character varying, "p_estado_esterilizacion" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_animal"("p_id_especie" bigint, "p_id_rango_etario" bigint, "p_nombre" character varying, "p_sexo" character varying, "p_tamano" character varying, "p_fecha_nacimiento" "date", "p_fecha_rescate" "date", "p_lugar_rescate" character varying, "p_caracteristicas" "text", "p_personalidad" "text", "p_historia_rescate" "text", "p_observaciones" "text", "p_microchip" character varying, "p_estado_registro_nacional" character varying, "p_estado_esterilizacion" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_archivo"("p_id_categoria_archivo" bigint, "p_nombre_archivo" character varying, "p_nombre_original" character varying, "p_mime_type" character varying, "p_id_externo" character varying, "p_fecha_documento" "date", "p_descripcion" "text", "p_tipo_contexto" character varying, "p_id_contexto" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_archivo"("p_id_categoria_archivo" bigint, "p_nombre_archivo" character varying, "p_nombre_original" character varying, "p_mime_type" character varying, "p_id_externo" character varying, "p_fecha_documento" "date", "p_descripcion" "text", "p_tipo_contexto" character varying, "p_id_contexto" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_archivo"("p_id_categoria_archivo" bigint, "p_nombre_archivo" character varying, "p_nombre_original" character varying, "p_mime_type" character varying, "p_id_externo" character varying, "p_fecha_documento" "date", "p_descripcion" "text", "p_tipo_contexto" character varying, "p_id_contexto" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_devolucion"("p_id_adopcion" bigint, "p_fecha_devolucion" "date", "p_id_nuevo_estado" bigint, "p_motivo" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_devolucion"("p_id_adopcion" bigint, "p_fecha_devolucion" "date", "p_id_nuevo_estado" bigint, "p_motivo" "text", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_devolucion"("p_id_adopcion" bigint, "p_fecha_devolucion" "date", "p_id_nuevo_estado" bigint, "p_motivo" "text", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_seguimiento"("p_id_adopcion" bigint, "p_fecha" "date", "p_medio_contacto" character varying, "p_situacion_animal" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_seguimiento"("p_id_adopcion" bigint, "p_fecha" "date", "p_medio_contacto" character varying, "p_situacion_animal" "text", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_seguimiento"("p_id_adopcion" bigint, "p_fecha" "date", "p_medio_contacto" character varying, "p_situacion_animal" "text", "p_observaciones" "text") TO "service_role";


















GRANT SELECT ON TABLE "public"."adopcion" TO "anon";
GRANT SELECT ON TABLE "public"."adopcion" TO "authenticated";
GRANT ALL ON TABLE "public"."adopcion" TO "service_role";



GRANT SELECT ON TABLE "public"."adopcion_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."adopcion_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."adopcion_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adopcion_archivo_id_adopcion_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adopcion_archivo_id_adopcion_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adopcion_archivo_id_adopcion_archivo_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adopcion_id_adopcion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adopcion_id_adopcion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adopcion_id_adopcion_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."adoptante" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."adoptante" TO "authenticated";
GRANT ALL ON TABLE "public"."adoptante" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adoptante_id_adoptante_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adoptante_id_adoptante_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adoptante_id_adoptante_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."animal" TO "anon";
GRANT SELECT ON TABLE "public"."animal" TO "authenticated";
-- Solo columnas descriptivas: estado, activo y carpeta Drive se modifican únicamente por RPC o Edge Function.
GRANT UPDATE(nombre, id_especie, id_rango_etario, sexo, "tamaño", fecha_nacimiento, fecha_rescate, lugar_rescate, caracteristicas, personalidad, historia_rescate, observaciones, microchip, estado_registro_nacional, estado_esterilizacion, foto_principal_path) ON TABLE "public"."animal" TO "authenticated";
GRANT ALL ON TABLE "public"."animal" TO "service_role";



GRANT SELECT ON TABLE "public"."animal_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."animal_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."animal_archivo_id_animal_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."animal_archivo_id_animal_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."animal_archivo_id_animal_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."animal_esterilizacion" TO "anon";
GRANT SELECT ON TABLE "public"."animal_esterilizacion" TO "authenticated";
GRANT INSERT(id_proyecto, codigo, id_especie, id_rango_etario, sexo, fecha_nacimiento, caracteristicas, sector_origen, fecha_esterilizacion, lugar_esterilizacion, microchip, estado_registro_nacional, observaciones) ON TABLE "public"."animal_esterilizacion" TO "authenticated";
GRANT UPDATE(codigo, id_especie, id_rango_etario, sexo, fecha_nacimiento, caracteristicas, sector_origen, fecha_esterilizacion, lugar_esterilizacion, microchip, estado_registro_nacional, observaciones) ON TABLE "public"."animal_esterilizacion" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_esterilizacion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."animal_esterilizacion_id_animal_esterilizacion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."animal_esterilizacion_id_animal_esterilizacion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."animal_esterilizacion_id_animal_esterilizacion_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."animal_gasto" TO "anon";
GRANT SELECT ON TABLE "public"."animal_gasto" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_gasto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."animal_gasto_id_animal_gasto_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."animal_gasto_id_animal_gasto_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."animal_gasto_id_animal_gasto_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."animal_id_animal_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."animal_id_animal_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."animal_id_animal_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."archivo" TO "anon";
GRANT SELECT ON TABLE "public"."archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."archivo_id_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."archivo_id_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."archivo_id_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."atencion_sanitaria" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."atencion_sanitaria" TO "authenticated";
GRANT ALL ON TABLE "public"."atencion_sanitaria" TO "service_role";



GRANT ALL ON SEQUENCE "public"."atencion_sanitaria_id_atencion_sanitaria_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."atencion_sanitaria_id_atencion_sanitaria_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."atencion_sanitaria_id_atencion_sanitaria_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."categoria_archivo" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."categoria_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."categoria_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categoria_archivo_id_categoria_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categoria_archivo_id_categoria_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categoria_archivo_id_categoria_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."categoria_gasto" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."categoria_gasto" TO "authenticated";
GRANT ALL ON TABLE "public"."categoria_gasto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categoria_gasto_id_categoria_gasto_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categoria_gasto_id_categoria_gasto_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categoria_gasto_id_categoria_gasto_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."especie" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."especie" TO "authenticated";
GRANT ALL ON TABLE "public"."especie" TO "service_role";



GRANT ALL ON SEQUENCE "public"."especie_id_especie_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."especie_id_especie_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."especie_id_especie_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."estado" TO "anon";
GRANT SELECT ON TABLE "public"."estado" TO "authenticated";
GRANT UPDATE(descripcion) ON TABLE "public"."estado" TO "authenticated";
GRANT ALL ON TABLE "public"."estado" TO "service_role";



GRANT SELECT ON TABLE "public"."estado_adopcion" TO "anon";
GRANT SELECT ON TABLE "public"."estado_adopcion" TO "authenticated";
GRANT UPDATE(descripcion) ON TABLE "public"."estado_adopcion" TO "authenticated";
GRANT ALL ON TABLE "public"."estado_adopcion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."estado_adopcion_id_estado_adopcion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."estado_adopcion_id_estado_adopcion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."estado_adopcion_id_estado_adopcion_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."estado_id_estado_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."estado_id_estado_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."estado_id_estado_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."estado_proyecto" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."estado_proyecto" TO "authenticated";
GRANT ALL ON TABLE "public"."estado_proyecto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."estado_proyecto_id_estado_proyecto_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."estado_proyecto_id_estado_proyecto_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."estado_proyecto_id_estado_proyecto_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."esterilizacion_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."esterilizacion_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."esterilizacion_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."esterilizacion_archivo_id_esterilizacion_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."esterilizacion_archivo_id_esterilizacion_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."esterilizacion_archivo_id_esterilizacion_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."esterilizacion_profesional" TO "anon";
GRANT SELECT ON TABLE "public"."esterilizacion_profesional" TO "authenticated";
GRANT INSERT(id_animal_esterilizacion, id_profesional, funcion) ON TABLE "public"."esterilizacion_profesional" TO "authenticated";
GRANT UPDATE(funcion) ON TABLE "public"."esterilizacion_profesional" TO "authenticated";
GRANT ALL ON TABLE "public"."esterilizacion_profesional" TO "service_role";



GRANT ALL ON SEQUENCE "public"."esterilizacion_profesional_id_esterilizacion_profesional_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."esterilizacion_profesional_id_esterilizacion_profesional_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."esterilizacion_profesional_id_esterilizacion_profesional_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."fundacion_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."fundacion_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."fundacion_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fundacion_archivo_id_fundacion_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fundacion_archivo_id_fundacion_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fundacion_archivo_id_fundacion_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."gasto" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."gasto" TO "authenticated";
GRANT ALL ON TABLE "public"."gasto" TO "service_role";



GRANT SELECT ON TABLE "public"."gasto_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."gasto_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."gasto_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gasto_archivo_id_gasto_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gasto_archivo_id_gasto_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gasto_archivo_id_gasto_archivo_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gasto_id_gasto_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gasto_id_gasto_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gasto_id_gasto_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."historial_estado" TO "anon";
-- Tabla de proceso: solo lectura para el navegador; la escriben exclusivamente las RPC.
GRANT SELECT ON TABLE "public"."historial_estado" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_estado" TO "service_role";



GRANT ALL ON SEQUENCE "public"."historial_estado_id_historial_estado_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."historial_estado_id_historial_estado_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."historial_estado_id_historial_estado_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."hogar_temporal" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."hogar_temporal" TO "authenticated";
GRANT ALL ON TABLE "public"."hogar_temporal" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hogar_temporal_id_hogar_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hogar_temporal_id_hogar_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hogar_temporal_id_hogar_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."permanencia_animal_hogar" TO "anon";
GRANT SELECT ON TABLE "public"."permanencia_animal_hogar" TO "authenticated";
GRANT ALL ON TABLE "public"."permanencia_animal_hogar" TO "service_role";



GRANT ALL ON SEQUENCE "public"."permanencia_animal_hogar_id_permanencia_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."permanencia_animal_hogar_id_permanencia_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."permanencia_animal_hogar_id_permanencia_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."profesional" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."profesional" TO "authenticated";
GRANT ALL ON TABLE "public"."profesional" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profesional_id_profesional_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profesional_id_profesional_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profesional_id_profesional_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."proyecto_archivo" TO "anon";
GRANT SELECT ON TABLE "public"."proyecto_archivo" TO "authenticated";
GRANT ALL ON TABLE "public"."proyecto_archivo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proyecto_archivo_id_proyecto_archivo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proyecto_archivo_id_proyecto_archivo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proyecto_archivo_id_proyecto_archivo_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."proyecto_esterilizacion" TO "anon";
GRANT SELECT ON TABLE "public"."proyecto_esterilizacion" TO "authenticated";
GRANT INSERT(id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin, responsable, entidad_financiante, descripcion, observaciones) ON TABLE "public"."proyecto_esterilizacion" TO "authenticated";
GRANT UPDATE(id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin, responsable, entidad_financiante, descripcion, observaciones) ON TABLE "public"."proyecto_esterilizacion" TO "authenticated";
GRANT ALL ON TABLE "public"."proyecto_esterilizacion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proyecto_esterilizacion_id_proyecto_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proyecto_esterilizacion_id_proyecto_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proyecto_esterilizacion_id_proyecto_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."rango_etario" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."rango_etario" TO "authenticated";
GRANT ALL ON TABLE "public"."rango_etario" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rango_etario_id_rango_etario_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rango_etario_id_rango_etario_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rango_etario_id_rango_etario_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."seguimiento" TO "anon";
GRANT SELECT ON TABLE "public"."seguimiento" TO "authenticated";
GRANT ALL ON TABLE "public"."seguimiento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."seguimiento_id_seguimiento_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."seguimiento_id_seguimiento_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."seguimiento_id_seguimiento_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."tipo_atencion_sanitaria" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."tipo_atencion_sanitaria" TO "authenticated";
GRANT ALL ON TABLE "public"."tipo_atencion_sanitaria" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipo_atencion_sanitaria_id_tipo_atencion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipo_atencion_sanitaria_id_tipo_atencion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipo_atencion_sanitaria_id_tipo_atencion_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."usuario" TO "anon";
GRANT SELECT ON TABLE "public"."usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."usuario" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































