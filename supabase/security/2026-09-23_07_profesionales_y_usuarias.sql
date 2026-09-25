-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Correcciones de integridad y gestión de usuarias — 23/09/2026
--
-- 1. quitar_profesional_esterilizacion(p_id_esterilizacion_profesional)
--    Corrige una asociación profesional ↔ animal de esterilización
--    ingresada por error. Elimina SOLO la fila de
--    esterilizacion_profesional; nunca el profesional ni sus demás
--    participaciones. Impide quitar al último profesional del animal.
--    No se abre DELETE general sobre la tabla (sigue sin política DELETE).
--    La función de una relación existente se corrige con la política
--    UPDATE ya vigente (sin cambios).
--
-- 2. listar_usuarias()
--    Devuelve id, nombre, correo (leído de auth.users en servidor),
--    activo y fecha de registro. El navegador no consulta auth.users
--    y el correo no se duplica en public.usuario (solo lectura).
--
-- 3. actualizar_mi_nombre(p_nombre)
--    Permite a la usuaria activa editar SOLO su propio nombre
--    (public.usuario no tiene política UPDATE y no se agrega una).
--
-- Todas: SECURITY DEFINER, search_path vacío, verifican
-- es_usuario_activo(); EXECUTE solo para authenticated (y
-- service_role); sin acceso para anon ni PUBLIC.
--
-- Cambio COMPATIBLE: solo agrega funciones. No modifica datos.
-- Ejecutar completo en Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Quitar asociación profesional ↔ esterilización
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quitar_profesional_esterilizacion(p_id_esterilizacion_profesional bigint)
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

ALTER FUNCTION public.quitar_profesional_esterilizacion(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.quitar_profesional_esterilizacion(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quitar_profesional_esterilizacion(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.quitar_profesional_esterilizacion(bigint) IS
    'Corrige una asociación profesional–esterilización ingresada por error. No elimina al profesional ni permite dejar al animal sin profesionales.';

-- ------------------------------------------------------------
-- 2. Listado de usuarias con correo de Auth
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarias()
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

ALTER FUNCTION public.listar_usuarias() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.listar_usuarias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarias() TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_usuarias() IS
    'Usuarias internas con su correo de Supabase Auth (solo lectura) para Configuración → Usuarias.';

-- ------------------------------------------------------------
-- 3. Editar el propio nombre
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_mi_nombre(p_nombre text)
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

ALTER FUNCTION public.actualizar_mi_nombre(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.actualizar_mi_nombre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_nombre(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.actualizar_mi_nombre(text) IS
    'La usuaria activa actualiza solo su propio nombre en public.usuario.';
