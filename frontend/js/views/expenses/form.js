// ============================================================
// Formularios de Gastos: registro con asignaciones, edición y
// asignación posterior a un gasto existente.
//
// Registro (varios pasos, sin transacción única en el backend):
//   1. capturar y validar todo (incluidas las filas de asignación);
//   2. INSERT gasto;
//   3. desde aquí el gasto EXISTE: el formulario se reemplaza por un
//      resumen y no puede reenviarse;
//   4. RPC asignar_gasto_animal por cada fila; un fallo se informa
//      como resultado parcial y se completa desde el detalle.
// ============================================================

import { assignExpense, createExpense, updateExpense } from '../../api/expenses.js';
import { selectable } from '../../api/catalogs.js';
import { reportError } from '../../core/errors.js';
import { bindForm, showFormErrors } from '../../core/forms.js';
import { formatCLP, todayISO } from '../../core/format.js';
import { html, openModal, options, render, toast } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import {
    collectExpense, hasAllocationErrors, parseAmount, summarize, validateAllocations, validateExpense,
} from './logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

function expenseFields(v, categorias) {
    const cats = selectable(categorias, v.id_categoria_gasto).map((c) => ({ value: c.id, label: c.nombre }));
    return html`
        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label" for="gFecha">Fecha ${req}</label>
                <input class="form-control" type="date" id="gFecha" name="fecha" required value="${v.fecha ?? todayISO()}">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="gCategoria">Categoría ${req}</label>
                <select class="form-select" id="gCategoria" name="categoria" required>${options(cats, v.id_categoria_gasto ?? '')}</select>
            </div>
            <div class="col-md-4">
                <label class="form-label" for="gMonto">Monto total (CLP) ${req}</label>
                <div class="input-group">
                    <span class="input-group-text">$</span>
                    <input class="form-control" id="gMonto" name="monto" inputmode="numeric" required value="${v.monto ?? ''}" autocomplete="off">
                </div>
            </div>
            <div class="col-12">
                <label class="form-label" for="gDesc">Descripción ${req}</label>
                <input class="form-control" id="gDesc" name="descripcion" required value="${v.descripcion ?? ''}">
            </div>
            <div class="col-12">
                <label class="form-label" for="gObs">Observaciones</label>
                <textarea class="form-control" id="gObs" name="observaciones" rows="2">${v.observaciones ?? ''}</textarea>
            </div>
        </div>`;
}

function summaryBox(total, asignado) {
    const s = summarize(total, [asignado]);
    return html`
        <div class="expense-summary ${s.excede ? 'is-over' : ''}" role="status" aria-live="polite">
            <div><span>Total</span><strong>${formatCLP(s.total)}</strong></div>
            <div><span>Asignado a animales</span><strong>${formatCLP(s.asignado)}</strong></div>
            <div><span>${s.excede ? 'Excede el total en' : 'No asignado (gasto general)'}</span>
                <strong>${formatCLP(Math.abs(s.restante))}</strong></div>
        </div>`;
}

function allocationRow(animals, i, preset = {}) {
    return html`
        <div class="allocation-row" data-row="${i}">
            <div class="flex-grow-1">
                <label class="form-label small" for="alAnimal${i}">Animal</label>
                <select class="form-select" id="alAnimal${i}" name="al_animal_${i}" data-al-animal>
                    ${options(animals.map((a) => ({ value: a.id_animal, label: animalName(a) })), preset.idAnimal ?? '')}
                </select>
            </div>
            <div class="allocation-amount">
                <label class="form-label small" for="alMonto${i}">Monto asignado</label>
                <input class="form-control" id="alMonto${i}" name="al_monto_${i}" inputmode="numeric" data-al-monto value="${preset.monto ?? ''}" autocomplete="off">
            </div>
            <button type="button" class="btn btn-outline-secondary btn-icon-sm" data-remove-row aria-label="Quitar fila"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            <div class="invalid-feedback d-block w-100" data-row-error></div>
        </div>`;
}

/** Lee las filas de asignación (valores capturados, no se bloquea ningún input). */
function readRows(form) {
    return [...form.querySelectorAll('[data-row]')].map((row) => ({
        idAnimal: Number(row.querySelector('[data-al-animal]').value) || null,
        monto: parseAmount(row.querySelector('[data-al-monto]').value),
        montoTexto: row.querySelector('[data-al-monto]').value.trim(),
    })).filter((r) => r.idAnimal || r.montoTexto);
}

