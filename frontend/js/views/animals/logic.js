// ============================================================
// Lógica pura del módulo Animales (sin DOM ni Supabase):
// filtros del listado y normalización/validación del formulario.
// ============================================================

import { ESTADOS, ESTADOS_RESERVADOS } from '../../core/domain.js';
import { emptyToNull, isValidMicrochip, normalizeMicrochip, parseISODate, todayISO } from '../../core/format.js';

// ------------------------------------------------------------
// Filtros (viajan en la URL: #/animales?estado=…&q=…)
// estado: id_estado, o "activos" = registro activo excepto Adoptado.
// ------------------------------------------------------------

export const FILTER_KEYS = ['q', 'estado', 'especie', 'sexo', 'desde', 'hasta'];
export const ESTADO_ACTIVOS = 'activos';

export function readFilters(query) {
    const f = {};
    FILTER_KEYS.forEach((k) => { f[k] = (query.get(k) ?? '').trim(); });
    f.modo = query.get('modo') === 'lista' ? 'lista' : 'tarjetas';
    return f;
}

export function filtersToQuery(filters) {
    const q = {};
    FILTER_KEYS.forEach((k) => { if (filters[k]) q[k] = filters[k]; });
    if (filters.modo === 'lista') q.modo = 'lista';
    return q;
}

export function hasActiveFilters(filters) {
    return FILTER_KEYS.some((k) => Boolean(filters[k]));
}

const fold = (text) => String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Aplica los filtros sobre la lista cargada. adoptadoId: id_estado de "Adoptado". */
export function applyFilters(list, filters, { adoptadoId = null } = {}) {
    const term = fold(filters.q).trim();
    const digits = term.replace(/\D/g, '');
    return list.filter((a) => {
        if (term) {
            const byName = fold(a.nombre).includes(term);
            const byChip = digits.length > 0 && String(a.microchip ?? '').includes(digits);
            if (!byName && !byChip) return false;
        }
        if (filters.estado) {
            if (filters.estado === ESTADO_ACTIVOS) {
                if (adoptadoId != null && String(a.id_estado_actual) === String(adoptadoId)) return false;
            } else if (String(a.id_estado_actual) !== filters.estado) {
                return false;
            }
        }
        if (filters.especie && String(a.id_especie) !== filters.especie) return false;
        if (filters.sexo && a.sexo !== filters.sexo) return false;
        if (filters.desde && (!a.fecha_rescate || a.fecha_rescate < filters.desde)) return false;
        if (filters.hasta && (!a.fecha_rescate || a.fecha_rescate > filters.hasta)) return false;
        return true;
    });
}

// ------------------------------------------------------------
// Formulario de animal (registro y edición)
// ------------------------------------------------------------

export const SEXOS = ['Macho', 'Hembra', 'Desconocido'];
export const TAMANOS = ['Pequeño', 'Mediano', 'Grande'];
export const REGISTRO_NACIONAL = ['Inscrito', 'No inscrito', 'No verificado'];

const toId = (value) => {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) ? Number(text) : null;
};

/** FormData → valores listos para el backend ("" → null, ids numéricos). */
export function collectAnimal(formData) {
    const text = (name) => emptyToNull(formData.get(name));
    const chip = normalizeMicrochip(formData.get('microchip'));
    return {
        nombre: text('nombre'),
        id_especie: toId(formData.get('id_especie')),
        id_rango_etario: toId(formData.get('id_rango_etario')),
        sexo: text('sexo'),
        tamaño: text('tamano'),
        fecha_nacimiento: text('fecha_nacimiento'),
        fecha_rescate: text('fecha_rescate'),
        lugar_rescate: text('lugar_rescate'),
        caracteristicas: text('caracteristicas'),
        personalidad: text('personalidad'),
        historia_rescate: text('historia_rescate'),
        observaciones: text('observaciones'),
        microchip: chip === '' ? null : chip,
        estado_registro_nacional: text('estado_registro_nacional'),
    };
}

/**
 * Validación de interfaz alineada con los CHECK del backend.
 * Devuelve { campo: mensaje } usando los nombres de los inputs.
 */
