-- IMPORTANTE:
-- Este archivo documenta infraestructura necesaria para
-- reconstruir una instalación nueva del sistema.
-- No ejecutar directamente sobre el proyecto productivo
-- sin revisar previamente los objetos existentes.
-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
--
-- Infraestructura administrada por Supabase que no queda
-- completamente representada en schema.sql.
-- ============================================================


-- ============================================================
-- 1. TRIGGER DE CREACIÓN DE USUARIO PÚBLICO
-- ============================================================
--
-- Al crearse un usuario en Supabase Auth (auth.users),
-- ejecuta la función public.crear_usuario_publico().
--
-- La función crear_usuario_publico() ya se encuentra
-- respaldada en schema.sql.
-- ============================================================

CREATE TRIGGER trg_crear_usuario_publico
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.crear_usuario_publico();

-- ============================================================
-- 2. STORAGE - FOTOS PRINCIPALES DE ANIMALES
-- ============================================================
--
-- Bucket privado destinado exclusivamente a la fotografía
-- principal optimizada de cada animal.
--
-- Estructura esperada:
-- animales/{id_animal}/principal.webp
--
-- Tamaño máximo por archivo: 2 MB (2097152 bytes)
-- Formatos permitidos: JPEG, PNG y WebP
-- ============================================================

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'fotos-animales',
    'fotos-animales',
    false,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
);


-- ============================================================
-- POLÍTICAS DE STORAGE
-- ============================================================

-- Visualización:
-- Solo usuarios autenticados y activos pueden acceder
-- a las fotografías del bucket.

CREATE POLICY "Usuarios activos pueden ver fotos animales"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'fotos-animales'
    AND public.es_usuario_activo()
);


-- Subida:
-- Solo usuarios autenticados y activos.
-- Los archivos deben encontrarse dentro de animales/.

CREATE POLICY "Usuarios activos pueden subir fotos animales"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'fotos-animales'
    AND public.es_usuario_activo()
    AND (storage.foldername(name))[1] = 'animales'
);


-- Actualización:
-- Permite reemplazar/actualizar fotografías existentes
-- únicamente dentro de animales/.

CREATE POLICY "Usuarios activos pueden actualizar fotos animales"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'fotos-animales'
    AND public.es_usuario_activo()
    AND (storage.foldername(name))[1] = 'animales'
)
WITH CHECK (
    bucket_id = 'fotos-animales'
    AND public.es_usuario_activo()
    AND (storage.foldername(name))[1] = 'animales'
);


-- Eliminación:
-- Se permite eliminar objetos físicos de Storage cuando sea
-- necesario reemplazar o gestionar una fotografía.
-- Esto NO implica eliminar el registro histórico del animal.

CREATE POLICY "Usuarios activos pueden eliminar fotos animales"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'fotos-animales'
    AND public.es_usuario_activo()
    AND (storage.foldername(name))[1] = 'animales'
);
