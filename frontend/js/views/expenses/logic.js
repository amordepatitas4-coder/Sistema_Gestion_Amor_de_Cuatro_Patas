// ============================================================
// Lógica pura de Gastos (sin DOM ni Supabase).
//
// RN-57: la suma asignada NO puede superar el total del gasto.
// La igualdad es válida (REG-05); el saldo no asignado es la parte
// general del gasto y no constituye error.
// ============================================================

import { emptyToNull, formatCLP, parseISODate } from '../../core/format.js';

/** Monto en pesos: acepta "50000", "50.000" o "$ 50.000". Devuelve entero > 0 o null. */
export function parseAmount(value) {
    const text = String(value ?? '').replace(/[$\s.]/g, '');
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Totales de un gasto a partir de sus asignaciones. */
export function summarize(total, montos) {
    const asignado = montos.reduce((sum, m) => sum + (Number(m) || 0), 0);
    const t = Number(total) || 0;
    return { total: t, asignado, restante: t - asignado, excede: asignado > t };
}

export function collectExpense(formData) {
    return {
        fecha: emptyToNull(formData.get('fecha')),
        id_categoria_gasto: Number(formData.get('categoria')) || null,
        descripcion: emptyToNull(formData.get('descripcion')),
        monto: parseAmount(formData.get('monto')),
        montoTexto: emptyToNull(formData.get('monto')),
        observaciones: emptyToNull(formData.get('observaciones')),
    };
}

export function validateExpense(v, { minimoAsignado = 0 } = {}) {
    const e = {};
    if (!v.fecha) e.fecha = 'Ingresa la fecha del gasto.';
    else if (!parseISODate(v.fecha)) e.fecha = 'La fecha no es válida.';
    if (!v.id_categoria_gasto) e.categoria = 'Selecciona la categoría.';
    if (!v.descripcion) e.descripcion = 'Ingresa una descripción.';
    if (!v.monto) e.monto = v.montoTexto ? 'El monto debe ser un número entero mayor que cero.' : 'Ingresa el monto total.';
    else if (v.monto < minimoAsignado) e.monto = `El monto no puede ser menor que lo ya asignado a animales (${formatCLP(minimoAsignado)}).`;
    return e;
}

/**
 * Valida las filas de asignación del formulario.
 * rows: [{ idAnimal, monto }] (monto ya interpretado con parseAmount).
 * Devuelve { rows: {índice: mensaje}, general: mensaje|null }.
 */
export function validateAllocations(total, rows, yaAsignado = 0) {
    const errors = { rows: {}, general: null };
    const seen = new Set();
    rows.forEach((r, i) => {
        if (!r.idAnimal) errors.rows[i] = 'Selecciona el animal.';
        else if (seen.has(r.idAnimal)) errors.rows[i] = 'El animal ya está en otra fila.';
        else if (!r.monto) errors.rows[i] = 'Ingresa un monto mayor que cero.';
        if (r.idAnimal) seen.add(r.idAnimal);
    });
    const { asignado } = summarize(total, rows.map((r) => r.monto));
    if (total && yaAsignado + asignado > total) {
        errors.general = 'La suma asignada supera el monto total del gasto.';
    }
    return errors;
}

export const hasAllocationErrors = (errors) => Boolean(errors.general) || Object.keys(errors.rows).length > 0;
