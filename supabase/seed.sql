-- ============================================================
-- SISTEMA WEB DE GESTIÓN DE RESCATE Y ADOPCIÓN ANIMAL
-- Fundación Amor de Cuatro Patas
-- Datos iniciales de catálogos
-- ============================================================

-- ESTADOS DEL ANIMAL
INSERT INTO public.estado (nombre_estado) VALUES
('Rescatado'),
('En tratamiento'),
('En hogar temporal'),
('Disponible para adopción'),
('Adoptado');

-- ESPECIES
INSERT INTO public.especie (nombre) VALUES
('Canino'),
('Felino');

-- RANGOS ETARIOS
INSERT INTO public.rango_etario (nombre, edad_min_meses, edad_max_meses) VALUES
('Cachorro', 0, 12),
('Joven', 13, 24),
('Adulto', 25, 96),
('Senior', 97, NULL);

-- TIPOS DE ATENCIÓN SANITARIA
INSERT INTO public.tipo_atencion_sanitaria (nombre) VALUES
('Consulta veterinaria'),
('Vacunación'),
('Desparasitación'),
('Esterilización'),
('Cirugía'),
('Control'),
('Examen'),
('Tratamiento');

-- ESTADOS DE ADOPCIÓN
INSERT INTO public.estado_adopcion (nombre) VALUES
('Activa'),
('Finalizada'),
('Devuelto');

-- CATEGORÍAS DE GASTO
INSERT INTO public.categoria_gasto (nombre) VALUES
('Veterinario'),
('Medicamentos'),
('Alimentación'),
('Insumos'),
('Transporte'),
('Otros');

-- ESTADOS DE PROYECTO DE ESTERILIZACIÓN
INSERT INTO public.estado_proyecto (nombre) VALUES
('Postulado'),
('Aprobado'),
('En ejecución'),
('Finalizado'),
('Cancelado');

-- CATEGORÍAS DE ARCHIVO
INSERT INTO public.categoria_archivo (nombre) VALUES
('Contrato de adopción'),
('Documento sanitario'),
('Comprobante de gasto'),
('Documento de proyecto'),
('Documento de esterilización'),
('Documento administrativo'),
('Otro');