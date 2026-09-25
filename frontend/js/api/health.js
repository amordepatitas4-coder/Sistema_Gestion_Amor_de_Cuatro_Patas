// ============================================================
// Acceso a datos: ATENCION_SANITARIA.
//
// No existe RPC para atenciones: se inserta directamente (RLS lo
// permite a usuarias activas). Registrar una atención NO cambia
// el estado del animal (Ficha §28.2).
// ============================================================

import { supabase } from '../supabase.js';

const COLUMNS = `
    id_atencion_sanitaria, id_animal, id_tipo_atencion, fecha, veterinario,
    tratamiento, medicamento, proximo_control, observaciones,
    tipo:tipo_atencion_sanitaria!fk_atencion_sanitaria_tipo(nombre)`;

export async function listAttentions(idAnimal) {
    const { data, error } = await supabase
        .from('atencion_sanitaria')
        .select(COLUMNS)
        .eq('id_animal', idAnimal)
        .order('fecha', { ascending: false })
        .order('id_atencion_sanitaria', { ascending: false });
    if (error) throw error;
    return data;
}

export async function createAttention(values) {
    const row = {
        id_animal: values.id_animal,
        id_tipo_atencion: values.id_tipo_atencion,
        fecha: values.fecha,
        veterinario: values.veterinario,
        tratamiento: values.tratamiento,
        medicamento: values.medicamento,
        proximo_control: values.proximo_control,
        observaciones: values.observaciones,
    };
    const { data, error } = await supabase
        .from('atencion_sanitaria')
        .insert(row)
        .select('id_atencion_sanitaria')
        .single();
    if (error) throw error;
    return data.id_atencion_sanitaria;
}

/** Próximos controles desde hoy (Dashboard). Solo animales con registro activo. */
export async function upcomingControls(fromISO, limit = 8) {
    const { data, error } = await supabase
        .from('atencion_sanitaria')
        .select(`id_atencion_sanitaria, proximo_control, fecha,
            tipo:tipo_atencion_sanitaria!fk_atencion_sanitaria_tipo(nombre),
            // !inner convierte el embebido en un JOIN: así el filtro animal.activo descarta atenciones de animales inactivos.
            animal:animal!fk_atencion_sanitaria_animal!inner(id_animal, nombre, activo)`)
        .gte('proximo_control', fromISO)
        .eq('animal.activo', true)
        .order('proximo_control', { ascending: true })
        .limit(limit);
    if (error) throw error;
    return data;
}
