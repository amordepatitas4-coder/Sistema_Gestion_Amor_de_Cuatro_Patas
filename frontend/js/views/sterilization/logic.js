// ============================================================
// Lógica pura del módulo Proyectos de esterilización (sin DOM
// ni Supabase): formularios, código sugerido, profesionales
// derivados, documento de esterilización, recuperación idempotente
// del alta multipaso y exportación de nómina.
// ============================================================

import { emptyToNull, isValidEmail, isValidMicrochip, normalizeMicrochip, parseISODate } from '../../core/format.js';

export const SEXOS = ['Macho', 'Hembra', 'Desconocido'];
export const REGISTRO_NACIONAL = ['Inscrito', 'No inscrito', 'No verificado'];

/** Categoría de ARCHIVO del documento de esterilización (catálogo base v1.1). */
export const DOC_CATEGORY = 'Documento de esterilización';
export const DOC_MAX_BYTES = 10 * 1024 * 1024; // límite de subir-archivo-drive

/**
 * Tipos admitidos para el documento de esterilización:
 * PDF o fotografía del documento físico. Deben coincidir con la
 * verificación de subir-archivo-drive (firma del contenido).
 */
export const DOC_TYPES = [
    { mime: 'application/pdf', extensions: ['pdf'], extension: '.pdf', label: 'PDF' },
    { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], extension: '.jpg', label: 'JPG' },
    { mime: 'image/png', extensions: ['png'], extension: '.png', label: 'PNG' },
    { mime: 'image/webp', extensions: ['webp'], extension: '.webp', label: 'WebP' },
];
export const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

/** Funciones habituales (sugerencias editables; el campo es texto libre). */
export const FUNCIONES_SUGERIDAS = ['Cirujano(a)', 'Médico(a) veterinario(a)', 'Anestesista', 'Asistente', 'Técnico(a) veterinario(a)'];

const toId = (value) => {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) ? Number(text) : null;
};

const tooLong = (value, max) => value !== null && value !== undefined && String(value).length > max;

// ------------------------------------------------------------
// Proyecto
// ------------------------------------------------------------

export function collectProject(fd) {
    const text = (n) => emptyToNull(fd.get(n));
    return {
        id_estado_proyecto: toId(fd.get('id_estado_proyecto')),
        nombre: text('nombre'),
        fecha_postulacion: text('fecha_postulacion'),
        fecha_inicio: text('fecha_inicio'),
        fecha_fin: text('fecha_fin'),
        responsable: text('responsable'),
        entidad_financiante: text('entidad_financiante'),
        descripcion: text('descripcion'),
        observaciones: text('observaciones'),
    };
}

export function validateProject(v) {
    const e = {};
    if (!v.id_estado_proyecto) e.id_estado_proyecto = 'Selecciona el estado del proyecto.';
    if (!v.nombre) e.nombre = 'Ingresa el nombre del proyecto.';
    else if (tooLong(v.nombre, 150)) e.nombre = 'Máximo 150 caracteres.';
    ['fecha_postulacion', 'fecha_inicio', 'fecha_fin'].forEach((k) => {
        if (v[k] && !parseISODate(v[k])) e[k] = 'La fecha no es válida.';
    });
    if (!e.fecha_inicio && !e.fecha_fin && v.fecha_inicio && v.fecha_fin && v.fecha_fin < v.fecha_inicio) {
        e.fecha_fin = 'La fecha de término no puede ser anterior a la fecha de inicio.';
    }
    if (tooLong(v.responsable, 150)) e.responsable = 'Máximo 150 caracteres.';
    if (tooLong(v.entidad_financiante, 150)) e.entidad_financiante = 'Máximo 150 caracteres.';
    return e;
}

/** Período legible del proyecto. */
export function projectPeriod(p, format) {
    if (p.fecha_inicio && p.fecha_fin) return `${format(p.fecha_inicio)} – ${format(p.fecha_fin)}`;
    if (p.fecha_inicio) return `Desde ${format(p.fecha_inicio)}`;
    if (p.fecha_fin) return `Hasta ${format(p.fecha_fin)}`;
    return 'Sin período definido';
}

// ------------------------------------------------------------
// Nómina (ANIMAL_ESTERILIZACION)
// ------------------------------------------------------------

/** Siguiente código sugerido EST-001, EST-002… (editable por la usuaria). */
export function suggestNextCode(codes) {
    // Toma el mayor número EST-### existente (ignora códigos con otro formato) y sugiere el siguiente.
    const max = codes.reduce((acc, c) => {
        const m = /^EST-(\d+)$/i.exec(String(c ?? '').trim());
        return m ? Math.max(acc, Number(m[1])) : acc;
    }, 0);
    return `EST-${String(max + 1).padStart(3, '0')}`;
}