export function validateAnimal(v) {
    const e = {};
    if (!v.id_especie) e.id_especie = 'Selecciona la especie.';
    if (!v.sexo || !SEXOS.includes(v.sexo)) e.sexo = 'Selecciona el sexo.';
    if (v.tamaño && !TAMANOS.includes(v.tamaño)) e.tamano = 'Selecciona un tamaño válido.';
    if (!v.fecha_rescate) e.fecha_rescate = 'Ingresa la fecha de rescate.';
    else if (!parseISODate(v.fecha_rescate)) e.fecha_rescate = 'La fecha de rescate no es válida.';
    if (v.fecha_nacimiento && !parseISODate(v.fecha_nacimiento)) {
        e.fecha_nacimiento = 'La fecha de nacimiento no es válida.';
    } else if (v.fecha_nacimiento && v.fecha_rescate && v.fecha_nacimiento > v.fecha_rescate) {
        e.fecha_nacimiento = 'La fecha de nacimiento no puede ser posterior a la fecha de rescate.';
    }
    if (v.microchip && !isValidMicrochip(v.microchip)) {
        e.microchip = 'El microchip debe tener exactamente 15 dígitos, sin espacios ni guiones.';
    }
    if (v.estado_registro_nacional && !REGISTRO_NACIONAL.includes(v.estado_registro_nacional)) {
        e.estado_registro_nacional = 'Selecciona una situación válida.';
    }
    if (v.nombre && v.nombre.length > 100) e.nombre = 'El nombre no puede superar 100 caracteres.';
    if (v.lugar_rescate && v.lugar_rescate.length > 255) e.lugar_rescate = 'El lugar no puede superar 255 caracteres.';
    return e;
}

// ------------------------------------------------------------
// Estados y procesos
// ------------------------------------------------------------

/** Estados disponibles para el cambio manual: activos, no reservados y distintos del actual. */
export function manualStateOptions(estados, currentId) {
    return estados.filter((e) => e.activo
        && !ESTADOS_RESERVADOS.includes(e.nombre)
        && String(e.id) !== String(currentId));
}

/** Estados válidos como nueva situación al finalizar una permanencia (RPC finalizar_hogar_temporal). */
export function exitStateOptions(estados, currentId) {
    return manualStateOptions(estados, currentId);
}

/**
 * Motivo por el que el cambio manual no corresponde (o null).
 * Guarda de interfaz: la salida de hogar temporal o de una adopción
 * corresponde a su proceso, no a un cambio manual.
 */
export function manualChangeBlock(nombreEstadoActual, hasActiveStay) {
    if (nombreEstadoActual === ESTADOS.EN_HOGAR || hasActiveStay) {
        return { reason: 'El animal tiene una permanencia activa en un hogar temporal. Para cambiar su situación, finaliza la permanencia indicando el nuevo estado.', tab: 'hogares', action: 'Ir a Hogares' };
    }
    if (nombreEstadoActual === ESTADOS.ADOPTADO) {
        return { reason: 'El animal está Adoptado. Su situación solo cambia registrando una devolución desde el detalle de su adopción.', tab: 'adopcion', action: 'Ir a Adopción' };
    }
    return null;
}

/** ¿Puede ingresar a un hogar temporal? (sin permanencia activa y no Adoptado). */
export function canEnterHome(nombreEstadoActual, hasActiveStay) {
    return !hasActiveStay && nombreEstadoActual !== ESTADOS.ADOPTADO;
}

/** Nombre visible: el nombre es opcional en el modelo. */
export function animalName(animal) {
    return animal?.nombre?.trim() || `Animal sin nombre (N° ${animal?.id_animal ?? '—'})`;
}

// ------------------------------------------------------------
// Salud
// ------------------------------------------------------------

/** Clasifica el próximo control respecto de hoy (función pura). */
export function controlStatus(proximoControl, today = todayISO()) {
    if (!proximoControl) return null;
    if (proximoControl < today) return 'pasado';
    const diffDays = Math.round((parseISODate(proximoControl) - parseISODate(today)) / 86400000);
    return diffDays <= 7 ? 'proximo' : 'programado';
}

export function validateAttention(v) {
    const e = {};
    if (!v.id_tipo_atencion) e.tipo = 'Selecciona el tipo de atención.';
    if (!v.fecha) e.fecha = 'Ingresa la fecha de la atención.';
    else if (!parseISODate(v.fecha)) e.fecha = 'La fecha no es válida.';
    if (v.proximo_control) {
        if (!parseISODate(v.proximo_control)) e.proximo_control = 'La fecha del próximo control no es válida.';
        else if (v.fecha && v.proximo_control < v.fecha) e.proximo_control = 'El próximo control no puede ser anterior a la fecha de la atención.';
    }
    if (v.veterinario && v.veterinario.length > 150) e.veterinario = 'Máximo 150 caracteres.';
    return e;
}
