-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Refuerzo de integridad sobre backend v1.1 — 23/09/2026
--
-- Huecos corregidos:
--
--   1. cambiar_estado_animal permitía un cambio manual de estado
--      mientras el animal tenía una permanencia activa en hogar
--      temporal o una adopción activa, dejando esos procesos
--      abiertos e inconsistentes con el estado (RN-52, RN-56).
--
--   2. ingresar_hogar_temporal permitía ingresar a un hogar a un
--      animal con adopción activa / estado Adoptado (RN-51, RN-54).
--
-- Cambio COMPATIBLE: se conservan firmas, tipos de retorno,
-- SECURITY DEFINER, search_path, dueño y privilegios
-- (CREATE OR REPLACE mantiene el ACL existente). Solo se agregan
-- rechazos para situaciones que las reglas de negocio no admiten.
-- Además, ambas funciones bloquean primero la fila del animal
-- para serializar operaciones concurrentes sobre el mismo animal.
--
-- La función interna _cambiar_estado_animal NO se modifica: la
-- usan los procesos (ingreso, finalización, adopción, devolución),
-- que sí deben poder cambiar el estado.
--
-- No modifica datos. Ejecutar completo en Supabase → SQL Editor.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. cambiar_estado_animal
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 2. ingresar_hogar_temporal
-- ------------------------------------------------------------
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

COMMIT;
