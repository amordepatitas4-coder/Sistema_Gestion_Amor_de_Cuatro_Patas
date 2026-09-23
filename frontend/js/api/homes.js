// ============================================================
// Acceso a datos: HOGAR_TEMPORAL y PERMANENCIA_ANIMAL_HOGAR.
//
// - Los hogares se crean/editan directamente (no hay RPC).
// - Las permanencias SOLO se crean/cierran mediante las RPC
//   ingresar_hogar_temporal, cambiar_hogar_temporal y
//   finalizar_hogar_temporal (RN-51, RN-52, RN-53).
// - No se muestra capacidad máxima (no existe en el modelo).
// ============================================================

import { supabase } from '../supabase.js';

const HOME_COLUMNS = 'id_hogar, nombre_responsable, telefono, email, direccion, observaciones, activo';
export const HOME_EDITABLE = ['nombre_responsable', 'telefono', 'email', 'direccion', 'observaciones', 'activo'];

const STAY_COLUMNS = `
    id_permanencia, id_animal, id_hogar, fecha_ingreso, fecha_salida, observaciones,
    hogar:hogar_temporal!fk_permanencia_hogar(id_hogar, nombre_responsable, activo),
    animal:animal!fk_permanencia_animal(id_animal, nombre)`;

function pick(values, columns) {
    const out = {};
    columns.forEach((c) => { if (Object.prototype.hasOwnProperty.call(values, c)) out[c] = values[c]; });
    return out;
}

export async function listHomes() {
    const { data, error } = await supabase
        .from('hogar_temporal')
        .select(HOME_COLUMNS)
        .order('nombre_responsable', { ascending: true });
    if (error) throw error;
    return data;
}

export async function createHome(values) {
    const { data, error } = await supabase
        .from('hogar_temporal')
        .insert(pick(values, HOME_EDITABLE))
        .select(HOME_COLUMNS)
        .single();
    if (error) throw error;
    return data;
}

export async function updateHome(idHogar, values) {
    const { data, error } = await supabase
        .from('hogar_temporal')
        .update(pick(values, HOME_EDITABLE))
        .eq('id_hogar', idHogar)
        .select(HOME_COLUMNS)
        .single();
    if (error) throw error;
    return data;
}

/** Permanencias activas (fecha_salida IS NULL) de todos los hogares. */
export async function listActiveStays() {
    const { data, error } = await supabase
        .from('permanencia_animal_hogar')
        .select(STAY_COLUMNS)
        .is('fecha_salida', null)
        .order('fecha_ingreso', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listStaysByAnimal(idAnimal) {
    const { data, error } = await supabase
        .from('permanencia_animal_hogar')
        .select(STAY_COLUMNS)
        .eq('id_animal', idAnimal)
        .order('fecha_ingreso', { ascending: false })
        .order('id_permanencia', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listStaysByHome(idHogar) {
    const { data, error } = await supabase
        .from('permanencia_animal_hogar')
        .select(STAY_COLUMNS)
        .eq('id_hogar', idHogar)
        .order('fecha_ingreso', { ascending: false })
        .order('id_permanencia', { ascending: false });
    if (error) throw error;
    return data;
}

export async function enterHome({ idAnimal, idHogar, fecha, observaciones }) {
    const { data, error } = await supabase.rpc('ingresar_hogar_temporal', {
        p_id_animal: idAnimal,
        p_id_hogar: idHogar,
        p_fecha_ingreso: fecha,
        p_observaciones: observaciones,
    });
    if (error) throw error;
    return data;
}

export async function changeHome({ idAnimal, idNuevoHogar, fecha, observaciones }) {
    const { data, error } = await supabase.rpc('cambiar_hogar_temporal', {
        p_id_animal: idAnimal,
        p_id_nuevo_hogar: idNuevoHogar,
        p_fecha_cambio: fecha,
        p_observaciones: observaciones,
    });
    if (error) throw error;
    return data;
}

export async function finishHome({ idAnimal, fecha, idNuevoEstado, observaciones }) {
    const { error } = await supabase.rpc('finalizar_hogar_temporal', {
        p_id_animal: idAnimal,
        p_fecha_salida: fecha,
        p_id_nuevo_estado: idNuevoEstado,
        p_observaciones: observaciones,
    });
    if (error) throw error;
}
