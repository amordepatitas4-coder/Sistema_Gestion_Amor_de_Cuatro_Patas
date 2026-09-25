// ============================================================
// Catálogos del backend v1.1 con metadatos EXPLÍCITOS.
//
// No se deducen nombres de PK ni columnas: cada catálogo declara
// su tabla, clave primaria, campo visible y columnas reales
// (REG-11).
// ============================================================

import { supabase } from '../supabase.js';

export const CATALOGS = {
    estado: {
        table: 'estado', pk: 'id_estado', label: 'nombre_estado',
        columns: 'id_estado, nombre_estado, descripcion, activo',
        order: 'id_estado', // orden del proceso (Rescatado → … → Adoptado)
    },
    especie: {
        table: 'especie', pk: 'id_especie', label: 'nombre',
        columns: 'id_especie, nombre, descripcion, activo',
    },
    rango_etario: {
        table: 'rango_etario', pk: 'id_rango_etario', label: 'nombre',
        columns: 'id_rango_etario, nombre, edad_min_meses, edad_max_meses, descripcion, activo',
        order: 'edad_min_meses',
    },
    tipo_atencion_sanitaria: {
        table: 'tipo_atencion_sanitaria', pk: 'id_tipo_atencion', label: 'nombre',
        columns: 'id_tipo_atencion, nombre, descripcion, activo',
    },
    estado_adopcion: {
        table: 'estado_adopcion', pk: 'id_estado_adopcion', label: 'nombre',
        columns: 'id_estado_adopcion, nombre, descripcion, activo',
    },
    categoria_gasto: {
        table: 'categoria_gasto', pk: 'id_categoria_gasto', label: 'nombre',
        columns: 'id_categoria_gasto, nombre, descripcion, activo',
    },
    estado_proyecto: {
        table: 'estado_proyecto', pk: 'id_estado_proyecto', label: 'nombre',
        columns: 'id_estado_proyecto, nombre, descripcion, activo',
    },
    categoria_archivo: {
        table: 'categoria_archivo', pk: 'id_categoria_archivo', label: 'nombre',
        columns: 'id_categoria_archivo, nombre, descripcion, activo',
    },
};

export { ESTADOS, ESTADOS_RESERVADOS } from '../core/domain.js';

// Caché en memoria de la sesión: se guarda la promesa para que cargas simultáneas compartan una sola consulta.
const cache = new Map();

/**
 * Carga un catálogo completo (activos e inactivos) y lo deja en caché.
 * Los inactivos se conservan para mostrar nombres de registros históricos.
 * Un error de carga se propaga: nunca se reemplaza por una lista vacía.
 */
export async function loadCatalog(name, { refresh = false } = {}) {
    const meta = CATALOGS[name];
    if (!meta) throw new Error(`Catálogo no definido: ${name}`);
    if (!refresh && cache.has(name)) return cache.get(name);

    const promise = (async () => {
        const { data, error } = await supabase
            .from(meta.table)
            .select(meta.columns)
            .order(meta.order ?? meta.label, { ascending: true });
        if (error) throw error;
        return data.map((row) => ({ ...row, id: row[meta.pk], nombre: row[meta.label] }));
    })();

    cache.set(name, promise);
    try {
        return await promise;
    // Si la carga falla se descarta la promesa, para reintentar en la próxima llamada.
    } catch (err) {
        cache.delete(name);
        throw err;
    }
}

export async function loadCatalogs(names) {
    const lists = await Promise.all(names.map((n) => loadCatalog(n)));
    return Object.fromEntries(names.map((n, i) => [n, lists[i]]));
}

export function clearCatalogCache() {
    cache.clear();
}

/** Busca un estado por su nombre formal. */
export function findByName(list, nombre) {
    return list.find((row) => row.nombre === nombre) ?? null;
}

/** Filas activas para formularios, conservando la fila actualmente seleccionada aunque esté inactiva. */
export function selectable(list, currentId = null) {
    return list.filter((row) => row.activo || String(row.id) === String(currentId));
}

// ------------------------------------------------------------
// Administración de catálogos (Configuración → Catálogos).
// Solo INSERT/UPDATE permitidos por RLS; nunca DELETE: se usa
// activo = false. Las columnas escribibles se declaran de forma
// explícita en la vista (views/settings/catalog-config.js).
// ------------------------------------------------------------

function pickColumns(values, columns) {
    const out = {};
    columns.forEach((c) => { if (Object.prototype.hasOwnProperty.call(values, c)) out[c] = values[c]; });
    return out;
}

// Tras escribir se invalida el caché para que los formularios vean el cambio.
export async function createCatalogRow(name, values, columns) {
    const meta = CATALOGS[name];
    if (!meta) throw new Error(`Catálogo no definido: ${name}`);
    const { error } = await supabase.from(meta.table).insert(pickColumns(values, columns));
    if (error) throw error;
    cache.delete(name);
}

export async function updateCatalogRow(name, id, values, columns) {
    const meta = CATALOGS[name];
    if (!meta) throw new Error(`Catálogo no definido: ${name}`);
    const { error } = await supabase.from(meta.table).update(pickColumns(values, columns)).eq(meta.pk, id);
    if (error) throw error;
    cache.delete(name);
}
