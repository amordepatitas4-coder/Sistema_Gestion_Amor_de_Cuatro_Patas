// ============================================================
// Lectura de documentos Word (.docx) en el navegador.
//
// Un .docx es un archivo ZIP; el texto está en word/document.xml.
// Se descomprime con DecompressionStream (nativo del navegador),
// sin librerías externas y sin enviar el archivo a ningún
// servicio: solo se leen las tablas del documento.
// ============================================================

import { AppError } from './errors.js';

// Límites defensivos: un cuestionario real pesa pocos cientos de KB.
export const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 20 * 1024 * 1024;

const NOT_DOCX = 'El archivo no es un documento Word (.docx) válido.';

// Enteros little-endian del formato ZIP.
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Busca una entrada en el directorio central del ZIP y devuelve sus datos descomprimidos. */
async function readZipEntry(bytes, wanted) {
    // El registro final del ZIP (firma 0x06054b50) está en los últimos 22 bytes + comentario (máx. 64 KB).
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
        if (u32(bytes, i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new AppError(NOT_DOCX);

    const count = u16(bytes, end + 10);
    let p = u32(bytes, end + 16);
    const decoder = new TextDecoder();
    for (let n = 0; n < count && p + 46 <= bytes.length; n += 1) {
        if (u32(bytes, p) !== 0x02014b50) break;
        const method = u16(bytes, p + 10);
        const compressed = u32(bytes, p + 20);
        const size = u32(bytes, p + 24);
        const nameLen = u16(bytes, p + 28);
        const extraLen = u16(bytes, p + 30);
        const commentLen = u16(bytes, p + 32);
        const local = u32(bytes, p + 42);
        const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (name !== wanted) continue;

        if (size > MAX_XML_BYTES || u32(bytes, local) !== 0x04034b50) throw new AppError(NOT_DOCX);
        const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
        const data = bytes.subarray(start, start + compressed);
        if (method === 0) return data;
        if (method !== 8) throw new AppError(NOT_DOCX);
        // deflate-raw: el método 8 del ZIP es DEFLATE sin cabecera zlib.
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new AppError(NOT_DOCX);
}

/** Devuelve el XML principal (word/document.xml) de un .docx recibido como File, Blob o ArrayBuffer. */
export async function readDocxXml(source) {
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    if (buffer.byteLength > MAX_DOCX_BYTES) throw new AppError('El documento supera el máximo de 10 MB.');
    const bytes = new Uint8Array(buffer);
    // Todo ZIP comienza con "PK\x03\x04"; descarta de inmediato PDF, imágenes o .doc antiguos.
    if (bytes.length < 30 || u32(bytes, 0) !== 0x04034b50) throw new AppError(NOT_DOCX);
    return new TextDecoder().decode(await readZipEntry(bytes, 'word/document.xml'));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()];
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(code);
});

/**
 * Tablas del documento como matriz de texto: tablas → filas → celdas.
 * Los párrafos de una celda se separan con salto de línea; tabulaciones
 * y saltos manuales se convierten en espacio. Admite tablas anidadas
 * (cada una se entrega por separado, en orden de aparición).
 */
export function docxTables(xml) {
    const tables = [];
    const stack = []; // tablas abiertas: { rows, row, cell }
    let inText = false;
    const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr)(?=[\s/>])[^>]*?(\/?)>|<[^>]*>|([^<]+)/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const [, closing, tag, selfClosing, text] = m;
        const top = stack[stack.length - 1];
        if (text !== undefined) {
            if (inText && top?.cell !== null && top?.cell !== undefined) top.cell += decodeEntities(text);
            continue;
        }
        if (!tag) continue;
        if (tag === 'tbl') {
            if (!closing) stack.push({ rows: [], row: null, cell: null });
            else if (stack.length) tables.push(stack.pop().rows);
        } else if (!top) {
            continue;
        } else if (tag === 'tr') {
            if (!closing) top.row = [];
            else if (top.row) { top.rows.push(top.row); top.row = null; }
        } else if (tag === 'tc') {
            if (!closing) top.cell = '';
            else if (top.cell !== null) { top.row?.push(top.cell.trim()); top.cell = null; }
        } else if (tag === 't') {
            inText = !closing && !selfClosing;
        } else if (top.cell !== null) {
            if (tag === 'p' && closing) top.cell += '\n';
            else if (tag !== 'p') top.cell += ' '; // w:tab, w:br, w:cr
        }
    }
    return tables;
}