export function collectEntry(fd) {
    const text = (n) => emptyToNull(fd.get(n));
    const chip = normalizeMicrochip(fd.get('microchip'));
    return {
        codigo: text('codigo'),
        id_especie: toId(fd.get('id_especie')),
        id_rango_etario: toId(fd.get('id_rango_etario')),
        sexo: text('sexo'),
        fecha_nacimiento: text('fecha_nacimiento'),
        caracteristicas: text('caracteristicas'),
        sector_origen: text('sector_origen'),
        fecha_esterilizacion: text('fecha_esterilizacion'),
        lugar_esterilizacion: text('lugar_esterilizacion'),
        microchip: chip === '' ? null : chip,
        estado_registro_nacional: text('estado_registro_nacional'),
        observaciones: text('observaciones'),
    };
}

const fold = (t) => String(t ?? '').trim().toUpperCase();

/**
 * Validación alineada con los CHECK/UNIQUE del backend.
 * others: filas de la nómina del mismo proyecto (excluida la que se edita).
 */
export function validateEntry(v, others = []) {
    const e = {};
    if (!v.codigo) e.codigo = 'Ingresa el código del animal en el proyecto.';
    else if (tooLong(v.codigo, 50)) e.codigo = 'Máximo 50 caracteres.';
    else if (others.some((o) => fold(o.codigo) === fold(v.codigo))) e.codigo = 'Ese código ya se utiliza en este proyecto.';
    if (!v.id_especie) e.id_especie = 'Selecciona la especie.';
    if (!v.sexo || !SEXOS.includes(v.sexo)) e.sexo = 'Selecciona el sexo.';
    if (v.fecha_nacimiento && !parseISODate(v.fecha_nacimiento)) e.fecha_nacimiento = 'La fecha no es válida.';
    if (v.fecha_esterilizacion && !parseISODate(v.fecha_esterilizacion)) e.fecha_esterilizacion = 'La fecha no es válida.';
    if (!e.fecha_nacimiento && !e.fecha_esterilizacion && v.fecha_nacimiento && v.fecha_esterilizacion
        && v.fecha_nacimiento > v.fecha_esterilizacion) {
        e.fecha_nacimiento = 'La fecha de nacimiento no puede ser posterior a la fecha de esterilización.';
    }
    if (v.microchip && !isValidMicrochip(v.microchip)) {
        e.microchip = 'El microchip debe tener exactamente 15 dígitos, sin espacios ni guiones.';
    } else if (v.microchip && others.some((o) => o.microchip === v.microchip)) {
        e.microchip = 'Ese microchip ya está registrado en la nómina de este proyecto.';
    }
    if (v.estado_registro_nacional && !REGISTRO_NACIONAL.includes(v.estado_registro_nacional)) {
        e.estado_registro_nacional = 'Selecciona una situación válida.';
    }
    if (tooLong(v.sector_origen, 255)) e.sector_origen = 'Máximo 255 caracteres.';
    if (tooLong(v.lugar_esterilizacion, 255)) e.lugar_esterilizacion = 'Máximo 255 caracteres.';
    return e;
}

// ------------------------------------------------------------
// Profesionales
// ------------------------------------------------------------

export function collectProfessional(get) {
    return {
        nombre: emptyToNull(get('nombre')),
        profesion: emptyToNull(get('profesion')),
        telefono: emptyToNull(get('telefono')),
        email: emptyToNull(get('email'))?.toLowerCase() ?? null,
        observaciones: emptyToNull(get('observaciones')),
    };
}

export function validateProfessional(v) {
    const e = {};
    if (!v.nombre) e.nombre = 'Ingresa el nombre.';
    else if (tooLong(v.nombre, 150)) e.nombre = 'Máximo 150 caracteres.';
    if (!v.profesion) e.profesion = 'Ingresa la profesión.';
    else if (tooLong(v.profesion, 100)) e.profesion = 'Máximo 100 caracteres.';
    if (tooLong(v.telefono, 30)) e.telefono = 'Máximo 30 caracteres.';
    if (v.email && (!isValidEmail(v.email) || tooLong(v.email, 254))) e.email = 'El correo no tiene un formato válido.';
    return e;
}

/**
 * Filas de profesionales del formulario (N:M).
 * rows: [{ idProfesional, funcion }]; se ignoran filas totalmente vacías.
 * Devuelve { rows: { índice: mensaje }, general } .
 */
