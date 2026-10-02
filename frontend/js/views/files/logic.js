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

// Prompt para una herramienta EXTERNA de generación de imágenes (ChatGPT, Gemini u otra):
// pide un flyer con estructura e identidad visual fijas, para que las piezas sean coherentes entre sí.
export const PROMPT_BASE = 'Diseña una imagen gráfica (flyer) para redes sociales que promueva la adopción responsable '
    + 'del animal de la(s) fotografía(s) adjunta(s), para la Fundación Amor de Cuatro Patas, una fundación de rescate animal.';

const PROMPT_DISENO = [
    'Formato y estilo:',
    '- Publicación cuadrada para redes sociales (1080 × 1080 px).',
    '- Debe verse como una publicación institucional de una fundación de rescate: cálida, cercana, esperanzadora, amigable y profesional.',
    '- Identidad visual de la Fundación: burdeo (#780205) como color estructural, fucsia (#FD054C) como acento, y blanco o tonos muy claros de fondo. Usa otros colores solo si son suaves y aportan.',
    '- Composición limpia, con buena jerarquía visual y tipografías claras y legibles.',
    '- Evita: exceso de colores, fondos recargados, exceso de texto, estilos infantiles exagerados y tipografías difíciles de leer.',
    '',
    'Fotografías:',
    '- Usa la fotografía adjunta del animal como protagonista de la pieza.',
    '- Si adjunto dos fotografías, usa una como principal y la otra como fotografía complementaria más pequeña.',
    '- No inventes otro animal ni modifiques su aspecto físico (colores, pelaje, tamaño, rasgos). Solo puedes recortar, encuadrar o ajustar la iluminación.',
    '',
    'Estructura (de mayor a menor jerarquía):',
    '1. El nombre del animal en grande: es el texto más destacado.',
    '2. Un mensaje breve de adopción cerca del nombre, por ejemplo «BUSCA UNA FAMILIA» (puedes adaptarlo, con tono positivo y respetuoso).',
    '3. La fotografía principal (y la secundaria, si existe).',
    '4. Una ficha resumida con los datos indicados abajo (no es necesario mostrar la especie si es evidente en la foto).',
    '5. Una presentación muy breve (1 a 3 frases) basada en su personalidad, características e historia, sin copiar textos largos.',
    '6. Un llamado a la acción breve, por ejemplo «¿Quieres darle una oportunidad?».',
    '7. El texto «Fundación Amor de Cuatro Patas» y un espacio reservado para incorporar después el logo oficial.',
    '',
    'Reglas:',
    '- Usa solo la información indicada abajo; no inventes datos, características ni historia.',
    '- No agregues teléfonos, correos, direcciones, redes sociales ni otros datos de contacto.',
    '- Revisa que todos los textos de la imagen estén en español y bien escritos.',
];

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

// Valores que no aportan información y no deben llegar al flyer.
const SIN_VALOR = ['no registrado', 'sin información', 'sin informacion', 'sin indicar', 'desconocido', 'null', 'undefined', '-', '—'];
const hasValue = (v) => {
    const t = String(v ?? '').trim();
    return t !== '' && !SIN_VALOR.includes(t.toLowerCase());
};

/**
 * Prompt estructurado y editable para generar un flyer en una herramienta externa de imágenes.
 * Solo incluye los datos de la ficha que tienen valor: los vacíos o "sin información" se omiten
 * para que el flyer no muestre textos como "No registrado".
 */
export function buildDiffusionPrompt(d) {
    const datos = [
        ['Nombre', d.nombre],
        ['Especie', d.especie],
        ['Sexo', d.sexo],
        d.edad ? ['Edad aproximada', d.edad] : ['Etapa de vida', d.rango],
        ['Tamaño', d.tamano],
        ['Esterilización', d.esterilizacion],
        ['Personalidad', d.personalidad],
        ['Características', d.caracteristicas],
        ['Historia del rescate', d.historia],
    ].filter(([, v]) => hasValue(v)).map(([label, v]) => `- ${label}: ${String(v).trim()}`);
    return [
        PROMPT_BASE,
        '',
        ...PROMPT_DISENO,
        '',
        'Información del animal:',
        ...(datos.length ? datos : ['- (Sin datos registrados: usa solo la fotografía y el nombre de la Fundación.)']),
    ].join('\n');
}
