// ============================================================
// Definición de los informes (lógica pura, sin DOM ni Supabase).
//
// Cada informe declara:
//   - filters: SOLO los filtros pertinentes a ese informe (PA-INF-04);
//   - clientFilter: filtros sobre datos relacionados que no se
//     resuelven en la consulta;
//   - columns: columnas legibles (sin IDs técnicos ni datos de Drive);
//   - summary: totales calculados exclusivamente desde las filas
//     obtenidas (no se inventan cifras: Prompt §22.3).
// ============================================================

import { parseISODate, todayISO } from '../../core/format.js';

export const SEXOS = ['Macho', 'Hembra', 'Desconocido'];
export const REGISTRO_NACIONAL = ['Inscrito', 'No inscrito', 'No verificado'];
export const SITUACIONES_PERMANENCIA = [{ value: 'activa', label: 'Activa (en curso)' }, { value: 'finalizada', label: 'Finalizada' }];

const animalLabel = (a) => a?.nombre?.trim() || (a ? `Animal sin nombre (N° ${a.id_animal})` : '—');

/** Días de una permanencia (hasta hoy si sigue activa). */
export function stayDays(ingreso, salida, today = todayISO()) {
    const a = parseISODate(ingreso);
    const b = parseISODate(salida ?? today);
    if (!a || !b) return null;
    // Diferencia en milisegundos convertida a días (86.400.000 ms por día).
    return Math.max(0, Math.round((b - a) / 86400000));
}