export function validateProfessionalRows(rows, { required = true, existingIds = [] } = {}) {
    const result = { rows: {}, general: null };
    const used = rows.filter((r) => r.idProfesional || r.funcion);
    if (required && used.length === 0) {
        result.general = 'Indica al menos un profesional participante y su función.';
        return result;
    }
    const seen = new Set(existingIds.map(String));
    used.forEach((r, i) => {
        if (!r.idProfesional) result.rows[i] = 'Selecciona el profesional.';
        else if (!r.funcion) result.rows[i] = 'Indica la función del profesional.';
        else if (r.funcion.length > 100) result.rows[i] = 'La función admite máximo 100 caracteres.';
        else if (seen.has(String(r.idProfesional))) result.rows[i] = 'Ese profesional ya está asociado a esta esterilización.';
        if (r.idProfesional) seen.add(String(r.idProfesional));
    });
    return result;
}

export const hasRowErrors = (r) => Boolean(r.general) || Object.keys(r.rows).length > 0;

/**
 * Profesionales del proyecto derivados de la nómina:
 * PROYECTO → ANIMAL_ESTERILIZACION → ESTERILIZACION_PROFESIONAL → PROFESIONAL.
 */
export function deriveProjectProfessionals(entries) {
    // Un profesional puede participar en varias esterilizaciones: el Map lo agrupa una sola vez y acumula funciones y códigos.
    const map = new Map();
    entries.forEach((entry) => {
        (entry.profesionales ?? []).forEach((rel) => {
            const prof = rel.profesional ?? { id_profesional: rel.id_profesional };
            const key = String(rel.id_profesional);
            if (!map.has(key)) map.set(key, { ...prof, funciones: new Set(), esterilizaciones: 0, codigos: [] });
            const item = map.get(key);
            if (rel.funcion) item.funciones.add(rel.funcion);
            item.esterilizaciones += 1;
            item.codigos.push(entry.codigo);
        });
    });
    return [...map.values()]
        .map((p) => ({ ...p, funciones: [...p.funciones].sort((a, b) => a.localeCompare(b, 'es')) }))
        .sort((a, b) => b.esterilizaciones - a.esterilizaciones || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// ------------------------------------------------------------
// Documento de esterilización (uno por animal de la nómina).
// MVP: "Adjuntar documento" si no existe; "Abrir documento" si
// existe; sin reemplazo. Unicidad garantizada en servidor por
// uq_esterilizacion_archivo_documento + subir-archivo-drive.
// ------------------------------------------------------------

/** Estado documental de una fila de la nómina. */
export function documentStatus(entry) {
    const files = (entry.archivos ?? []).map((a) => a.archivo).filter(Boolean)
        .sort((a, b) => String(b.fecha_carga).localeCompare(String(a.fecha_carga)));
    return {
        exists: files.length > 0,
        latest: files[0] ?? null,
        count: files.length,
        action: files.length > 0 ? 'open' : 'attach',
    };
}

const extensionOf = (name) => (/\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();

/** Validación síncrona: extensión, tipo declarado coherente y tamaño. */
export function validateDocumentFile(file) {
    if (!(file instanceof File) || file.size === 0) return 'Selecciona el documento de esterilización (PDF o fotografía).';
    const type = DOC_TYPES.find((t) => t.extensions.includes(extensionOf(file.name)));
    // Algunos navegadores o celulares no informan el tipo (""), o usan application/x-pdf para PDF.
    const declaredOk = type && (file.type === '' || file.type === type.mime || (type.mime === 'application/pdf' && file.type === 'application/x-pdf'));
    if (!declaredOk) return 'El documento debe ser PDF, JPG, PNG o WebP.';
    if (file.size > DOC_MAX_BYTES) return 'El archivo supera el límite de 10 MB.';
    return null;
}

/** Tipo real según la firma del contenido (mismos criterios que la Edge Function). */
export function detectDocumentType(bytes) {
    // "Números mágicos": los primeros bytes identifican el formato real (%PDF-, JPEG FFD8FF, PNG, RIFF…WEBP), aunque la extensión mienta.
    const is = (offset, sig) => sig.every((v, i) => bytes[offset + i] === v);
    if (is(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return DOC_TYPES[0];
    if (is(0, [0xff, 0xd8, 0xff])) return DOC_TYPES[1];
    if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return DOC_TYPES[2];
    if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) return DOC_TYPES[3];
    return null;
}

/** Lee el tipo real del archivo (null si no es un tipo admitido). */
export async function readDocumentType(file) {
    return detectDocumentType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
}

// ------------------------------------------------------------
// Alta multipaso segura de reintentar
//
// - Animal: UNIQUE(id_proyecto, codigo). Si el INSERT falla (p. ej. se
//   perdió la respuesta) se busca el código: si existe con los MISMOS
//   datos, se recupera ese registro en lugar de crear otro.
// - Relaciones: UNIQUE(id_animal_esterilizacion, id_profesional); antes
//   de insertar se omiten las ya existentes.
// - Documento: índice único + verificación previa (ver arriba).
// - Profesional (creación rápida): se vuelve a consultar el directorio
//   y se reutiliza el existente con igual nombre y profesión.
// ------------------------------------------------------------

const norm = (v) => (v === undefined || v === null || v === '' ? null : String(v).trim());

/** ¿El registro encontrado corresponde exactamente a los datos enviados? */
export function isSameEntry(values, row) {
    if (!row) return false;
    return ['codigo', 'id_especie', 'id_rango_etario', 'sexo', 'fecha_nacimiento', 'caracteristicas', 'sector_origen',
        'fecha_esterilizacion', 'lugar_esterilizacion', 'microchip', 'estado_registro_nacional', 'observaciones']
        .every((k) => norm(values[k]) === norm(row[k]));
}

/**
 * Proyecto recuperable tras perder la respuesta del INSERT: mismo contenido
 * exacto y creado después de abrir el formulario (id no conocido antes).
 * Los nombres de proyecto pueden repetirse legítimamente: no se exige unicidad.
 */
export function findRecoveredProject(values, candidates, knownIds = []) {
    const known = new Set(knownIds.map(String));
    const fields = ['id_estado_proyecto', 'nombre', 'fecha_postulacion', 'fecha_inicio', 'fecha_fin',
        'responsable', 'entidad_financiante', 'descripcion', 'observaciones'];
    const matches = candidates.filter((p) => !known.has(String(p.id_proyecto))
        && fields.every((k) => norm(values[k]) === norm(p[k])));
    return matches.length === 1 ? matches[0] : null;   // ante ambigüedad no se adivina
}

/** Filas de profesionales que aún no están asociadas (evita duplicar relaciones). */
export function pendingLinks(rows, existingIds) {
    const done = new Set(existingIds.map(String));
    return rows.map((r) => ({ ...r, alreadyLinked: done.has(String(r.idProfesional)) }));
}

const foldName = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Profesional existente con el mismo nombre y profesión (o null). */
export function findSimilarProfessional(list, values) {
    return list.find((p) => foldName(p.nombre) === foldName(values.nombre)
        && foldName(p.profesion) === foldName(values.profesion)) ?? null;
}

/** Validación de la función al corregir una asociación existente. */
export function validateFunction(funcion) {
    const f = norm(funcion);
    if (!f) return 'Indica la función del profesional.';
    if (f.length > 100) return 'La función admite máximo 100 caracteres.';
    return null;
}

// ------------------------------------------------------------
// Filtro y exportación de la nómina
// ------------------------------------------------------------

const plain = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterEntries(entries, term) {
    const q = plain(term).trim();
    if (!q) return entries;
    // El microchip se busca solo cuando el término es numérico.
    const digits = /^[\d\s]+$/.test(q) ? q.replace(/\D/g, '') : '';
    return entries.filter((e) => plain(e.codigo).includes(q)
        || plain(e.sector_origen).includes(q)
        || plain(e.lugar_esterilizacion).includes(q)
        || (e.profesionales ?? []).some((r) => plain(r.profesional?.nombre).includes(q))
        || (digits.length > 0 && String(e.microchip ?? '').includes(digits)));
}

export const professionalsText = (entry) => (entry.profesionales ?? [])
    .map((r) => `${r.profesional?.nombre ?? '—'} (${r.funcion})`).join(', ');

/** Columnas de la exportación de nómina (sin IDs técnicos ni datos de Drive). */
export const NOMINA_EXPORT_COLUMNS = [
    { label: 'Código', value: (e) => e.codigo },
    { label: 'Especie', value: (e) => e.especie?.nombre },
    { label: 'Sexo', value: (e) => e.sexo },
    { label: 'Rango etario', value: (e) => e.rango?.nombre },
    { label: 'Fecha de nacimiento', value: (e) => e.fecha_nacimiento },
    { label: 'Microchip', value: (e) => e.microchip, text: true },
    { label: 'Registro Nacional', value: (e) => e.estado_registro_nacional },
    { label: 'Sector de origen', value: (e) => e.sector_origen },
    { label: 'Fecha de esterilización', value: (e) => e.fecha_esterilizacion },
    { label: 'Lugar de esterilización', value: (e) => e.lugar_esterilizacion },
    { label: 'Profesional(es)', value: professionalsText },
    { label: 'Documento de esterilización', value: (e) => (documentStatus(e).exists ? 'Sí' : 'No') },
    { label: 'Características', value: (e) => e.caracteristicas },
    { label: 'Observaciones', value: (e) => e.observaciones },
];
