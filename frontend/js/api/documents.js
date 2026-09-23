// ============================================================
// Acceso a datos: módulo Documentos (buscador transversal, Etapa 9).
//
// Lee ARCHIVO con todas sus asociaciones (animal, adopción, gasto,
// proyecto, esterilización y Fundación) para mostrar el contexto.
// Solo lectura: la asociación real nunca se modifica desde aquí.
// No se solicita id_externo (no es información útil para la usuaria).
// ============================================================

import { supabase } from '../supabase.js';

const DOCUMENT_SELECT = `
    id_archivo, id_categoria_archivo, nombre_archivo, nombre_original, mime_type,
    fecha_documento, fecha_carga, descripcion,
    categoria:categoria_archivo!fk_archivo_categoria(nombre),
    animal_archivo!fk_animal_archivo_archivo(
        animal:animal!fk_animal_archivo_animal(id_animal, nombre)),
    adopcion_archivo!fk_adopcion_archivo_archivo(
        adopcion:adopcion!fk_adopcion_archivo_adopcion(id_adopcion,
            animal:animal!fk_adopcion_animal(id_animal, nombre))),
    gasto_archivo!fk_gasto_archivo_archivo(
        gasto:gasto!fk_gasto_archivo_gasto(id_gasto, descripcion, fecha)),
    proyecto_archivo!fk_proyecto_archivo_archivo(
        proyecto:proyecto_esterilizacion!fk_proyecto_archivo_proyecto(id_proyecto, nombre)),
    esterilizacion_archivo!fk_esterilizacion_archivo_archivo(
        esterilizacion:animal_esterilizacion!fk_esterilizacion_archivo_animal(id_animal_esterilizacion, codigo, id_proyecto,
            proyecto:proyecto_esterilizacion!fk_animal_esterilizacion_proyecto(id_proyecto, nombre))),
    fundacion_archivo!fk_fundacion_archivo_archivo(id_fundacion_archivo)`;

export async function listDocuments() {
    const { data, error } = await supabase
        .from('archivo')
        .select(DOCUMENT_SELECT)
        .order('fecha_carga', { ascending: false })
        .limit(2000);
    if (error) throw error;
    return data;
}
