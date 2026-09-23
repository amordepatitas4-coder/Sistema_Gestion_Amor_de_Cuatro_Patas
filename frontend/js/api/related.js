// ============================================================
// Consultas de solo lectura para las pestañas de la ficha cuyos
// procesos se implementan en etapas posteriores (Adopción: 5,
// Gastos: 6, Archivos: 7). Aquí solo se consulta historial.
// ============================================================

import { supabase } from '../supabase.js';

export async function listAdoptionsByAnimal(idAnimal) {
    const { data, error } = await supabase
        .from('adopcion')
        .select(`id_adopcion, fecha_adopcion, fecha_finalizacion, motivo_finalizacion,
            adoptante:adoptante!fk_adopcion_adoptante(nombre),
            estado:estado_adopcion!fk_adopcion_estado(nombre)`)
        .eq('id_animal', idAnimal)
        .order('fecha_adopcion', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listExpensesByAnimal(idAnimal) {
    const { data, error } = await supabase
        .from('animal_gasto')
        .select(`id_animal_gasto, monto_asignado,
            gasto:gasto!fk_animal_gasto_gasto(id_gasto, fecha, descripcion, monto,
                categoria:categoria_gasto!fk_gasto_categoria(nombre))`)
        .eq('id_animal', idAnimal)
        .order('id_animal_gasto', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listFilesByAnimal(idAnimal) {
    const { data, error } = await supabase
        .from('animal_archivo')
        .select(`id_animal_archivo,
            archivo:archivo!fk_animal_archivo_archivo(id_archivo, nombre_original, nombre_archivo,
                fecha_documento, fecha_carga, descripcion,
                categoria:categoria_archivo!fk_archivo_categoria(nombre))`)
        .eq('id_animal', idAnimal)
        .order('id_animal_archivo', { ascending: false });
    if (error) throw error;
    return data;
}
