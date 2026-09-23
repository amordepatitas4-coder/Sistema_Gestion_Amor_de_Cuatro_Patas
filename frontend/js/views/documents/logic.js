// ============================================================
// Lógica pura del módulo Documentos (sin DOM ni Supabase):
// contexto de cada archivo, filtros y opciones de filtro.
// ============================================================

import { toISODate } from '../../core/format.js';

export const CONTEXT_TYPES = [
    { value: 'animal', label: 'Animal' },
    { value: 'adopcion', label: 'Adopción' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'proyecto', label: 'Proyecto de esterilización' },
    { value: 'esterilizacion', label: 'Ficha de esterilización' },
    { value: 'fundacion', label: 'Fundación' },
];

export const FILTER_KEYS = ['q', 'categoria', 'contexto', 'animal', 'proyecto', 'desde', 'hasta'];

/**
 * PostgREST devuelve una asociación como objeto cuando la FK es única
 * (fundacion_archivo tiene UNIQUE(id_archivo)) y como arreglo en los demás
 * casos: se normaliza siempre a arreglo.
 */
export const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const nameOf = (animal) => animal?.nombre?.trim() || `Animal N° ${animal?.id_animal ?? '—'}`;

/**
 * Contextos de un archivo a partir de sus asociaciones reales.
 * Un archivo normalmente tiene uno; se devuelven todos si hubiera más.
 */
export function fileContexts(file) {
    const out = [];
    asList(file.animal_archivo).forEach(({ animal }) => animal && out.push({
        tipo: 'animal', label: `Animal: ${nameOf(animal)}`, href: `#/animales/${animal.id_animal}/archivos`, animalId: animal.id_animal,
    }));
    asList(file.adopcion_archivo).forEach(({ adopcion }) => adopcion && out.push({
        tipo: 'adopcion', label: `Adopción de ${nameOf(adopcion.animal)}`, href: `#/adopciones/${adopcion.id_adopcion}`, animalId: adopcion.animal?.id_animal ?? null,
    }));
    asList(file.gasto_archivo).forEach(({ gasto }) => gasto && out.push({
        tipo: 'gasto', label: `Gasto: ${gasto.descripcion}`, href: `#/gastos/${gasto.id_gasto}`,
    }));
    asList(file.proyecto_archivo).forEach(({ proyecto }) => proyecto && out.push({
        tipo: 'proyecto', label: `Proyecto: ${proyecto.nombre}`, href: `#/esterilizacion/${proyecto.id_proyecto}/documentacion`, proyectoId: proyecto.id_proyecto,
    }));
    asList(file.esterilizacion_archivo).forEach(({ esterilizacion: e }) => e && out.push({
        tipo: 'esterilizacion', label: `Ficha ${e.codigo} · ${e.proyecto?.nombre ?? 'Proyecto'}`, href: `#/esterilizacion/${e.id_proyecto}/nomina`, proyectoId: e.id_proyecto,
    }));
    if (asList(file.fundacion_archivo).length > 0) out.push({ tipo: 'fundacion', label: 'Documentación de la Fundación', href: null });
    return out;
}

/** Fecha de referencia: la del documento o, si no existe, la fecha local de carga. */
export function effectiveDate(file) {
    if (file.fecha_documento) return file.fecha_documento;
    const d = new Date(file.fecha_carga);
    return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

const plain = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Aplica los filtros (valores de la URL) sobre los archivos ya cargados. */
export function filterDocuments(files, f) {
    const term = plain(f.q).trim();
    return files.filter((file) => {
        const ctx = fileContexts(file);
        if (term) {
            const haystack = [file.nombre_original, file.nombre_archivo, file.descripcion, file.categoria?.nombre, ...ctx.map((c) => c.label)]
                .map(plain).join(' ');
            if (!haystack.includes(term)) return false;
        }
        if (f.categoria && String(file.id_categoria_archivo) !== String(f.categoria)) return false;
        if (f.contexto && !ctx.some((c) => c.tipo === f.contexto)) return false;
        if (f.animal && !ctx.some((c) => String(c.animalId) === String(f.animal))) return false;
        if (f.proyecto && !ctx.some((c) => String(c.proyectoId) === String(f.proyecto))) return false;
        const date = effectiveDate(file);
        if (f.desde && (!date || date < f.desde)) return false;
        if (f.hasta && (!date || date > f.hasta)) return false;
        return true;
    });
}

/** Animales y proyectos que efectivamente tienen documentos (opciones de filtro). */
export function filterOptions(files) {
    const animals = new Map();
    const projects = new Map();
    files.forEach((file) => {
        asList(file.animal_archivo).forEach(({ animal }) => animal && animals.set(animal.id_animal, nameOf(animal)));
        asList(file.adopcion_archivo).forEach(({ adopcion }) => adopcion?.animal && animals.set(adopcion.animal.id_animal, nameOf(adopcion.animal)));
        asList(file.proyecto_archivo).forEach(({ proyecto }) => proyecto && projects.set(proyecto.id_proyecto, proyecto.nombre));
        asList(file.esterilizacion_archivo).forEach(({ esterilizacion: e }) => e?.proyecto && projects.set(e.id_proyecto, e.proyecto.nombre));
    });
    const sorted = (m) => [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return { animals: sorted(animals), projects: sorted(projects) };
}
