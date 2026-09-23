// ============================================================
// Formato y normalización de datos.
// Funciones puras: no dependen del DOM ni de Supabase.
// ============================================================

const LOCALE = 'es-CL';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const longDateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full' });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const clpFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

const EMPTY = '—';

// ------------------------------------------------------------
// Fechas
//
// Las fechas de negocio del backend son DATE ("YYYY-MM-DD").
// Se interpretan siempre en hora local: new Date("2026-09-23")
// sería medianoche UTC y en Chile mostraría el día anterior.
// ------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

/** Convierte "YYYY-MM-DD" en Date local. Devuelve null si no es válida. */
export function parseISODate(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
}

/** Fecha local en formato "YYYY-MM-DD" (no usar toISOString(), que es UTC). */
export function toISODate(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayISO = () => toISODate(new Date());

/** Primer y último día del mes de la fecha indicada, en "YYYY-MM-DD". */
export function monthRangeISO(date = new Date()) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
}

/** "2026-09-23" → "23 sept 2026". */
export function formatDate(value) {
    const date = value instanceof Date ? value : parseISODate(value);
    return date ? dateFormatter.format(date) : EMPTY;
}

/** Fecha extendida para encabezados: "miércoles, 23 de septiembre de 2026". */
export function formatLongDate(date = new Date()) {
    return longDateFormatter.format(date);
}

/** Timestamps (TIMESTAMPTZ) → fecha y hora local. */
export function formatDateTime(value) {
    if (!value) return EMPTY;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? EMPTY : dateTimeFormatter.format(date);
}

// ------------------------------------------------------------
// Números y montos
// ------------------------------------------------------------

/** Montos BIGINT en pesos chilenos, sin decimales. */
export function formatCLP(value) {
    const n = Number(value);
    return Number.isFinite(n) ? clpFormatter.format(n) : EMPTY;
}

/** Entero positivo desde un input; null si está vacío o no es válido. */
export function parsePositiveInt(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------
// Textos
// ------------------------------------------------------------

/** Recorta y convierte "" en null para enviar al backend. */
export function emptyToNull(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return value;
    const text = value.trim();
    return text === '' ? null : text;
}

export const displayText = (value) => {
    const text = emptyToNull(value);
    return text === null ? EMPTY : String(text);
};

// ------------------------------------------------------------
// Microchip: exactamente 15 dígitos (CHECK del backend).
// ------------------------------------------------------------

export function normalizeMicrochip(value) {
    return String(value ?? '').replace(/\s+/g, '');
}

export function isValidMicrochip(value) {
    return /^[0-9]{15}$/.test(String(value ?? ''));
}

// ------------------------------------------------------------
// RUT chileno
//
// Formato almacenado (decisión 23/09/2026): "12345678-9"
// sin puntos, con guion, K mayúscula y dígito verificador válido.
// ------------------------------------------------------------

export function computeRutDv(body) {
    let sum = 0;
    let factor = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += Number(body[i]) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    const rest = 11 - (sum % 11);
    if (rest === 11) return '0';
    if (rest === 10) return 'K';
    return String(rest);
}

/**
 * Normaliza un RUT escrito en cualquier formato habitual.
 * Devuelve "12345678-9" o null si el formato o el dígito verificador no son válidos.
 */
export function normalizeRut(value) {
    const clean = String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
    const match = /^(\d{1,8})([0-9K])$/.exec(clean);
    if (!match) return null;
    const body = match[1].replace(/^0+(?=\d)/, '');
    const dv = match[2];
    return computeRutDv(body) === dv ? `${body}-${dv}` : null;
}

export const isValidRut = (value) => normalizeRut(value) !== null;

// ------------------------------------------------------------
// Correo electrónico (validación de formato básica, igual a la
// utilizada por la Edge Function invitar-usuario).
// ------------------------------------------------------------

export function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
}
