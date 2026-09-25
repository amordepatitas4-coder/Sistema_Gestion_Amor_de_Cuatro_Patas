// ============================================================
// Acceso a datos: ANIMAL, HISTORIAL_ESTADO, foto principal y
// carpeta de Google Drive.
//
// Reglas del backend v1.1 respetadas:
//   - alta solo mediante RPC registrar_animal (firma completa);
//   - cambios de estado solo mediante RPC cambiar_estado_animal;
//   - la edición genérica actualiza únicamente columnas descriptivas
//     (nunca id_estado_actual, activo ni id_carpeta_drive);
//   - ANIMAL.activo no representa el estado del proceso.
// ============================================================

import { supabase } from '../supabase.js';

export const PHOTO_BUCKET = 'fotos-animales';
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;   // límite del bucket
export const PHOTO_MAX_SIDE = 1400;

const LIST_COLUMNS = `
    id_animal, nombre, sexo, tamaño, fecha_nacimiento, fecha_rescate, lugar_rescate,
    microchip, estado_registro_nacional, foto_principal_path, id_estado_actual,
    id_especie, id_rango_etario, fecha_registro,
    estado:estado!fk_animal_estado_actual(nombre_estado),
    especie:especie!fk_animal_especie(nombre),
    rango:rango_etario!fk_animal_rango_etario(nombre)`;

const DETAIL_COLUMNS = `
    id_animal, nombre, sexo, tamaño, fecha_nacimiento, fecha_rescate, lugar_rescate,
    caracteristicas, personalidad, historia_rescate, observaciones,
    microchip, estado_registro_nacional, foto_principal_path, id_carpeta_drive,
    id_estado_actual, id_especie, id_rango_etario, activo, fecha_registro,
    estado:estado!fk_animal_estado_actual(nombre_estado),
    especie:especie!fk_animal_especie(nombre),
    rango:rango_etario!fk_animal_rango_etario(nombre)`;

/** Columnas que el formulario genérico puede modificar. */
// Debe coincidir con los GRANT UPDATE por columna del script de seguridad 09 (lo verifica tests/permissions.test.mjs).
export const EDITABLE_COLUMNS = [
    'nombre', 'id_especie', 'id_rango_etario', 'sexo', 'tamaño',
    'fecha_nacimiento', 'fecha_rescate', 'lugar_rescate',
    'caracteristicas', 'personalidad', 'historia_rescate', 'observaciones',
    'microchip', 'estado_registro_nacional',
];

function raise(error) {
    if (error) throw error;
}

/** Animales con registro activo (todos los estados, incluido Adoptado). */
export async function listAnimals() {
    const { data, error } = await supabase
        .from('animal')
        .select(LIST_COLUMNS)
        .eq('activo', true)
        .order('fecha_registro', { ascending: false })
        .limit(1000);
    raise(error);
    return data;
}

export async function getAnimal(id) {
    const { data, error } = await supabase
        .from('animal')
        .select(DETAIL_COLUMNS)
        .eq('id_animal', id)
        .maybeSingle();
    raise(error);
    return data;
}

/**
 * RPC registrar_animal: se envían SIEMPRE los 14 parámetros (REG-03).
 * El estado inicial (Rescatado) y el primer historial los define la RPC.
 */
export async function registerAnimal(values) {
    const params = {
        p_id_especie: values.id_especie,
        p_id_rango_etario: values.id_rango_etario,
        p_nombre: values.nombre,
        p_sexo: values.sexo,
        p_tamano: values.tamaño,
        p_fecha_nacimiento: values.fecha_nacimiento,
        p_fecha_rescate: values.fecha_rescate,
        p_lugar_rescate: values.lugar_rescate,
        p_caracteristicas: values.caracteristicas,
        p_personalidad: values.personalidad,
        p_historia_rescate: values.historia_rescate,
        p_observaciones: values.observaciones,
        p_microchip: values.microchip,
        p_estado_registro_nacional: values.estado_registro_nacional,
    };
    // La RPC crea el animal y su primer historial de estado en una misma transacción.
    const { data, error } = await supabase.rpc('registrar_animal', params);
    raise(error);
    return data; // id_animal
}

/** UPDATE limitado a columnas descriptivas. */
export async function updateAnimal(id, values) {
    const patch = {};
    EDITABLE_COLUMNS.forEach((col) => {
        if (Object.prototype.hasOwnProperty.call(values, col)) patch[col] = values[col];
    });
    const { error } = await supabase.from('animal').update(patch).eq('id_animal', id);
    raise(error);
}

export async function changeState(idAnimal, idNuevoEstado, motivo, observaciones) {
    // La RPC cierra el historial vigente y abre uno nuevo; por eso el estado nunca se actualiza directamente.
    const { error } = await supabase.rpc('cambiar_estado_animal', {
        p_id_animal: idAnimal,
        p_id_nuevo_estado: idNuevoEstado,
        p_motivo_cambio: motivo,
        p_observaciones: observaciones,
    });
    raise(error);
}

export async function getStateHistory(idAnimal) {
    const { data, error } = await supabase
        .from('historial_estado')
        .select('id_historial_estado, fecha_inicio, fecha_fin, motivo_cambio, observaciones, estado:estado!fk_historial_estado_estado(nombre_estado)')
        .eq('id_animal', idAnimal)
        .order('fecha_inicio', { ascending: false })
        .order('id_historial_estado', { ascending: false });
    raise(error);
    return data;
}

// ------------------------------------------------------------
// Carpeta de Google Drive (Edge Function crear-carpeta-animal).
// Es idempotente: si la carpeta ya existe la recupera.
// ------------------------------------------------------------
export async function createDriveFolder(idAnimal) {
    const { data, error } = await supabase.functions.invoke('crear-carpeta-animal', {
        body: { id_animal: idAnimal },
    });
    raise(error);
    return data;
}

// ------------------------------------------------------------
// Foto principal (Supabase Storage, bucket privado).
// Ruta: animales/{id_animal}/principal.webp. En BD solo el path.
// ------------------------------------------------------------
export function photoPath(idAnimal) {
    return `animales/${idAnimal}/principal.webp`;
}

export async function uploadPhoto(idAnimal, webpBlob) {
    const path = photoPath(idAnimal);
    const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        // upsert reemplaza la foto anterior en la misma ruta; el caché corto evita mostrar una imagen vieja.
        .upload(path, webpBlob, { contentType: 'image/webp', upsert: true, cacheControl: '60' });
    raise(uploadError);
    // En la BD solo se guarda la ruta; la imagen se muestra con URLs firmadas temporales (bucket privado).
    const { error } = await supabase.from('animal').update({ foto_principal_path: path }).eq('id_animal', idAnimal);
    raise(error);
    return path;
}

/** URLs firmadas en una sola solicitud. Devuelve Map path → url. */
export async function signedPhotoUrls(paths, expiresIn = 3600) {
    const unique = [...new Set(paths.filter(Boolean))];
    const map = new Map();
    if (unique.length === 0) return map;
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, expiresIn);
    if (error) {
        // La falta de fotos no debe impedir mostrar los animales.
        console.warn('[Fotos] No fue posible firmar URLs', error);
        return map;
    }
    data.forEach((row) => { if (row.signedUrl && !row.error) map.set(row.path, row.signedUrl); });
    return map;
}