// ------------------------------------------------------------
// Registrar gasto (con asignaciones opcionales)
// ------------------------------------------------------------
export function openExpenseForm({ categorias, animals, presetAnimalId = null, navigate, onDone }) {
    let createdId = null;
    const modal = openModal({
        title: 'Registrar gasto',
        size: 'modal-lg',
        onHidden: () => { if (createdId) onDone?.(createdId); },
        body: html`
            <form id="expenseForm" novalidate>
                <div data-form-error hidden></div>
                ${expenseFields({}, categorias)}
                <fieldset class="form-section mt-3">
                    <legend>Asignación a animales (opcional)</legend>
                    <p class="small text-secondary">Un gasto puede ser general, asignarse a un animal o compartirse entre varios.
                        La suma asignada puede ser igual o menor al total; la diferencia queda como gasto general.</p>
                    <div id="allocations"></div>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="addRow"><i class="bi bi-plus-lg" aria-hidden="true"></i> Agregar animal</button>
                    <div id="expenseSummary" class="mt-3"></div>
                </fieldset>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Registrar gasto</button>
                </div>
            </form>`,
    });
    const form = modal.body.querySelector('#expenseForm');
    const container = form.querySelector('#allocations');
    let rowIndex = 0;

    // Recalcula en vivo total, asignado y saldo mientras la usuaria escribe.
    const refreshSummary = () => {
        const total = parseAmount(form.monto.value) ?? 0;
        const asignado = readRows(form).reduce((s, r) => s + (r.monto ?? 0), 0);
        render(form.querySelector('#expenseSummary'), summaryBox(total, asignado));
    };
    const addRow = (preset) => {
        // Agrega una fila sin redibujar las anteriores, para no perder lo ya escrito.
        container.insertAdjacentHTML('beforeend', String(allocationRow(animals, rowIndex++, preset)));
        refreshSummary();
    };
    form.querySelector('#addRow').addEventListener('click', () => addRow());
    container.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-row]')) { e.target.closest('[data-row]').remove(); refreshSummary(); }
    });
    form.addEventListener('input', refreshSummary);
    form.addEventListener('change', refreshSummary);
    if (presetAnimalId) addRow({ idAnimal: presetAnimalId });
    refreshSummary();

    bindForm(form, {
        context: 'Registro de gasto',
        busyLabel: 'Registrando…',
        collect: (fd) => ({ values: collectExpense(fd), rows: readRows(form) }),
        validate: ({ values, rows }) => {
            form.querySelectorAll('[data-row-error]').forEach((el) => { el.textContent = ''; });
            const errors = validateExpense(values);
            const al = validateAllocations(values.monto ?? 0, rows);
            if (hasAllocationErrors(al)) {
                const visibleRows = [...form.querySelectorAll('[data-row]')].filter((row) =>
                    row.querySelector('[data-al-animal]').value || row.querySelector('[data-al-monto]').value.trim());
                Object.entries(al.rows).forEach(([i, msg]) => {
                    const el = visibleRows[Number(i)]?.querySelector('[data-row-error]');
                    if (el) el.textContent = msg;
                });
                errors._form = al.general ?? 'Revisa las asignaciones a animales.';
            }
            return errors;
        },
        submit: async ({ values }) => {
            modal.setBusy(true);
            try { return await createExpense(values); } finally { modal.setBusy(false); }
        },
        // El gasto ya existe: las asignaciones se ejecutan después y cada una informa su resultado.
        onSuccess: async (idGasto, { values, rows }) => {
            createdId = idGasto;
            await runAllocations(modal, { idGasto, values, rows, animals, navigate, onGoTo: () => { createdId = null; } });
        },
    });
}

async function runAllocations(modal, { idGasto, values, rows, animals, navigate, onGoTo }) {
    const steps = [
        { label: `Gasto registrado: ${values.descripcion} (${formatCLP(values.monto)})`, status: 'ok' },
        ...rows.map((r) => ({
            label: `Asignación a ${animalName(animals.find((a) => a.id_animal === r.idAnimal) ?? { id_animal: r.idAnimal })}: ${formatCLP(r.monto)}`,
            status: 'pending', row: r,
        })),
    ];
    const draw = (done = false) => render(modal.body, html`
        <div aria-live="polite">
            <ul class="list-unstyled mb-3">${steps.map((s) => html`
                <li class="post-step">${stepIcon(s.status)} <span>${s.label}</span>
                    ${s.message ? html`<div class="small text-secondary ms-4">${s.message}</div>` : ''}</li>`)}</ul>
            ${done && steps.some((s) => s.status === 'error') ? html`
                <div class="alert alert-warning py-2" role="alert">
                    El gasto quedó registrado. <strong>No vuelvas a registrarlo.</strong>
                    Las asignaciones pendientes pueden completarse desde el detalle del gasto.
                </div>` : ''}
            ${done ? html`<div class="modal-actions">
                <button type="button" class="btn btn-outline-primary" data-modal-close>Cerrar</button>
                <button type="button" class="btn btn-primary" id="goExpense"><i class="bi bi-arrow-right" aria-hidden="true"></i> Ver detalle del gasto</button>
            </div>` : ''}
        </div>`);

    modal.setBusy(true);
    draw();
    // Asignaciones en secuencia (no en paralelo): así la validación RN-57 de cada RPC considera las anteriores.
    for (const step of steps.slice(1)) {
        step.status = 'running';
        draw();
        try {
            await assignExpense(idGasto, step.row.idAnimal, step.row.monto);
            step.status = 'ok';
        } catch (err) {
            step.status = 'error';
            step.message = await reportError(err, 'Asignación de gasto');
        }
        draw();
    }
    modal.setBusy(false);
    draw(true);
    const failed = steps.some((s) => s.status === 'error');
    toast(failed ? 'Gasto registrado con asignaciones pendientes.' : 'Gasto registrado correctamente.', failed ? 'warning' : 'success');
    modal.body.querySelector('#goExpense').addEventListener('click', () => {
        onGoTo();
        modal.close();
        navigate(`/gastos/${idGasto}`);
    });
}

