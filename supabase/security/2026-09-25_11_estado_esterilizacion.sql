-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Estado de esterilización del animal rescatado — 25/09/2026
--
-- Requerimiento de la Fundación: registrar si cada animal
-- rescatado está esterilizado. Es un dato propio de la ficha
-- y es independiente de las atenciones sanitarias (un animal
-- puede llegar ya esterilizado) y del módulo de proyectos de
-- esterilización (ANIMAL_ESTERILIZACION no se modifica).
--
-- Cambios:
--   1. ANIMAL.estado_esterilizacion VARCHAR(20) NOT NULL
--      DEFAULT 'Sin información', con CHECK de valores:
--      Esterilizado / No esterilizado / Sin información.
--      Los animales existentes quedan en 'Sin información'.
--   2. Permiso de UPDATE solo sobre la nueva columna para
--      authenticated (se mantiene el esquema de privilegios
--      mínimos por columna del script 09).
--   3. registrar_animal recibe un parámetro opcional
--      p_estado_esterilizacion (DEFAULT 'Sin información').
--      Se reemplaza la función (DROP + CREATE) para que exista
--      una sola versión: la llamada anterior de 14 parámetros
--      sigue funcionando gracias al valor por defecto, por lo
--      que el frontend publicado no se ve afectado.
--      Se conservan SECURITY DEFINER, search_path, dueño,
--      validaciones y privilegios.
--
-- No modifica datos existentes salvo el valor por defecto de la
-- nueva columna. Ejecutar completo en Supabase → SQL Editor.
-- Verificación: 2026-09-25_12_verificar_estado_esterilizacion.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Nueva columna con valores cerrados
-- ------------------------------------------------------------
ALTER TABLE public.animal
    ADD COLUMN estado_esterilizacion character varying(20) NOT NULL DEFAULT 'Sin información';

ALTER TABLE public.animal
    ADD CONSTRAINT chk_animal_estado_esterilizacion CHECK (
        estado_esterilizacion IN ('Esterilizado', 'No esterilizado', 'Sin información')
    );

COMMENT ON COLUMN public.animal.estado_esterilizacion IS
    'Situación de esterilización del animal rescatado: Esterilizado, No esterilizado o Sin información. Independiente de las atenciones sanitarias.';

-- ------------------------------------------------------------
-- 2. Edición desde la ficha (privilegio solo sobre esta columna)
-- ------------------------------------------------------------
GRANT UPDATE (estado_esterilizacion) ON TABLE public.animal TO authenticated;

-- ------------------------------------------------------------
-- 3. registrar_animal con el nuevo dato (parámetro opcional)
-- ------------------------------------------------------------
DROP FUNCTION public.registrar_animal(
    bigint, bigint, character varying, character varying, character varying,
    date, date, character varying, text, text, text, text,
    character varying, character varying);

CREATE FUNCTION public.registrar_animal(
    p_id_especie bigint,
    p_id_rango_etario bigint,
    p_nombre character varying,
    p_sexo character varying,
    p_tamano character varying,
    p_fecha_nacimiento date,
    p_fecha_rescate date,
    p_lugar_rescate character varying,
    p_caracteristicas text,
    p_personalidad text,
    p_historia_rescate text,
    p_observaciones text,
    p_microchip character varying,
    p_estado_registro_nacional character varying,
    p_estado_esterilizacion character varying DEFAULT 'Sin información'
) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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

ALTER FUNCTION public.registrar_animal(
    bigint, bigint, character varying, character varying, character varying,
    date, date, character varying, text, text, text, text,
    character varying, character varying, character varying) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_animal(
    bigint, bigint, character varying, character varying, character varying,
    date, date, character varying, text, text, text, text,
    character varying, character varying, character varying) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_animal(
    bigint, bigint, character varying, character varying, character varying,
    date, date, character varying, text, text, text, text,
    character varying, character varying, character varying) TO authenticated, service_role;

COMMIT;

-- La API de datos (PostgREST) recarga el esquema para reconocer la nueva firma.
NOTIFY pgrst, 'reload schema';
