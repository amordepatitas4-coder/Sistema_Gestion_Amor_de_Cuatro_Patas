// ============================================================
// Acceso a datos: GASTO y ANIMAL_GASTO.
//
// - El gasto se inserta directamente (no hay RPC de creación).
// - Cada asignación usa la RPC asignar_gasto_animal, que valida
//   RN-57 (suma asignada <= total; la igualdad es válida).
// - No existe una RPC que cree gasto + asignaciones en una sola
//   transacción: el proceso es de varios pasos y la interfaz
//   informa explícitamente un resultado parcial (Prompt §14.4).
// - No hay eliminación de gastos ni de asignaciones (sin DELETE).
// ============================================================

import { supabase } from '../supabase.js';

const EXPENSE_COLUMNS = `
    id_gasto, id_categoria_gasto, fecha, descripcion, monto, observaciones,
    categoria:categoria_gasto!fk_gasto_categoria(nombre),
    asignaciones:animal_gasto(id_animal_gasto, id_animal, monto_asignado,
        animal:animal!fk_animal_gasto_animal(id_animal, nombre))`;
const EDITABLE = ['fecha', 'id_categoria_gasto', 'descripcion', 'monto', 'observaciones'];

function pick(values) {
    const out = {};
    EDITABLE.forEach((c) => { if (Object.prototype.hasOwnProperty.call(values, c)) out[c] = values[c]; });
    return out;
}

export async function listExpenses({ desde = null, hasta = null, categoria = null } = {}) {
    let q = supabase.from('gasto').select(EXPENSE_COLUMNS);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (categoria) q = q.eq('id_categoria_gasto', categoria);
    const { data, error } = await q.order('fecha', { ascending: false }).order('id_gasto', { ascending: false }).limit(1000);
    if (error) throw error;
    return data;
}

export async function getExpense(id) {
    const { data, error } = await supabase.from('gasto').select(EXPENSE_COLUMNS).eq('id_gasto', id).maybeSingle();
    if (error) throw error;
    return data;
}

export async function createExpense(values) {
    const { data, error } = await supabase.from('gasto').insert(pick(values)).select('id_gasto').single();
    if (error) throw error;
    return data.id_gasto;
}

export async function updateExpense(id, values) {
    const { error } = await supabase.from('gasto').update(pick(values)).eq('id_gasto', id);
    if (error) throw error;
}

export async function assignExpense(idGasto, idAnimal, monto) {
    const { data, error } = await supabase.rpc('asignar_gasto_animal', {
        p_id_gasto: idGasto,
        p_id_animal: idAnimal,
        p_monto_asignado: monto,
    });
    if (error) throw error;
    return data;
}

/** Asignaciones de un animal con los datos del gasto (pestaña Gastos de la ficha). */
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
