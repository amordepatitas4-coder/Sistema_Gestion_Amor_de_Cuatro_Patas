// ============================================================
// Lógica pura del módulo Proyectos de esterilización (sin DOM
// ni Supabase): formularios, código sugerido, profesionales
// derivados, estado del documento PDF y exportación de nómina.
// ============================================================

import { emptyToNull, isValidEmail, isValidMicrochip, normalizeMicrochip, parseISODate } from '../../core/format.js';

export const SEXOS = ['Macho', 'Hembra', 'Desconocido'];
export const REGISTRO_NACIONAL = ['Inscrito', 'No inscrito', 'No verificado'];

/** Categoría de ARCHIVO para las fichas digitalizadas (catálogo base v1.1). */
export const PDF_CATEGORY = 'Documento de esterilización';
export const PDF_MAX_BYTES = 10 * 1024 * 1024; // límite de subir-archivo-drive

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
// Ficha PDF (MVP: Adjuntar si no existe; Abrir si existe; sin Reemplazar)
// ------------------------------------------------------------

/** Estado documental de una fila de la nómina. */
export function pdfStatus(entry) {
    const files = (entry.archivos ?? []).map((a) => a.archivo).filter(Boolean)
        .sort((a, b) => String(b.fecha_carga).localeCompare(String(a.fecha_carga)));
    return {
        exists: files.length > 0,
        latest: files[0] ?? null,
        count: files.length,
        action: files.length > 0 ? 'open' : 'attach',
    };
}

/** Validación síncrona del PDF (tipo declarado, extensión y tamaño). */
export function validatePdfFile(file) {
    if (!(file instanceof File) || file.size === 0) return 'Selecciona la ficha digitalizada en PDF.';
    const byName = /\.pdf$/i.test(file.name);
    const byType = ['application/pdf', 'application/x-pdf', ''].includes(file.type);
    if (!byName || !byType) return 'La ficha debe ser un archivo PDF.';
    if (file.size > PDF_MAX_BYTES) return 'El archivo supera el límite de 10 MB.';
    return null;
}

/** Comprueba la firma "%PDF-" del contenido (se ejecuta antes de crear registros). */
export async function hasPdfSignature(file) {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head) === '%PDF-';
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
    { label: 'Ficha PDF', value: (e) => (pdfStatus(e).exists ? 'Sí' : 'No') },
    { label: 'Características', value: (e) => e.caracteristicas },
    { label: 'Observaciones', value: (e) => e.observaciones },
];
