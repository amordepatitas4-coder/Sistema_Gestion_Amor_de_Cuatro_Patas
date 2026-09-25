// ============================================================
// Optimización de la fotografía principal antes de Storage.
// Convierte a WebP, limita el lado mayor y respeta el tamaño
// máximo del bucket (RN-27).
// ============================================================

import { AppError } from './errors.js';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Dimensiones destino manteniendo proporción (función pura). */
export function fitWithin(width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validateImageFile(file) {
    if (!(file instanceof File) || file.size === 0) return 'Selecciona una fotografía.';
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'La fotografía debe ser JPG, PNG o WebP.';
    // Límite del archivo original (antes de optimizar) para no saturar la memoria del navegador, sobre todo en celulares.
    if (file.size > 25 * 1024 * 1024) return 'La fotografía original supera 25 MB. Utiliza una imagen más liviana.';
    return null;
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new AppError('No fue posible procesar la fotografía.'))), 'image/webp', quality);
    });
}

/**
 * Devuelve un Blob WebP optimizado.
 * Reduce calidad y, si es necesario, dimensiones hasta quedar bajo maxBytes.
 */
export async function optimizeToWebp(file, { maxSide = 1400, maxBytes = 2 * 1024 * 1024 } = {}) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (err) {
        throw new AppError('No fue posible leer la fotografía. Prueba con otra imagen.', { cause: err });
    }

    let side = maxSide;
    try {
        // Estrategia: primero baja la calidad; si no alcanza, reduce el tamaño un 25 % y vuelve a intentar.
        for (let attempt = 0; attempt < 4; attempt++) {
            const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
            for (const quality of [0.85, 0.75, 0.65]) {
                const blob = await canvasToBlob(canvas, quality);
                if (blob.type !== 'image/webp') {
                    throw new AppError('Este navegador no permite convertir la fotografía a WebP. Utiliza un navegador actualizado.');
                }
                if (blob.size <= maxBytes) return blob;
            }
            side = Math.round(side * 0.75);
        }
    } finally {
        // Libera la memoria de la imagen decodificada aunque ocurra un error.
        bitmap.close?.();
    }
    throw new AppError('No fue posible reducir la fotografía por debajo de 2 MB. Prueba con otra imagen.');
}