function stepIcon(status) {
    switch (status) {
        case 'ok': return html`<i class="bi bi-check-circle-fill text-success" aria-label="Completado"></i>`;
        case 'error': return html`<i class="bi bi-exclamation-triangle-fill text-warning" aria-label="No completado"></i>`;
        case 'running': return html`<span class="spinner-border spinner-border-sm text-primary" aria-label="En curso"></span>`;
        default: return html`<i class="bi bi-circle text-secondary" aria-label="Pendiente"></i>`;
    }
}

// ------------------------------------------------------------
// Editar gasto (el total no puede quedar bajo lo ya asignado)
// ------------------------------------------------------------
export function openEditExpense({ expense, categorias, onSaved }) {
    const asignado = (expense.asignaciones ?? []).reduce((s, a) => s + Number(a.monto_asignado), 0);
    const modal = openModal({
        title: 'Editar gasto',
        size: 'modal-lg',
        body: html`
            <form id="editExpenseForm" novalidate>
                <div data-form-error hidden></div>
                ${expenseFields(expense, categorias)}
                ${asignado > 0 ? html`<p class="small text-secondary mt-2">Asignado actualmente a animales: ${formatCLP(asignado)}.
                    El monto total no puede ser menor.</p>` : ''}
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Guardar cambios</button>
                </div>
            </form>`,
    });
    bindForm(modal.body.querySelector('#editExpenseForm'), {
        context: 'Edición de gasto',
        busyLabel: 'Guardando…',
        collect: collectExpense,
        validate: (v) => validateExpense(v, { minimoAsignado: asignado }),
        submit: async (v) => {
            modal.setBusy(true);
            try { await updateExpense(expense.id_gasto, v); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Gasto actualizado.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Asignar un gasto existente a un animal (RPC asignar_gasto_animal)
// ------------------------------------------------------------
export function openAssignExpense({ expense, animals, onSaved }) {
    const ya = new Set((expense.asignaciones ?? []).map((a) => a.id_animal));
    const asignado = (expense.asignaciones ?? []).reduce((s, a) => s + Number(a.monto_asignado), 0);
    // Saldo sin asignar; la RPC vuelve a verificarlo en el servidor.
    const disponible = Number(expense.monto) - asignado;
    const candidates = animals.filter((a) => !ya.has(a.id_animal));
    const modal = openModal({
        title: 'Asignar gasto a un animal',
        body: html`
            <form id="assignExpenseForm" novalidate>
                <div data-form-error hidden></div>
                ${summaryBox(expense.monto, asignado)}
                <div class="row g-3 mt-1">
                    <div class="col-md-7">
                        <label class="form-label" for="aeAnimal">Animal ${req}</label>
                        <select class="form-select" id="aeAnimal" name="animal" required>
                            ${options(candidates.map((a) => ({ value: a.id_animal, label: animalName(a) })), '')}
                        </select>
                    </div>
                    <div class="col-md-5">
                        <label class="form-label" for="aeMonto">Monto ${req}</label>
                        <input class="form-control" id="aeMonto" name="monto" inputmode="numeric" required value="${disponible > 0 ? disponible : ''}">
                        <div class="form-text">Disponible: ${formatCLP(disponible)}</div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-link-45deg" aria-hidden="true"></i> Asignar</button>
                </div>
            </form>`,
    });
    const form = modal.body.querySelector('#assignExpenseForm');
    bindForm(form, {
        context: 'Asignación de gasto',
        busyLabel: 'Asignando…',
        collect: (fd) => ({ idAnimal: Number(fd.get('animal')) || null, monto: parseAmount(fd.get('monto')) }),
        validate: (v) => {
            const e = {};
            if (!v.idAnimal) e.animal = 'Selecciona el animal.';
            if (!v.monto) e.monto = 'Ingresa un monto mayor que cero.';
            else if (v.monto > disponible) e.monto = `El monto supera lo disponible (${formatCLP(disponible)}).`;
            return e;
        },
        submit: async (v) => {
            modal.setBusy(true);
            try { await assignExpense(expense.id_gasto, v.idAnimal, v.monto); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Asignación registrada.', 'success');
            await onSaved?.();
        },
        onError: (err, message) => showFormErrors(form, { _form: message }),
    });
}
