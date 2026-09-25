// ============================================================
// Lógica pura de Archivos y Difusión (sin DOM ni Supabase).
// ============================================================

import { parseISODate } from '../../core/format.js';

// Límite aplicado por la Edge Function subir-archivo-drive.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Categoría sugerida por contexto (se busca por nombre en el catálogo real). */
export const SUGGESTED_CATEGORY = {
    animal: 'Documento sanitario',
    adopcion: 'Contrato de adopción',
    gasto: 'Comprobante de gasto',
    proyecto: 'Documento de proyecto',
    esterilizacion: 'Documento de esterilización',
    fundacion: 'Documento administrativo',
};

export function validateUpload(v) {
    const e = {};
    if (!(v.archivo instanceof File) || v.archivo.size === 0) e.archivo = 'Selecciona un archivo.';
    else if (v.archivo.size > MAX_FILE_BYTES) e.archivo = 'El archivo supera el límite de 10 MB.';
    if (!v.idCategoria) e.categoria = 'Selecciona la categoría.';
    if (v.fechaDocumento && !parseISODate(v.fechaDocumento)) e.fecha_documento = 'La fecha no es válida.';
    return e;
}

export function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ------------------------------------------------------------
// Difusión (RF-14, RF-15, RN-29..RN-33)
//
// Solo información autorizada de la ficha: nombre, especie, sexo,
// edad/rango, tamaño, personalidad, historia y características.
// NUNCA: RUT, direcciones, teléfonos, datos de adoptantes u
// hogares, microchip ni observaciones internas.
// No existen en el modelo "requisitos de adopción" ni un contacto
// institucional: quedan como texto editable para completar.
// ------------------------------------------------------------

export const PROMPT_BASE = 'Redacta una publicación para redes sociales destinada a promover la adopción responsable de este animal. '
    + 'Utiliza la información de su ficha, destacando su personalidad, características y situación actual. '
    + 'Mantén un tono cercano, positivo y respetuoso. No inventes información que no se encuentre registrada.';

export const CONTACT_PLACEHOLDER = '[Completar con el contacto oficial de la Fundación]';

/** Edad aproximada desde la fecha de nacimiento (texto), o null. */
export function approximateAge(fechaNacimiento, today = new Date()) {
    const birth = parseISODate(fechaNacimiento);
    if (!birth) return null;
    let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
    if (today.getDate() < birth.getDate()) months -= 1;
    // Fecha de nacimiento futura: no se calcula una edad.
    if (months < 0) return null;
    if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'año' : 'años'}`;
}

/** Datos autorizados para difusión a partir de la ficha. */
export function diffusionData(animal, today = new Date()) {
    return {
        nombre: animal.nombre?.trim() || null,
        especie: animal.especie?.nombre ?? null,
        sexo: animal.sexo && animal.sexo !== 'Desconocido' ? animal.sexo : null,
        edad: approximateAge(animal.fecha_nacimiento, today),
        rango: animal.rango?.nombre ?? null,
        tamano: animal.tamaño ?? null,
        personalidad: animal.personalidad?.trim() || null,
        historia: animal.historia_rescate?.trim() || null,
        caracteristicas: animal.caracteristicas?.trim() || null,
        // 'Sin información' no se publica: solo se informa lo que se sabe.
        esterilizacion: ['Esterilizado', 'No esterilizado'].includes(animal.estado_esterilizacion) ? animal.estado_esterilizacion : null,
    };
}

// Campos que conviene completar en la ficha para que el texto de difusión quede más completo.
export function missingDiffusionFields(d) {
    const labels = { nombre: 'nombre', personalidad: 'personalidad', historia: 'historia del rescate', caracteristicas: 'características' };
    return Object.entries(labels).filter(([k]) => !d[k]).map(([, l]) => l);
}

/** Texto base editable para una publicación. */
export function buildDiffusionText(d) {
    const nombre = d.nombre ?? 'Este peludito';
    const edad = d.edad ? `${d.edad} aprox.` : d.rango;
    // En el texto base solo se destaca cuando está esterilizado, concordando con el sexo del animal.
    const esterilizado = d.esterilizacion === 'Esterilizado'
        ? (d.sexo === 'Hembra' ? 'Esterilizada' : d.sexo === 'Macho' ? 'Esterilizado' : 'Esterilizado/a') : null;
    const descripcion = [d.especie, d.sexo, d.tamano ? `Tamaño ${d.tamano.toLowerCase()}` : null, edad, esterilizado]
        .filter(Boolean).join(' · ');
    const lines = [
        `🐾 ${nombre} busca una familia 💗`,
        '',
        descripcion || null,
        d.personalidad ? `Personalidad: ${d.personalidad}` : null,
        d.caracteristicas ? `Características: ${d.caracteristicas}` : null,
        d.historia ? `Su historia: ${d.historia}` : null,
        '',
        '¿Quieres conocer más sobre su proceso de adopción responsable? Escríbenos.',
        `Contacto: ${CONTACT_PLACEHOLDER}`,
        '',
        '#AdopciónResponsable #FundaciónAmorDeCuatroPatas',
    ];
    return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Prompt estructurado y editable para usar en una herramienta externa. */
export function buildDiffusionPrompt(d) {
    const field = (label, value) => `- ${label}: ${value ?? 'No registrado'}`;
    return [
        PROMPT_BASE,
        '',
        'Información de la ficha:',
        field('Nombre', d.nombre),
        field('Especie', d.especie),
        field('Sexo', d.sexo),
        field('Edad aproximada', d.edad ?? d.rango),
        field('Tamaño', d.tamano),
        field('Esterilización', d.esterilizacion),
        field('Personalidad', d.personalidad),
        field('Características', d.caracteristicas),
        field('Historia del rescate', d.historia),
        '',
        `Cierra invitando a contactar a la Fundación Amor de Cuatro Patas (${CONTACT_PLACEHOLDER}).`,
        'No incluyas datos personales de adoptantes, hogares temporales ni direcciones.',
    ].join('\n');
}
