// ============================================================
// Módulo Gastos (Prompt Maestro §14): listado con filtros por
// período, categoría y animal; total, asignado y no asignado.
// ============================================================

import { listAnimals } from '../../api/animals.js';
import { loadCatalog } from '../../api/catalogs.js';
import { listExpenses } from '../../api/expenses.js';
import { reportError } from '../../core/errors.js';
import { formatCLP, formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, options, pageHeader, render } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import { openExpenseForm } from './form.js';
import { summarize } from './logic.js';

const KEYS = ['desde', 'hasta', 'categoria', 'animal'];

export default {
    title: 'Gastos',

    async render({ outlet, query, navigate }) {
        const f = Object.fromEntries(KEYS.map((k) => [k, (query.get(k) ?? '').trim()]));
        const currentQuery = () => Object.fromEntries(KEYS.filter((k) => f[k]).map((k) => [k, f[k]]));
        const reload = () => navigate('/gastos', currentQuery(), { replace: true });

        render(outlet, html`
            ${pageHeader({
                title: 'Gastos',
                subtitle: 'Gastos generales y asignados a animales',
                actions: html`<button type="button" class="btn btn-primary" id="btnNewExpense" disabled>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i> Registrar gasto</button>`,
            })}
            <div id="expensesBody">${loadingState('Cargando gastos…')}</div>`);

        const body = outlet.querySelector('#expensesBody');
        let categorias;
        let animals;
        let expenses;
        try {
            [categorias, animals, expenses] = await Promise.all([
                loadCatalog('categoria_gasto'),
                listAnimals(),
                listExpenses({ desde: f.desde || null, hasta: f.hasta || null, categoria: f.categoria || null }),
            ]);
        } catch (err) {
            render(body, errorState({ text: await reportError(err, 'Gastos'), retryId: 'retryExpenses' }));
            body.querySelector('#retryExpenses')?.addEventListener('click', reload);
            return;
        }

        const newBtn = outlet.querySelector('#btnNewExpense');
        newBtn.disabled = false;
        newBtn.addEventListener('click', () => openExpenseForm({ categorias, animals, navigate, onDone: reload }));

        const visible = f.animal
            ? expenses.filter((g) => (g.asignaciones ?? []).some((a) => String(a.id_animal) === f.animal))
            : expenses;
        const totals = visible.reduce((acc, g) => {
            const s = summarize(g.monto, (g.asignaciones ?? []).map((a) => a.monto_asignado));
            acc.total += s.total; acc.asignado += s.asignado; return acc;
        }, { total: 0, asignado: 0 });
        const hasFilters = KEYS.some((k) => f[k]);

        render(body, html`
            <section class="card-panel mb-3">
                <form class="row g-2 align-items-end" id="expFilters">
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="efDesde">Desde</label>
                        <input class="form-control" type="date" id="efDesde" name="desde" value="${f.desde}">
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="efHasta">Hasta</label>
                        <input class="form-control" type="date" id="efHasta" name="hasta" value="${f.hasta}">
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="efCat">Categoría</label>
                        <select class="form-select" id="efCat" name="categoria">
                            ${options(categorias.map((c) => ({ value: c.id, label: c.nombre })), f.categoria, { placeholder: 'Todas' })}
                        </select>
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="efAnimal">Animal</label>
                        <select class="form-select" id="efAnimal" name="animal">
                            ${options(animals.map((a) => ({ value: a.id_animal, label: animalName(a) })), f.animal, { placeholder: 'Todos' })}
                        </select>
                    </div>
                </form>
                ${hasFilters ? html`<div class="mt-2"><button type="button" class="btn btn-sm btn-link px-0" id="clearExpFilters">
                    <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros</button></div>` : ''}
            </section>

            ${visible.length > 0 ? html`
            <div class="expense-summary mb-3" role="status">
                <div><span>Total de gastos (${visible.length})</span><strong>${formatCLP(totals.total)}</strong></div>
                <div><span>Asignado a animales</span><strong>${formatCLP(totals.asignado)}</strong></div>
                <div><span>No asignado (general)</span><strong>${formatCLP(totals.total - totals.asignado)}</strong></div>
            </div>` : ''}

            ${expenses.length === 0 && !hasFilters
                ? html`<section class="card-panel">${emptyState({ icon: 'bi-cash-coin', title: 'Aún no hay gastos registrados', text: 'Registra gastos generales o asociados a animales.' })}</section>`
                : visible.length === 0
                    ? html`<section class="card-panel">${emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay gastos que coincidan con los filtros' })}</section>`
                    : html`<div class="card-panel p-0"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
                        <thead><tr>
                            <th scope="col">Fecha</th><th scope="col">Categoría</th><th scope="col">Descripción</th>
                            <th scope="col" class="text-end">Total</th><th scope="col" class="text-end">Asignado</th>
                            <th scope="col" class="text-end">No asignado</th><th scope="col"><span class="visually-hidden">Acción</span></th>
                        </tr></thead>
                        <tbody>${visible.map((g) => {
                            const s = summarize(g.monto, (g.asignaciones ?? []).map((a) => a.monto_asignado));
                            return html`<tr class="row-link">
                                <td class="text-nowrap">${formatDate(g.fecha)}</td>
                                <td>${g.categoria?.nombre ?? '—'}</td>
                                <td>${g.descripcion}
                                    ${(g.asignaciones ?? []).length ? html`<div class="small text-secondary">${g.asignaciones.map((a) => animalName(a.animal ?? { id_animal: a.id_animal })).join(', ')}</div>` : ''}</td>
                                <td class="text-end text-nowrap">${formatCLP(s.total)}</td>
                                <td class="text-end text-nowrap">${formatCLP(s.asignado)}</td>
                                <td class="text-end text-nowrap">${formatCLP(s.restante)}</td>
                                <td class="text-end"><a class="btn btn-sm btn-outline-primary stretched-link text-nowrap" href="#/gastos/${g.id_gasto}">Ver detalle</a></td>
                            </tr>`;
                        })}</tbody></table></div></div>`}`);

        const form = body.querySelector('#expFilters');
        form.addEventListener('change', (e) => {
            if (!e.target.name) return;
            f[e.target.name] = e.target.value;
            reload();
        });
        body.querySelector('#clearExpFilters')?.addEventListener('click', () => navigate('/gastos', {}, { replace: true }));
    },
};
