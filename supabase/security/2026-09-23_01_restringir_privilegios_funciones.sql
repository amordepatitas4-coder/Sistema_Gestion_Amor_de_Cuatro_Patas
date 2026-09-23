-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Parche de seguridad sobre backend v1.1 — 23/09/2026
-- Restricción de privilegios EXECUTE en funciones de public.
--
-- Hallazgos confirmados por auditoría sobre el proyecto real:
--   1. _cambiar_estado_animal ejecutable por PUBLIC, anon y
--      authenticated, sin verificar usuario activo ni estados
--      reservados.
--   2. RPC de negocio ejecutables por anon (se protegen con
--      es_usuario_activo(), pero anon no las necesita).
--   3. crear_usuario_publico (trigger) ejecutable por PUBLIC,
--      anon y authenticated.
--   4. es_usuario_activo ejecutable por anon.
--   5. Privilegios por defecto: toda función nueva creada por
--      postgres queda ejecutable por PUBLIC y anon.
--
-- El script es idempotente (solo REVOKE/GRANT) y no modifica
-- datos, tablas, RLS ni el cuerpo de ninguna función.
-- Ejecutar completo en Supabase → SQL Editor.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Función interna _cambiar_estado_animal
--
-- Solo debe ejecutarse a través de las RPC de proceso, que son
-- SECURITY DEFINER con dueño postgres y conservan el acceso.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public._cambiar_estado_animal(bigint, bigint, text, text)
    FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 2. RPC de negocio: solo usuarios autenticados.
--
-- PUBLIC ya estaba revocado; se retira anon. authenticated y
-- service_role conservan EXECUTE.
-- registrar_animal ya no tenía permiso para anon.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.activar_usuario(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.desactivar_usuario(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.asignar_gasto_animal(bigint, bigint, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.cambiar_estado_animal(bigint, bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.cambiar_hogar_temporal(bigint, bigint, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalizar_hogar_temporal(bigint, date, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.ingresar_hogar_temporal(bigint, bigint, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_adopcion(bigint, bigint, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_archivo(bigint, character varying, character varying, character varying, character varying, date, text, character varying, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_devolucion(bigint, date, bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_seguimiento(bigint, date, character varying, text, text) FROM anon;


-- ------------------------------------------------------------
-- 3. Función de trigger crear_usuario_publico
--
-- No debe invocarse directamente. PostgreSQL no comprueba
-- EXECUTE al disparar un trigger; aun así se concede EXECUTE
-- explícito al rol que inserta en auth.users (Supabase Auth)
-- como resguardo para el flujo de invitación.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crear_usuario_publico()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_usuario_publico()
    TO supabase_auth_admin;


-- ------------------------------------------------------------
-- 4. es_usuario_activo
--
-- authenticated DEBE conservar EXECUTE: las políticas RLS y de
-- Storage la evalúan con el rol de quien consulta.
-- Todas esas políticas son TO authenticated, anon no la usa.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.es_usuario_activo() FROM anon;


-- ------------------------------------------------------------
-- 5. Privilegios por defecto para funciones futuras de postgres
--
-- a) Global: elimina el EXECUTE implícito a PUBLIC.
--    (Los privilegios por esquema solo pueden agregar permisos,
--    por eso la revocación a PUBLIC debe ser global.)
-- b) Esquema public: deja de otorgar EXECUTE a anon.
--    authenticated y service_role siguen recibiéndolo.
--
-- Nota: el privilegio por defecto equivalente del rol
-- supabase_admin es administrado por Supabase y no puede
-- modificarse desde el rol postgres. Solo afecta funciones que
-- cree la propia plataforma.
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon;

COMMIT;
