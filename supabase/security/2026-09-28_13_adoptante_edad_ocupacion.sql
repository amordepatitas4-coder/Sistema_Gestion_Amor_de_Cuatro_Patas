-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Edad y ocupación del adoptante — 28/09/2026
--
-- Requerimiento de la Fundación: el cuestionario de adopción
-- (documento Word) registra, además de los datos actuales del
-- adoptante, su edad y su ocupación. El sistema lee esos datos
-- desde el archivo para rellenar la ficha del adoptante.
--
-- Cambios:
--   1. ADOPTANTE.edad SMALLINT opcional, con CHECK 18..110:
--      la Fundación exige mayoría de edad para adoptar.
--   2. ADOPTANTE.ocupacion VARCHAR(100) opcional.
--
-- El RUT sigue siendo obligatorio y único: es el dato que
-- permite reconocer a un adoptante ya registrado.
--
-- Permisos: authenticated ya tiene INSERT y UPDATE sobre toda
-- la tabla adoptante (script 09), que incluye las columnas
-- nuevas. No se modifican RLS, RPC ni otros privilegios.
--
-- Los adoptantes existentes quedan con ambos datos vacíos.
-- Ejecutar completo en Supabase → SQL Editor.
-- Verificación: 2026-09-28_14_verificar_adoptante_edad_ocupacion.sql
-- ============================================================

BEGIN;

ALTER TABLE public.adoptante
    ADD COLUMN edad smallint,
    ADD COLUMN ocupacion character varying(100);

ALTER TABLE public.adoptante
    ADD CONSTRAINT chk_adoptante_edad CHECK (edad IS NULL OR edad BETWEEN 18 AND 110);

COMMENT ON COLUMN public.adoptante.edad IS
    'Edad declarada en el cuestionario de adopción. Opcional; mayor de edad (18 a 110).';
COMMENT ON COLUMN public.adoptante.ocupacion IS
    'Ocupación declarada en el cuestionario de adopción. Opcional.';

-- Recarga el esquema de la API para que las columnas nuevas estén disponibles de inmediato.
NOTIFY pgrst, 'reload schema';

COMMIT;
