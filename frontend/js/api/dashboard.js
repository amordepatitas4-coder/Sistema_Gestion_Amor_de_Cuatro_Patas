// ============================================================
// Indicadores del Panel principal (Ficha Maestra §29.2).
//
// Todos se calculan sobre animales con registro activo
// (ANIMAL.activo = true). "Animales activos" es un concepto de
// interfaz: registro activo cuyo estado actual NO es Adoptado.
// Se usan conteos exactos (sin descargar filas).
// ============================================================

import { supabase } from '../supabase.js';

async function countAnimals(apply) {
    const query = supabase.from('animal').select('id_animal', { count: 'exact', head: true }).eq('activo', true);
    const { count, error } = await apply(query);
    if (error) throw error;
    return count ?? 0;
}

/**
 * ids: { adoptado, enTratamiento, enHogar } (id_estado).
 * month: { from, to } en "YYYY-MM-DD" (hora local).
 * Un id null (estado inexistente en el catálogo) produce null.
 */
export async function loadKpis(ids, month) {
    const byState = (id) => (id == null ? Promise.resolve(null) : countAnimals((q) => q.eq('id_estado_actual', id)));
    const [activos, enTratamiento, enHogar, adoptados, rescatadosMes] = await Promise.all([
        ids.adoptado == null ? countAnimals((q) => q) : countAnimals((q) => q.neq('id_estado_actual', ids.adoptado)),
        byState(ids.enTratamiento),
        byState(ids.enHogar),
        byState(ids.adoptado),
        countAnimals((q) => q.gte('fecha_rescate', month.from).lte('fecha_rescate', month.to)),
    ]);
    return { activos, enTratamiento, enHogar, adoptados, rescatadosMes };
}
