// ============================================================
// Acceso a datos: módulo Informes (Etapa 10). Solo lectura.
//
// Los informes no tienen entidad propia (Ficha §17.2): son consultas
// sobre los registros existentes. Los filtros sobre columnas propias
// se aplican en la consulta; los que dependen de datos relacionados
// (p. ej. especie del animal adoptado) se aplican en la lógica pura
// (views/reports/definitions.js) sobre el resultado.
// ============================================================

import { supabase } from '../supabase.js';

const LIMIT = 5000;

function raise(error) {
    if (error) throw error;
}

function dateRange(q, column, f) {
    let out = q;
    if (f.desde) out = out.gte(column, f.desde);
    if (f.hasta) out = out.lte(column, f.hasta);
    return out;
}

export async function fetchAnimalsReport(f) {
    let q = supabase.from('animal').select(`
        id_animal, nombre, sexo, tamaño, fecha_nacimiento, fecha_rescate, lugar_rescate, microchip,
        estado_registro_nacional, id_estado_actual, id_especie, id_rango_etario,
        estado:estado!fk_animal_estado_actual(nombre_estado),
        especie:especie!fk_animal_especie(nombre),
        rango:rango_etario!fk_animal_rango_etario(nombre)`).eq('activo', true);
    q = dateRange(q, 'fecha_rescate', f);
    if (f.especie) q = q.eq('id_especie', f.especie);
    if (f.estado) q = q.eq('id_estado_actual', f.estado);
    if (f.sexo) q = q.eq('sexo', f.sexo);
    if (f.rango) q = q.eq('id_rango_etario', f.rango);
    const { data, error } = await q.order('fecha_rescate', { ascending: false }).limit(LIMIT);
    raise(error);
    return data;
}

export async function fetchAdoptionsReport(f) {
    let q = supabase.from('adopcion').select(`
        id_adopcion, fecha_adopcion, fecha_finalizacion, motivo_finalizacion, id_estado_adopcion,
        estado:estado_adopcion!fk_adopcion_estado(nombre),
        animal:animal!fk_adopcion_animal(id_animal, nombre, id_especie, sexo, especie:especie!fk_animal_especie(nombre)),
        adoptante:adoptante!fk_adopcion_adoptante(nombre),
        seguimientos:seguimiento!fk_seguimiento_adopcion(count)`);
    q = dateRange(q, 'fecha_adopcion', f);
    if (f.estado_adopcion) q = q.eq('id_estado_adopcion', f.estado_adopcion);
    const { data, error } = await q.order('fecha_adopcion', { ascending: false }).limit(LIMIT);
    raise(error);
    return data;
}

export async function fetchAttentionsReport(f) {
    let q = supabase.from('atencion_sanitaria').select(`
        id_atencion_sanitaria, id_animal, id_tipo_atencion, fecha, veterinario, tratamiento, medicamento,
        proximo_control, observaciones,
        tipo:tipo_atencion_sanitaria!fk_atencion_sanitaria_tipo(nombre),
        animal:animal!fk_atencion_sanitaria_animal(id_animal, nombre, id_especie, especie:especie!fk_animal_especie(nombre))`);
    q = dateRange(q, 'fecha', f);
    if (f.tipo_atencion) q = q.eq('id_tipo_atencion', f.tipo_atencion);
    if (f.animal) q = q.eq('id_animal', f.animal);
    const { data, error } = await q.order('fecha', { ascending: false }).limit(LIMIT);
    raise(error);
    return data;
}

export async function fetchStaysReport(f) {
    let q = supabase.from('permanencia_animal_hogar').select(`
        id_permanencia, id_animal, id_hogar, fecha_ingreso, fecha_salida, observaciones,
        hogar:hogar_temporal!fk_permanencia_hogar(id_hogar, nombre_responsable),
        animal:animal!fk_permanencia_animal(id_animal, nombre, id_especie, especie:especie!fk_animal_especie(nombre))`);
    q = dateRange(q, 'fecha_ingreso', f);
    if (f.hogar) q = q.eq('id_hogar', f.hogar);
    if (f.animal) q = q.eq('id_animal', f.animal);
    if (f.situacion === 'activa') q = q.is('fecha_salida', null);
    if (f.situacion === 'finalizada') q = q.not('fecha_salida', 'is', null);
    const { data, error } = await q.order('fecha_ingreso', { ascending: false }).limit(LIMIT);
    raise(error);
    return data;
}

export async function fetchExpensesReport(f) {
    let q = supabase.from('gasto').select(`
        id_gasto, id_categoria_gasto, fecha, descripcion, monto, observaciones,
        categoria:categoria_gasto!fk_gasto_categoria(nombre),
        asignaciones:animal_gasto(id_animal, monto_asignado, animal:animal!fk_animal_gasto_animal(id_animal, nombre))`);
    q = dateRange(q, 'fecha', f);
    if (f.categoria) q = q.eq('id_categoria_gasto', f.categoria);
    const { data, error } = await q.order('fecha', { ascending: false }).limit(LIMIT);
    raise(error);
    return data;
}

export async function fetchSterilizationsReport(f) {
    let q = supabase.from('animal_esterilizacion').select(`
        id_animal_esterilizacion, id_proyecto, codigo, sexo, id_especie, id_rango_etario, microchip,
        estado_registro_nacional, fecha_esterilizacion, lugar_esterilizacion, sector_origen,
        proyecto:proyecto_esterilizacion!fk_animal_esterilizacion_proyecto(id_proyecto, nombre),
        especie:especie!fk_animal_esterilizacion_especie(nombre),
        rango:rango_etario!fk_animal_esterilizacion_rango(nombre),
        profesionales:esterilizacion_profesional!fk_esterilizacion_profesional_animal(id_profesional, funcion,
            profesional:profesional!fk_esterilizacion_profesional_profesional(nombre)),
        archivos:esterilizacion_archivo!fk_esterilizacion_archivo_animal(id_archivo)`);
    q = dateRange(q, 'fecha_esterilizacion', f);
    if (f.proyecto) q = q.eq('id_proyecto', f.proyecto);
    if (f.especie) q = q.eq('id_especie', f.especie);
    if (f.sexo) q = q.eq('sexo', f.sexo);
    if (f.rango) q = q.eq('id_rango_etario', f.rango);
    if (f.registro) q = q.eq('estado_registro_nacional', f.registro);
    const { data, error } = await q.order('id_proyecto', { ascending: false }).order('codigo', { ascending: true }).limit(LIMIT);
    raise(error);
    return data;
}
