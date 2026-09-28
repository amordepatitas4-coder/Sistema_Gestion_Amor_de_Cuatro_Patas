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
        // Número entero o NaN si se escribió otra cosa (lo rechaza validateAdopter).
        edad: text('edad') === null ? null : Number(text('edad')),
        ocupacion: text('ocupacion'),
        observaciones: text('observaciones'),
    };
}

/** Rango de edad del CHECK chk_adoptante_edad: la Fundación exige mayoría de edad. */
export const EDAD_MIN = 18;
export const EDAD_MAX = 110;

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
    if (v.edad !== null && v.edad !== undefined
        && !(Number.isInteger(v.edad) && v.edad >= EDAD_MIN && v.edad <= EDAD_MAX)) {
        e.edad = `La edad debe ser un número entre ${EDAD_MIN} y ${EDAD_MAX}: la Fundación exige mayoría de edad para adoptar.`;
    }
    if (v.ocupacion && v.ocupacion.length > 100) e.ocupacion = 'Máximo 100 caracteres.';
    return e;
}

// ------------------------------------------------------------
// Cuestionario de adopción (.docx)
// Los datos del adoptante están en una tabla con celdas
// "Etiqueta: valor" (Nombre, Rut, Dirección, Teléfono, Correo,
// Edad, Ocupación). Las preguntas del cuestionario no se guardan.
// ------------------------------------------------------------

const foldLabel = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

// Etiqueta del Word (sin tildes ni mayúsculas) → campo del adoptante.
const FORM_LABELS = {
    'nombre': 'nombre', 'nombre completo': 'nombre',
    'rut': 'rut', 'run': 'rut',
    'direccion': 'direccion', 'domicilio': 'direccion',
    'telefono': 'telefono', 'fono': 'telefono', 'celular': 'telefono',
    'correo': 'email', 'correo electronico': 'email', 'email': 'email', 'e mail': 'email', 'mail': 'email',
    'edad': 'edad',
    'ocupacion': 'ocupacion', 'profesion': 'ocupacion',
};

export const FORM_FIELD_LABELS = {
    nombre: 'Nombre', rut: 'RUT', direccion: 'Dirección', telefono: 'Teléfono', email: 'Correo', edad: 'Edad', ocupacion: 'Ocupación',
};

// Separa "Etiqueta: valor" solo si la etiqueta es un campo conocido.
function splitCell(text) {
    const m = /^([^:\n]{1,40}):([\s\S]*)$/.exec(String(text ?? '').trim());
    const key = m ? FORM_LABELS[foldLabel(m[1])] : FORM_LABELS[foldLabel(text)];
    if (!key) return null;
    return { key, value: m ? m[2].replace(/\s+/g, ' ').trim() : '', labelOnly: !m };
}

/**
 * Extrae los datos del adoptante desde las tablas del cuestionario (docxTables).
 * Usa la primera tabla que tenga RUT o, en su defecto, Nombre junto a Correo o
 * Teléfono: así no se confunde con la tabla de contactos (Nombre / Fono).
 * Devuelve { data, found, missing } o null si no hay tabla de datos.
 */
export function parseAdoptionForm(tables) {
    const keysOf = (table) => new Set(table.flat().map(splitCell).filter(Boolean).map((c) => c.key));
    const table = tables.find((t) => keysOf(t).has('rut'))
        ?? tables.find((t) => { const k = keysOf(t); return k.has('nombre') && (k.has('email') || k.has('telefono')); });
    if (!table) return null;

    const raw = {};
    table.forEach((row) => row.forEach((cell, i) => {
        const c = splitCell(cell);
        if (!c || raw[c.key]) return;
        // "Etiqueta" en una celda y el valor en la celda siguiente.
        const value = c.labelOnly && row[i + 1] && !splitCell(row[i + 1]) ? row[i + 1].replace(/\s+/g, ' ').trim() : c.value;
        if (value) raw[c.key] = value;
    }));

    const edad = /\d{1,3}/.exec(raw.edad ?? '');
    const data = {
        nombre: raw.nombre ?? null,
        rut: raw.rut ? (normalizeRut(raw.rut) ?? raw.rut) : null,
        direccion: raw.direccion ?? null,
        telefono: raw.telefono ?? null,
        email: raw.email ? raw.email.toLowerCase() : null,
        edad: edad ? Number(edad[0]) : null,
        ocupacion: raw.ocupacion ?? null,
    };
    const keys = Object.keys(FORM_FIELD_LABELS);
    return { data, found: keys.filter((k) => data[k] !== null), missing: keys.filter((k) => data[k] === null) };
}

/** Adoptante registrado con el mismo RUT (comparando la forma normalizada). */
export function findAdopterByRut(adopters, rut) {
    const target = normalizeRut(rut);
    return target ? adopters.find((a) => normalizeRut(a.rut) === target) ?? null : null;
}

/**
 * Datos del cuestionario que difieren de los registrados (campos vacíos del
 * cuestionario no cuentan). Devuelve la lista de campos y la ficha combinada.
 */
export function adopterUpdates(adopter, data) {
    const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    const fields = ['nombre', 'direccion', 'telefono', 'email', 'edad', 'ocupacion']
        .filter((k) => data[k] !== null && data[k] !== undefined && !same(adopter[k], data[k]));
    const merged = { ...adopter };
    fields.forEach((k) => { merged[k] = data[k]; });
    return { fields, merged };
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
