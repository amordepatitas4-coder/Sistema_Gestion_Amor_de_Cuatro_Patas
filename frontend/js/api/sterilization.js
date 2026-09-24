// ============================================================
// Acceso a datos: proyectos de esterilización (Etapa 8).
//
// Tablas: PROYECTO_ESTERILIZACION, ANIMAL_ESTERILIZACION,
// PROFESIONAL, ESTERILIZACION_PROFESIONAL (N:M) y
// ESTERILIZACION_ARCHIVO / PROYECTO_ARCHIVO (vía registrar_archivo).
//
// - El backend v1.1 no tiene RPC para este módulo: proyecto, nómina,
//   profesionales y relaciones se insertan directamente (RLS:
//   usuaria activa). El alta en nómina es un proceso de varios
//   pasos y la interfaz informa explícitamente resultados parciales.
// - Carpeta Drive: Edge Function crear-carpeta-proyecto (idempotente:
//   recupera o crea la carpeta principal + Documentación + Animales).
// - Documento de la nómina (PDF, JPG, PNG o WebP; uno por animal):
//   subir-archivo-drive con contexto 'esterilizacion'
//   (Proyecto/Animales/{codigo}.{ext}); único en servidor por
//   uq_esterilizacion_archivo_documento.
// - Sin eliminación: no existen políticas DELETE en estas tablas.
// - Los animales de esterilización NO se incorporan a ANIMAL.
// ============================================================

import { AppError, functionMessage } from '../core/errors.js';
import { supabase } from '../supabase.js';

function raise(error) {
    if (error) throw error;
}

function pick(values, columns) {
    const out = {};
    columns.forEach((c) => { if (Object.prototype.hasOwnProperty.call(values, c)) out[c] = values[c]; });
    return out;
}

// ------------------------------------------------------------
// Proyectos
// ------------------------------------------------------------

/** Columnas editables del proyecto (nunca id_carpeta_drive: lo gestiona la Edge Function). */
export const PROJECT_COLUMNS = [
    'id_estado_proyecto', 'nombre', 'fecha_postulacion', 'fecha_inicio', 'fecha_fin',
    'responsable', 'entidad_financiante', 'descripcion', 'observaciones',
];

const PROJECT_SELECT = `
    id_proyecto, id_estado_proyecto, nombre, fecha_postulacion, fecha_inicio, fecha_fin,
    responsable, entidad_financiante, descripcion, observaciones, id_carpeta_drive,
    estado:estado_proyecto!fk_proyecto_estado(nombre),
    animales:animal_esterilizacion!fk_animal_esterilizacion_proyecto(count)`;

const withCount = (p) => ({ ...p, total_animales: p.animales?.[0]?.count ?? 0 });

export async function listProjects() {
    const { data, error } = await supabase
        .from('proyecto_esterilizacion')
        .select(PROJECT_SELECT)
        .order('id_proyecto', { ascending: false })
        .limit(500);
    raise(error);
    return data.map(withCount);
}

export async function getProject(id) {
    const { data, error } = await supabase
        .from('proyecto_esterilizacion')
        .select(PROJECT_SELECT)
        .eq('id_proyecto', id)
        .maybeSingle();
    raise(error);
    return data ? withCount(data) : null;
}

/**
 * Busca un proyecto recién creado cuya respuesta se perdió: mismo contenido
 * exacto y un id que no existía al abrir el formulario (knownIds).
 * No exige nombres únicos: dos proyectos pueden llamarse igual.
 */
export async function findRecoveredProject(values, knownIds) {
    let q = supabase.from('proyecto_esterilizacion').select(`id_proyecto, ${PROJECT_COLUMNS.join(', ')}`)
        .eq('nombre', values.nombre);
    if (knownIds.length) q = q.not('id_proyecto', 'in', `(${knownIds.join(',')})`);
    const { data, error } = await q.order('id_proyecto', { ascending: false }).limit(20);
    raise(error);
    return data;
}

export async function createProject(values) {
    const { data, error } = await supabase
        .from('proyecto_esterilizacion')
        .insert(pick(values, PROJECT_COLUMNS))
        .select('id_proyecto')
        .single();
    raise(error);
    return data.id_proyecto;
}

export async function updateProject(id, values) {
    const { error } = await supabase
        .from('proyecto_esterilizacion')
        .update(pick(values, PROJECT_COLUMNS))
        .eq('id_proyecto', id);
    raise(error);
}

/** Crea o recupera la estructura Drive del proyecto (idempotente). */
export async function createProjectFolder(idProyecto) {
    const { data, error } = await supabase.functions.invoke('crear-carpeta-proyecto', {
        body: { id_proyecto: idProyecto },
    });
    raise(error);
    if (data?.error) throw new AppError(functionMessage(data.error));
    return data;
}

// ------------------------------------------------------------
// Nómina (ANIMAL_ESTERILIZACION)
// ------------------------------------------------------------

export const ENTRY_COLUMNS = [
    'codigo', 'id_especie', 'id_rango_etario', 'sexo', 'fecha_nacimiento', 'caracteristicas',
    'sector_origen', 'fecha_esterilizacion', 'lugar_esterilizacion', 'microchip',
    'estado_registro_nacional', 'observaciones',
];

