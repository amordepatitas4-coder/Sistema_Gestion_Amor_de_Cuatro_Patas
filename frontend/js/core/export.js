// ============================================================
// Exportación a Excel mediante CSV (sin dependencias externas).
//
// - Separador ";" y BOM UTF-8: Excel en configuración regional
//   es-CL abre el archivo con columnas y tildes correctas.
// - Protección contra inyección de fórmulas: los textos que
//   comienzan con = + - @ se anteponen con un apóstrofo.
// - Columnas "text" (p. ej. microchip) se exportan como texto para
//   conservar ceros a la izquierda y evitar notación científica.
// ============================================================

const SEPARATOR = ';';

function quote(text) {
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Convierte un valor en celda CSV segura. */
export function csvCell(value, { text = false } = {}) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let s = String(value);
    // Fórmula ="000123": Excel la muestra como texto y conserva los ceros a la izquierda.
    if (text && /^\d+$/.test(s)) return `="${s}"`;
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return quote(s);
}

/**
 * columns: [{ label, value: (row) => any, text?: boolean }]
 * Devuelve el contenido CSV (con BOM) listo para descargar.
 */
export function toCSV(columns, rows) {
    const header = columns.map((c) => csvCell(c.label)).join(SEPARATOR);
    const body = rows.map((row) => columns.map((c) => csvCell(c.value(row), { text: c.text })).join(SEPARATOR));
    // El carácter invisible inicial es el BOM UTF-8, necesario para que Excel reconozca las tildes.
    return `﻿${[header, ...body].join('\r\n')}`;
}

/** Nombre de archivo seguro: "nomina-proyecto-x-2026-09-23.csv". */
export function csvFileName(base, dateISO) {
    const slug = String(base ?? 'informe')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'informe';
    return `${slug}-${dateISO}.csv`;
}

/** Descarga el CSV en el navegador. */
export function downloadCSV(fileName, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Se libera la URL temporal después de iniciar la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