// Cuenta filas por categoría y ordena de mayor a menor (para el resumen del informe).
function countBy(rows, keyFn) {
    const map = new Map();
    rows.forEach((r) => {
        const k = keyFn(r) ?? 'Sin dato';
        map.set(k, (map.get(k) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
        .map(([label, value]) => ({ label, value, kind: 'count' }));
}

const sum = (rows, fn) => rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
const assignedTotal = (g) => sum(g.asignaciones ?? [], (a) => a.monto_asignado);

const dateFilters = (label) => [
    { key: 'desde', label: `${label} desde`, type: 'date' },
    { key: 'hasta', label: `${label} hasta`, type: 'date' },
];

export const REPORTS = [
    {
        key: 'animales',
        label: 'Animales',
        icon: 'bi-heart',
        description: 'Animales rescatados con su estado actual',
        filters: [
            ...dateFilters('Rescate'),
            { key: 'especie', label: 'Especie', type: 'select', source: 'especie' },
            { key: 'estado', label: 'Estado', type: 'select', source: 'estado' },
            { key: 'sexo', label: 'Sexo', type: 'select', source: 'sexo' },
            { key: 'rango', label: 'Rango etario', type: 'select', source: 'rango_etario' },
        ],
        clientFilter: (rows) => rows,
        columns: [
            { label: 'Nombre', value: (r) => animalLabel(r) },
            { label: 'Especie', value: (r) => r.especie?.nombre },
            { label: 'Sexo', value: (r) => r.sexo },
            { label: 'Rango etario', value: (r) => r.rango?.nombre },
            { label: 'Estado', value: (r) => r.estado?.nombre_estado },
            { label: 'Microchip', value: (r) => r.microchip, text: true },
            { label: 'Registro Nacional', value: (r) => r.estado_registro_nacional },
            { label: 'Fecha de rescate', value: (r) => r.fecha_rescate, type: 'date' },
            { label: 'Lugar de rescate', value: (r) => r.lugar_rescate },
        ],
        summary: (rows) => [{ label: 'Animales', value: rows.length, kind: 'count', main: true }, ...countBy(rows, (r) => r.estado?.nombre_estado)],
    },
    {
        key: 'adopciones',
        label: 'Adopciones',
        icon: 'bi-house-check',
        description: 'Adopciones registradas y su estado',
        filters: [
            ...dateFilters('Adopción'),
            { key: 'estado_adopcion', label: 'Estado de la adopción', type: 'select', source: 'estado_adopcion' },
            { key: 'especie', label: 'Especie', type: 'select', source: 'especie' },
        ],
        clientFilter: (rows, f) => rows.filter((r) => !f.especie || String(r.animal?.id_especie) === String(f.especie)),
        columns: [
            { label: 'Fecha de adopción', value: (r) => r.fecha_adopcion, type: 'date' },
            { label: 'Animal', value: (r) => animalLabel(r.animal) },
            { label: 'Especie', value: (r) => r.animal?.especie?.nombre },
            { label: 'Adoptante', value: (r) => r.adoptante?.nombre },
            { label: 'Estado', value: (r) => r.estado?.nombre },
            { label: 'Fecha de término', value: (r) => r.fecha_finalizacion, type: 'date' },
            { label: 'Motivo de término', value: (r) => r.motivo_finalizacion },
            { label: 'Seguimientos', value: (r) => r.seguimientos?.[0]?.count ?? 0, type: 'number' },
        ],
        summary: (rows) => [{ label: 'Adopciones', value: rows.length, kind: 'count', main: true }, ...countBy(rows, (r) => r.estado?.nombre)],
    },
    {
        key: 'atenciones',
        label: 'Atenciones sanitarias',
        icon: 'bi-clipboard2-pulse',
        description: 'Vacunas, controles, tratamientos y otras atenciones',
        filters: [
            ...dateFilters('Atención'),
            { key: 'tipo_atencion', label: 'Tipo de atención', type: 'select', source: 'tipo_atencion_sanitaria' },
            { key: 'especie', label: 'Especie', type: 'select', source: 'especie' },
            { key: 'animal', label: 'Animal', type: 'select', source: 'animal' },
        ],
        clientFilter: (rows, f) => rows.filter((r) => !f.especie || String(r.animal?.id_especie) === String(f.especie)),
        columns: [
            { label: 'Fecha', value: (r) => r.fecha, type: 'date' },
            { label: 'Animal', value: (r) => animalLabel(r.animal) },
            { label: 'Tipo', value: (r) => r.tipo?.nombre },
            { label: 'Veterinario', value: (r) => r.veterinario },
            { label: 'Tratamiento', value: (r) => r.tratamiento },
            { label: 'Medicamento', value: (r) => r.medicamento },
            { label: 'Próximo control', value: (r) => r.proximo_control, type: 'date' },
        ],
        summary: (rows) => [{ label: 'Atenciones', value: rows.length, kind: 'count', main: true }, ...countBy(rows, (r) => r.tipo?.nombre)],
    },
    {
        key: 'hogares',
        label: 'Hogares temporales',
        icon: 'bi-house-heart',
        description: 'Permanencias de animales en hogares temporales',
        filters: [
            ...dateFilters('Ingreso'),
            { key: 'hogar', label: 'Hogar temporal', type: 'select', source: 'hogar' },
            { key: 'situacion', label: 'Situación', type: 'select', source: 'situacion' },
            { key: 'animal', label: 'Animal', type: 'select', source: 'animal' },
        ],
        clientFilter: (rows) => rows,
        columns: [
            { label: 'Hogar (responsable)', value: (r) => r.hogar?.nombre_responsable },
            { label: 'Animal', value: (r) => animalLabel(r.animal) },
            { label: 'Especie', value: (r) => r.animal?.especie?.nombre },
            { label: 'Ingreso', value: (r) => r.fecha_ingreso, type: 'date' },
            { label: 'Salida', value: (r) => r.fecha_salida, type: 'date' },
            { label: 'Días', value: (r) => stayDays(r.fecha_ingreso, r.fecha_salida), type: 'number' },
            { label: 'Situación', value: (r) => (r.fecha_salida ? 'Finalizada' : 'Activa') },
        ],
        summary: (rows) => [
            { label: 'Permanencias', value: rows.length, kind: 'count', main: true },
            { label: 'Activas', value: rows.filter((r) => !r.fecha_salida).length, kind: 'count' },
            { label: 'Finalizadas', value: rows.filter((r) => r.fecha_salida).length, kind: 'count' },
            { label: 'Animales distintos', value: new Set(rows.map((r) => r.id_animal)).size, kind: 'count' },
        ],
    },
    {
        key: 'gastos',
        label: 'Gastos',
        icon: 'bi-cash-coin',
        description: 'Gastos generales y asignados a animales',
        filters: [
            ...dateFilters('Fecha'),
            { key: 'categoria', label: 'Categoría', type: 'select', source: 'categoria_gasto' },
            { key: 'animal', label: 'Animal asignado', type: 'select', source: 'animal' },
        ],
        clientFilter: (rows, f) => rows.filter((g) => !f.animal || (g.asignaciones ?? []).some((a) => String(a.id_animal) === String(f.animal))),
        columns: [
            { label: 'Fecha', value: (r) => r.fecha, type: 'date' },
            { label: 'Categoría', value: (r) => r.categoria?.nombre },
            { label: 'Descripción', value: (r) => r.descripcion },
            { label: 'Total', value: (r) => Number(r.monto), type: 'money' },
            { label: 'Asignado', value: (r) => assignedTotal(r), type: 'money' },
            { label: 'No asignado', value: (r) => Number(r.monto) - assignedTotal(r), type: 'money' },
            { label: 'Animales', value: (r) => (r.asignaciones ?? []).map((a) => animalLabel(a.animal ?? { id_animal: a.id_animal })).join(', ') },
        ],
        summary: (rows, f) => {
            const out = [
                { label: 'Gastos', value: rows.length, kind: 'count' },
                { label: 'Monto total', value: sum(rows, (g) => g.monto), kind: 'money', main: true },
                { label: 'Asignado a animales', value: sum(rows, assignedTotal), kind: 'money' },
                { label: 'No asignado (general)', value: sum(rows, (g) => Number(g.monto) - assignedTotal(g)), kind: 'money' },
            ];
            if (f.animal) {
                const toAnimal = sum(rows, (g) => sum((g.asignaciones ?? []).filter((a) => String(a.id_animal) === String(f.animal)), (a) => a.monto_asignado));
                out.push({ label: 'Asignado al animal filtrado', value: toAnimal, kind: 'money' });
            }
            return out;
        },
    },
    {
        key: 'esterilizaciones',
        label: 'Esterilizaciones',
        icon: 'bi-scissors',
        description: 'Animales de las nóminas de proyectos de esterilización',
        filters: [
            ...dateFilters('Esterilización'),
            { key: 'proyecto', label: 'Proyecto', type: 'select', source: 'proyecto' },
            { key: 'especie', label: 'Especie', type: 'select', source: 'especie' },
            { key: 'sexo', label: 'Sexo', type: 'select', source: 'sexo' },
            { key: 'rango', label: 'Rango etario', type: 'select', source: 'rango_etario' },
            { key: 'registro', label: 'Registro Nacional', type: 'select', source: 'registro' },
            { key: 'profesional', label: 'Profesional', type: 'select', source: 'profesional' },
        ],
        clientFilter: (rows, f) => rows.filter((r) => !f.profesional
            || (r.profesionales ?? []).some((p) => String(p.id_profesional) === String(f.profesional))),
        columns: [
            { label: 'Proyecto', value: (r) => r.proyecto?.nombre },
            { label: 'Código', value: (r) => r.codigo },
            { label: 'Especie', value: (r) => r.especie?.nombre },
            { label: 'Sexo', value: (r) => r.sexo },
            { label: 'Rango etario', value: (r) => r.rango?.nombre },
            { label: 'Microchip', value: (r) => r.microchip, text: true },
            { label: 'Registro Nacional', value: (r) => r.estado_registro_nacional },
            { label: 'Fecha', value: (r) => r.fecha_esterilizacion, type: 'date' },
            { label: 'Lugar', value: (r) => r.lugar_esterilizacion },
            { label: 'Profesional(es)', value: (r) => (r.profesionales ?? []).map((p) => `${p.profesional?.nombre ?? '—'} (${p.funcion})`).join(', ') },
            { label: 'Documento de esterilización', value: (r) => ((r.archivos ?? []).length > 0 ? 'Sí' : 'No') },
        ],
        summary: (rows) => [
            { label: 'Esterilizaciones', value: rows.length, kind: 'count', main: true },
            ...countBy(rows, (r) => r.sexo),
            { label: 'Con documento', value: rows.filter((r) => (r.archivos ?? []).length > 0).length, kind: 'count' },
            { label: 'Proyectos', value: new Set(rows.map((r) => r.id_proyecto)).size, kind: 'count' },
        ],
    },
];

/** Claves reservadas de la URL que ningún filtro puede usar. */
// "tipo" identifica el informe en la URL; por eso el filtro de atenciones se llama tipo_atencion.
export const RESERVED_KEYS = ['tipo'];

export const findReport = (key) => REPORTS.find((r) => r.key === key) ?? null;

/** Filtros del informe leídos desde la URL (solo las claves pertinentes). */
export function readReportFilters(report, query) {
    const f = {};
    report.filters.forEach((flt) => { f[flt.key] = (query.get(flt.key) ?? '').trim(); });
    return f;
}

export function validateReportFilters(f) {
    const e = {};
    if (f.desde && !parseISODate(f.desde)) e.desde = 'La fecha no es válida.';
    if (f.hasta && !parseISODate(f.hasta)) e.hasta = 'La fecha no es válida.';
    if (!e.desde && !e.hasta && f.desde && f.hasta && f.hasta < f.desde) e.hasta = 'La fecha final no puede ser anterior a la inicial.';
    return e;
}

/** Texto de filtros aplicados (pantalla e impresión). labels: { clave: texto visible del valor }. */
export function describeFilters(report, f, labels = {}) {
    const parts = report.filters
        .filter((flt) => f[flt.key])
        .map((flt) => `${flt.label}: ${labels[flt.key] ?? f[flt.key]}`);
    return parts.length ? parts.join(' · ') : 'Sin filtros (todos los registros)';
}
