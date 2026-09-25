// ============================================================
// Lógica pura de Adopciones (sin DOM ni Supabase).
// ============================================================

import { ESTADOS } from '../../core/domain.js';
import { emptyToNull, isValidEmail, normalizeRut, parseISODate } from '../../core/format.js';

/**
 * Valores EXACTOS admitidos por el CHECK chk_seguimiento_medio.
 * La etiqueta visible puede diferir del valor enviado (REG-10).
 */
export const MEDIOS_CONTACTO = [
    { value: 'WhatsApp', label: 'WhatsApp' },
    { value: 'Telefono', label: 'Teléfono' },
    { value: 'Correo', label: 'Correo electrónico' },
    { value: 'Visita', label: 'Visita' },
    { value: 'Otro', label: 'Otro' },
];

// Traduce el valor guardado en la BD a su etiqueta visible con tildes.
export const medioLabel = (value) => MEDIOS_CONTACTO.find((m) => m.value === value)?.label ?? value;

export const ESTADOS_ADOPCION = { ACTIVA: 'Activa', DEVUELTO: 'Devuelto', FINALIZADA: 'Finalizada' };

// ------------------------------------------------------------
// Adoptantes
// ------------------------------------------------------------

export function collectAdopter(formData) {
    const text = (n) => emptyToNull(formData.get(n));
    const rutRaw = text('rut');
    return {
        nombre: text('nombre'),
        // Normalización: cualquier formato válido ("12.345.678-5") se guarda como "12345678-5".
        rut: rutRaw ? (normalizeRut(rutRaw) ?? rutRaw) : null,
        rutValido: rutRaw ? normalizeRut(rutRaw) !== null : false,
        telefono: text('telefono'),
        email: text('email'),
        direccion: text('direccion'),
        observaciones: text('observaciones'),
    };
}

/**
 * existing: adoptantes ya registrados, para detectar el mismo RUT
 * escrito con otro formato (el UNIQUE del backend compara texto).
 */
export function validateAdopter(v, existing = [], currentId = null) {
    const e = {};
    if (!v.nombre) e.nombre = 'Ingresa el nombre del adoptante.';
    else if (v.nombre.length > 150) e.nombre = 'Máximo 150 caracteres.';
    if (!v.rut) e.rut = 'Ingresa el RUT.';
    else if (!v.rutValido) e.rut = 'El RUT no es válido. Revisa el número y el dígito verificador.';
    else {
        // Detecta duplicados antes de enviar; al editar se excluye el propio adoptante.
        const dup = existing.find((a) => String(a.id_adoptante) !== String(currentId) && normalizeRut(a.rut) === v.rut);
        if (dup) e.rut = `Ya existe un adoptante con ese RUT (${dup.nombre}).`;
    }
    if (v.email && !isValidEmail(v.email)) e.email = 'El correo electrónico no tiene un formato válido.';
    if (v.telefono && v.telefono.length > 30) e.telefono = 'Máximo 30 caracteres.';
    return e;
}

// ------------------------------------------------------------
// Adopción, seguimiento y devolución
// ------------------------------------------------------------

/** ¿Puede iniciarse una adopción? (sin adopción activa y no Adoptado). */
export function canAdopt(nombreEstado, hasActiveAdoption) {
    return !hasActiveAdoption && nombreEstado !== ESTADOS.ADOPTADO;
}

export function validateAdoption(v, { fechaIngresoHogar = null } = {}) {
    const e = {};
    if (!v.idAnimal) e.animal = 'Selecciona el animal.';
    if (!v.idAdoptante) e.adoptante = 'Selecciona o registra el adoptante.';
    if (!v.fecha) e.fecha = 'Ingresa la fecha de adopción.';
    else if (!parseISODate(v.fecha)) e.fecha = 'La fecha no es válida.';
    else if (fechaIngresoHogar && v.fecha < fechaIngresoHogar) {
        e.fecha = 'La fecha de adopción no puede ser anterior al ingreso al hogar temporal actual.';
    }
    return e;
}

export function validateFollowUp(v, fechaAdopcion) {
    const e = {};
    if (!v.fecha) e.fecha = 'Ingresa la fecha del seguimiento.';
    else if (!parseISODate(v.fecha)) e.fecha = 'La fecha no es válida.';
    else if (fechaAdopcion && v.fecha < fechaAdopcion) e.fecha = 'La fecha del seguimiento no puede ser anterior a la fecha de adopción.';
    if (!MEDIOS_CONTACTO.some((m) => m.value === v.medio)) e.medio = 'Selecciona el medio de contacto.';
    return e;
}

/** Nueva situación admitida tras una devolución (registrar_devolucion rechaza Adoptado y En hogar temporal). */
export function returnStateOptions(estados) {
    return estados.filter((e) => e.activo && e.nombre !== ESTADOS.ADOPTADO && e.nombre !== ESTADOS.EN_HOGAR);
}

export function validateReturn(v, fechaAdopcion) {
    const e = {};
    if (!v.fecha) e.fecha = 'Ingresa la fecha de devolución.';
    else if (!parseISODate(v.fecha)) e.fecha = 'La fecha no es válida.';
    else if (fechaAdopcion && v.fecha < fechaAdopcion) e.fecha = 'La fecha de devolución no puede ser anterior a la fecha de adopción.';
    if (!v.idNuevoEstado) e.estado = 'Selecciona la nueva situación del animal.';
    return e;
}