const ENTRY_SELECT = `
    id_animal_esterilizacion, id_proyecto, id_especie, id_rango_etario, codigo, sexo,
    fecha_nacimiento, caracteristicas, sector_origen, fecha_esterilizacion,
    lugar_esterilizacion, observaciones, microchip, estado_registro_nacional,
    especie:especie!fk_animal_esterilizacion_especie(nombre),
    rango:rango_etario!fk_animal_esterilizacion_rango(nombre),
    profesionales:esterilizacion_profesional!fk_esterilizacion_profesional_animal(
        id_esterilizacion_profesional, id_profesional, funcion,
        profesional:profesional!fk_esterilizacion_profesional_profesional(id_profesional, nombre, profesion, telefono, email, observaciones)),
    archivos:esterilizacion_archivo!fk_esterilizacion_archivo_animal(
        id_archivo,
        archivo:archivo!fk_esterilizacion_archivo_archivo(id_archivo, nombre_archivo, nombre_original, mime_type, fecha_documento, fecha_carga))`;

export async function listEntries(idProyecto) {
    const { data, error } = await supabase
        .from('animal_esterilizacion')
        .select(ENTRY_SELECT)
        .eq('id_proyecto', idProyecto)
        .order('codigo', { ascending: true });
    raise(error);
    return data;
}

export async function createEntry(idProyecto, values) {
    const { data, error } = await supabase
        .from('animal_esterilizacion')
        .insert({ ...pick(values, ENTRY_COLUMNS), id_proyecto: idProyecto })
        .select('id_animal_esterilizacion')
        .single();
    raise(error);
    return data.id_animal_esterilizacion;
}

/**
 * Busca un animal de la nómina por código exacto (recuperación del alta:
 * si el INSERT falló sin respuesta, puede haberse creado igualmente).
 */
export async function findEntryByCode(idProyecto, codigo) {
    const { data, error } = await supabase
        .from('animal_esterilizacion')
        .select(`id_animal_esterilizacion, ${ENTRY_COLUMNS.join(', ')}`)
        .eq('id_proyecto', idProyecto)
        .eq('codigo', codigo)
        .maybeSingle();
    raise(error);
    return data;
}

/** Edición de datos descriptivos (nunca id_proyecto). */
export async function updateEntry(id, values) {
    const { error } = await supabase
        .from('animal_esterilizacion')
        .update(pick(values, ENTRY_COLUMNS))
        .eq('id_animal_esterilizacion', id);
    raise(error);
}

/** Cantidad de fichas registradas para una esterilización (control previo a adjuntar). */
export async function countEntryFiles(idAnimalEsterilizacion) {
    const { count, error } = await supabase
        .from('esterilizacion_archivo')
        .select('id_esterilizacion_archivo', { count: 'exact', head: true })
        .eq('id_animal_esterilizacion', idAnimalEsterilizacion);
    raise(error);
    return count ?? 0;
}

// ------------------------------------------------------------
// Profesionales (reutilizables entre proyectos) y relación N:M
// ------------------------------------------------------------

export const PROFESSIONAL_COLUMNS = ['nombre', 'profesion', 'telefono', 'email', 'observaciones'];

export async function listProfessionals() {
    const { data, error } = await supabase
        .from('profesional')
        .select('id_profesional, nombre, profesion, telefono, email, observaciones')
        .order('nombre', { ascending: true });
    raise(error);
    return data;
}

export async function createProfessional(values) {
    const { data, error } = await supabase
        .from('profesional')
        .insert(pick(values, PROFESSIONAL_COLUMNS))
        .select('id_profesional, nombre, profesion, telefono, email, observaciones')
        .single();
    raise(error);
    return data;
}

export async function updateProfessional(id, values) {
    const { error } = await supabase
        .from('profesional')
        .update(pick(values, PROFESSIONAL_COLUMNS))
        .eq('id_profesional', id);
    raise(error);
}

/** Relaciones actuales de una esterilización (para no duplicarlas al reintentar). */
export async function listEntryLinks(idAnimalEsterilizacion) {
    const { data, error } = await supabase
        .from('esterilizacion_profesional')
        .select('id_esterilizacion_profesional, id_profesional, funcion')
        .eq('id_animal_esterilizacion', idAnimalEsterilizacion);
    raise(error);
    return data;
}

/** Corrige la función de una asociación existente (UPDATE permitido por RLS). */
export async function updateLinkFunction(idEsterilizacionProfesional, funcion) {
    const { error } = await supabase
        .from('esterilizacion_profesional')
        .update({ funcion })
        .eq('id_esterilizacion_profesional', idEsterilizacionProfesional);
    raise(error);
}

/**
 * Quita una asociación ingresada por error (RPC quitar_profesional_esterilizacion):
 * elimina solo la relación, nunca al profesional, y rechaza quitar al último.
 */
export async function removeProfessionalLink(idEsterilizacionProfesional) {
    const { error } = await supabase.rpc('quitar_profesional_esterilizacion', {
        p_id_esterilizacion_profesional: idEsterilizacionProfesional,
    });
    raise(error);
}

/** Crea una relación ESTERILIZACION_PROFESIONAL con su función. */
export async function linkProfessional(idAnimalEsterilizacion, idProfesional, funcion) {
    const { data, error } = await supabase
        .from('esterilizacion_profesional')
        .insert({ id_animal_esterilizacion: idAnimalEsterilizacion, id_profesional: idProfesional, funcion })
        .select('id_esterilizacion_profesional')
        .single();
    raise(error);
    return data.id_esterilizacion_profesional;
}
