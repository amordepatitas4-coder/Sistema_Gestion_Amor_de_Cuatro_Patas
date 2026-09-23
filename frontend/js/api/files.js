// ============================================================
// Archivos en Google Drive (ARCHIVO + tablas de asociación).
//
// - Carga: Edge Function subir-archivo-drive (multipart/form-data).
//   La función sube a la carpeta del contexto y registra ARCHIVO +
//   asociación mediante registrar_archivo (compensa si falla).
// - Apertura: Edge Function obtener-link-archivo con id_archivo;
//   el enlace llega en data.archivo.url (webViewLink privado).
//   Nunca se envía id_externo ni se hacen públicos los archivos.
// ============================================================

import { supabase } from '../supabase.js';

const FILE_COLUMNS = `id_archivo, nombre_archivo, nombre_original, mime_type, fecha_documento, fecha_carga, descripcion,
    categoria:categoria_archivo!fk_archivo_categoria(nombre)`;

/** Tabla de asociación por contexto (debe coincidir con registrar_archivo). */
const CONTEXTS = {
    animal: { table: 'animal_archivo', fk: 'id_animal', rel: 'fk_animal_archivo_archivo' },
    adopcion: { table: 'adopcion_archivo', fk: 'id_adopcion', rel: 'fk_adopcion_archivo_archivo' },
    gasto: { table: 'gasto_archivo', fk: 'id_gasto', rel: 'fk_gasto_archivo_archivo' },
    proyecto: { table: 'proyecto_archivo', fk: 'id_proyecto', rel: 'fk_proyecto_archivo_archivo' },
    esterilizacion: { table: 'esterilizacion_archivo', fk: 'id_animal_esterilizacion', rel: 'fk_esterilizacion_archivo_archivo' },
};

export async function listFiles(context, idContext) {
    const meta = CONTEXTS[context];
    if (!meta) throw new Error(`Contexto de archivo no soportado: ${context}`);
    const { data, error } = await supabase
        .from(meta.table)
        .select(`archivo:archivo!${meta.rel}(${FILE_COLUMNS})`)
        .eq(meta.fk, idContext);
    if (error) throw error;
    return data.map((r) => r.archivo).filter(Boolean)
        .sort((a, b) => String(b.fecha_carga).localeCompare(String(a.fecha_carga)));
}

/**
 * Sube un archivo. values: { archivo: File, idCategoria, fechaDocumento, descripcion }.
 * El FormData se construye con valores ya capturados (no desde el formulario).
 */
export async function uploadFile(context, idContext, values) {
    const body = new FormData();
    body.append('archivo', values.archivo, values.archivo.name);
    body.append('id_categoria_archivo', String(values.idCategoria));
    body.append('tipo_contexto', context);
    if (idContext !== null && idContext !== undefined) body.append('id_contexto', String(idContext));
    if (values.fechaDocumento) body.append('fecha_documento', values.fechaDocumento);
    if (values.descripcion) body.append('descripcion', values.descripcion);

    const { data, error } = await supabase.functions.invoke('subir-archivo-drive', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data; // { id_archivo, archivo: {...}, ... }
}

/** Enlace de visualización en Google Drive (privado; requiere acceso con la cuenta autorizada). */
export async function getFileLink(idArchivo) {
    const { data, error } = await supabase.functions.invoke('obtener-link-archivo', { body: { id_archivo: idArchivo } });
    if (error) throw error;
    const url = data?.archivo?.url;
    if (!url) throw new Error(data?.error || 'El servicio no devolvió un enlace para el archivo.');
    return url;
}
