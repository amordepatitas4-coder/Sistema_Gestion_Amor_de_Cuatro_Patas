// ============================================================
// Acceso a datos: ADOPTANTE, ADOPCION y SEGUIMIENTO.
//
// - Adoptantes: alta/edición directa (no hay RPC). RUT normalizado
//   "12345678-9" desde la interfaz (el backend no normaliza).
// - Adopción, seguimiento y devolución: SOLO mediante las RPC
//   registrar_adopcion, registrar_seguimiento y registrar_devolucion.
// - Nunca se elimina una adopción ni un seguimiento (trazabilidad).
// ============================================================

import { supabase } from '../supabase.js';

const ADOPTER_COLUMNS = 'id_adoptante, nombre, rut, telefono, email, direccion, edad, ocupacion, observaciones';
const ADOPTER_EDITABLE = ['nombre', 'rut', 'telefono', 'email', 'direccion', 'edad', 'ocupacion', 'observaciones'];

const ADOPTION_COLUMNS = `
    id_adopcion, id_animal, id_adoptante, fecha_adopcion, fecha_finalizacion, motivo_finalizacion, observaciones,
    estado:estado_adopcion!fk_adopcion_estado(nombre),
    animal:animal!fk_adopcion_animal(id_animal, nombre, foto_principal_path, id_carpeta_drive,
        estado:estado!fk_animal_estado_actual(nombre_estado)),
    adoptante:adoptante!fk_adopcion_adoptante(id_adoptante, nombre)`;

function pick(values, columns) {
    const out = {};
    columns.forEach((c) => { if (Object.prototype.hasOwnProperty.call(values, c)) out[c] = values[c]; });
    return out;
}

// ------------------------------------------------------------
// Adoptantes
// ------------------------------------------------------------
export async function listAdopters() {
    const { data, error } = await supabase.from('adoptante').select(ADOPTER_COLUMNS).order('nombre');
    if (error) throw error;
    return data;
}

export async function getAdopter(id) {
    const { data, error } = await supabase.from('adoptante').select(ADOPTER_COLUMNS).eq('id_adoptante', id).maybeSingle();
    if (error) throw error;
    return data;
}

export async function createAdopter(values) {
    const { data, error } = await supabase.from('adoptante').insert(pick(values, ADOPTER_EDITABLE)).select(ADOPTER_COLUMNS).single();
    if (error) throw error;
    return data;
}

export async function updateAdopter(id, values) {
    const { data, error } = await supabase.from('adoptante').update(pick(values, ADOPTER_EDITABLE))
        .eq('id_adoptante', id).select(ADOPTER_COLUMNS).single();
    if (error) throw error;
    return data;
}

// ------------------------------------------------------------
// Adopciones
// ------------------------------------------------------------
export async function listAdoptions() {
    const { data, error } = await supabase
        .from('adopcion')
        .select(`${ADOPTION_COLUMNS}, seguimiento(count)`)
        .order('fecha_adopcion', { ascending: false })
        .order('id_adopcion', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listAdoptionsByAnimal(idAnimal) {
    const { data, error } = await supabase
        .from('adopcion')
        .select(ADOPTION_COLUMNS)
        .eq('id_animal', idAnimal)
        .order('fecha_adopcion', { ascending: false })
        .order('id_adopcion', { ascending: false });
    if (error) throw error;
    return data;
}

export async function listAdoptionsByAdopter(idAdoptante) {
    const { data, error } = await supabase
        .from('adopcion')
        .select(ADOPTION_COLUMNS)
        .eq('id_adoptante', idAdoptante)
        .order('fecha_adopcion', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getAdoption(id) {
    const { data, error } = await supabase.from('adopcion').select(ADOPTION_COLUMNS).eq('id_adopcion', id).maybeSingle();
    if (error) throw error;
    return data;
}

export async function registerAdoption({ idAnimal, idAdoptante, fecha, observaciones }) {
    // La RPC rechaza animales inactivos o con adopción activa, cierra su permanencia en hogar y lo deja en estado Adoptado.
    const { data, error } = await supabase.rpc('registrar_adopcion', {
        p_id_animal: idAnimal,
        p_id_adoptante: idAdoptante,
        p_fecha_adopcion: fecha,
        p_observaciones: observaciones,
    });
    if (error) throw error;
    return data; // id_adopcion
}

export async function registerReturn({ idAdopcion, fecha, idNuevoEstado, motivo, observaciones }) {
    // La devolución finaliza la adopción (se conserva como historial) y devuelve el animal al estado elegido.
    const { error } = await supabase.rpc('registrar_devolucion', {
        p_id_adopcion: idAdopcion,
        p_fecha_devolucion: fecha,
        p_id_nuevo_estado: idNuevoEstado,
        p_motivo: motivo,
        p_observaciones: observaciones,
    });
    if (error) throw error;
}

// ------------------------------------------------------------
// Seguimientos
// ------------------------------------------------------------
export async function listFollowUps(idAdopcion) {
    const { data, error } = await supabase
        .from('seguimiento')
        .select('id_seguimiento, fecha, medio_contacto, situacion_animal, observaciones')
        .eq('id_adopcion', idAdopcion)
        .order('fecha', { ascending: false })
        .order('id_seguimiento', { ascending: false });
    if (error) throw error;
    return data;
}

export async function registerFollowUp({ idAdopcion, fecha, medio, situacion, observaciones }) {
    // La RPC verifica usuaria activa y que la fecha no sea anterior a la adopción.
    const { data, error } = await supabase.rpc('registrar_seguimiento', {
        p_id_adopcion: idAdopcion,
        p_fecha: fecha,
        p_medio_contacto: medio,
        p_situacion_animal: situacion,
        p_observaciones: observaciones,
    });
    if (error) throw error;
    return data;
}

/** Permanencia activa del animal (la adopción la cierra; su fecha limita la fecha de adopción). */
export async function getActiveStay(idAnimal) {
    const { data, error } = await supabase
        .from('permanencia_animal_hogar')
        .select('id_permanencia, fecha_ingreso, hogar:hogar_temporal!fk_permanencia_hogar(nombre_responsable)')
        .eq('id_animal', idAnimal)
        .is('fecha_salida', null)
        .maybeSingle();
    if (error) throw error;
    return data;
}
