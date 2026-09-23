// ============================================================
// Detalle de un gasto: #/gastos/:id
// Totales, asignaciones a animales (sin eliminación) y
// comprobantes del gasto (gasto_archivo).
// ============================================================

import { listAnimals } from '../../api/animals.js';
import { loadCatalog } from '../../api/catalogs.js';
import { getExpense } from '../../api/expenses.js';
import { reportError } from '../../core/errors.js';
import { formatCLP, formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, render, setButtonBusy, toast } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import { renderFilesSection } from '../files/section.js';
import { openAssignExpense, openEditExpense } from './form.js';
import { summarize } from './logic.js';

export default {
    title: 'Detalle de gasto',

    async render({ outlet, params, navigate }) {
        const id = Number(params.id);
        const reload = () => navigate(`/gastos/${id}`, {}, { replace: true });
        render(outlet, loadingState());

        let expense;
        let categorias;
        try {
            [expense, categorias] = await Promise.all([getExpense(id), loadCatalog('categoria_gasto')]);
        } catch (err) {
            render(outlet, errorState({ text: await reportError(err, 'Detalle de gasto'), retryId: 'retryExpense' }));
            outlet.querySelector('#retryExpense')?.addEventListener('click', reload);
            return;
        }
        if (!expense) {
            render(outlet, html`<section class="card-panel">${emptyState({
                icon: 'bi-search', title: 'No se encontró el gasto',
                action: { label: 'Volver a Gastos', icon: 'bi-arrow-left', href: '#/gastos' },
            })}</section>`);
            return;
        }

        const asignaciones = expense.asignaciones ?? [];
        const s = summarize(expense.monto, asignaciones.map((a) => a.monto_asignado));

        render(outlet, html`
            <nav aria-label="Ruta de navegación" class="mb-2">
                <a class="back-link" href="#/gastos"><i class="bi bi-arrow-left" aria-hidden="true"></i> Gastos</a>
            </nav>
            <section class="card-panel mb-3">
                <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
                    <div>
                        <h1 class="page-title" tabindex="-1">${expense.descripcion}</h1>
                        <p class="mb-0 text-secondary">${expense.categoria?.nombre ?? '—'} · ${formatDate(expense.fecha)}</p>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <button type="button" class="btn btn-outline-primary" id="btnEditExpense"><i class="bi bi-pencil" aria-hidden="true"></i> Editar</button>
                        <button type="button" class="btn btn-primary" id="btnAssign" ${s.restante > 0 ? '' : 'disabled'}>
                            <i class="bi bi-link-45deg" aria-hidden="true"></i> Asignar a animal</button>
                    </div>
                </div>
                <div class="expense-summary mt-3">
                    <div><span>Total</span><strong>${formatCLP(s.total)}</strong></div>
                    <div><span>Asignado a animales</span><strong>${formatCLP(s.asignado)}</strong></div>
                    <div><span>No asignado (general)</span><strong>${formatCLP(s.restante)}</strong></div>
                </div>
                ${s.restante === 0 && s.asignado > 0 ? html`<p class="small text-success mt-2 mb-0"><i class="bi bi-check-circle" aria-hidden="true"></i> El gasto está asignado en su totalidad.</p>` : ''}
                ${expense.observaciones ? html`<p class="pre-line small mt-3 mb-0"><strong>Observaciones:</strong> ${expense.observaciones}</p>` : ''}
            </section>

            <section class="card-panel mb-3" aria-labelledby="asigTitle">
                <h2 class="block-title" id="asigTitle"><i class="bi bi-heart" aria-hidden="true"></i> Asignaciones a animales</h2>
                ${asignaciones.length === 0
                    ? emptyState({ icon: 'bi-cash-coin', title: 'Gasto general', text: 'Este gasto no está asignado a animales.' })
                    : html`<div class="table-responsive"><table class="table align-middle mb-0">
                        <thead><tr><th scope="col">Animal</th><th scope="col" class="text-end">Monto asignado</th></tr></thead>
                        <tbody>${asignaciones.map((a) => html`<tr>
                            <td><a href="#/animales/${a.id_animal}/gastos">${animalName(a.animal ?? { id_animal: a.id_animal })}</a></td>
                            <td class="text-end">${formatCLP(a.monto_asignado)}</td>
                        </tr>`)}</tbody></table></div>
                      <p class="small text-secondary mt-2 mb-0">Las asignaciones registradas se conservan como historial y no se eliminan.</p>`}
            </section>

            <section class="card-panel" id="expenseFiles"></section>`);

        outlet.querySelector('#btnEditExpense').addEventListener('click', () => openEditExpense({ expense, categorias, onSaved: reload }));
        outlet.querySelector('#btnAssign').addEventListener('click', async (e) => {
            const restore = setButtonBusy(e.currentTarget, 'Cargando…');
            try {
                const animals = await listAnimals();
                restore();
                openAssignExpense({ expense, animals, onSaved: reload });
            } catch (err) {
                restore();
                toast(await reportError(err, 'Animales'), 'error');
            }
        });

        await renderFilesSection(outlet.querySelector('#expenseFiles'), {
            context: 'gasto',
            idContext: id,
            title: 'Comprobantes del gasto',
            emptyText: 'Boletas, facturas u otros respaldos. Se guardan en Documentación Fundación / Gastos.',
        });
    },
};
