// ============================================================
// Módulo Hogares temporales (Prompt Maestro §12.1).
//
// Muestra responsable, contacto, dirección, observaciones, estado
// activo y animales alojados actualmente. No muestra capacidad
// máxima (no existe en el modelo; pendiente de validación).
// ============================================================

import { listAnimals } from '../../api/animals.js';
import { listActiveStays, listHomes, listStaysByHome } from '../../api/homes.js';
import { activeBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { displayText, formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, openModal, pageHeader, render, setButtonBusy, toast } from '../../core/ui.js';
import { animalName, canEnterHome } from '../animals/logic.js';
import { openAssignAnimal, openHomeForm } from './flows.js';

export default {
    title: 'Hogares temporales',

    async render({ outlet, query, navigate }) {
        const showInactive = query.get('inactivos') === '1';
        const term = (query.get('q') ?? '').trim();
        const reload = () => navigate('/hogares', { ...(showInactive ? { inactivos: 1 } : {}), ...(term ? { q: term } : {}) }, { replace: true });

        render(outlet, html`
            ${pageHeader({
                title: 'Hogares temporales',
                subtitle: 'Red de hogares y animales alojados actualmente',
                actions: html`<button type="button" class="btn btn-primary" id="btnNewHome">
                    <i class="bi bi-house-add" aria-hidden="true"></i> Nuevo hogar</button>`,
            })}
            <div id="homesBody">${loadingState('Cargando hogares…')}</div>`);

        outlet.querySelector('#btnNewHome').addEventListener('click', () => openHomeForm({ onSaved: reload }));

        let homes;
        let stays;
        try {
            [homes, stays] = await Promise.all([listHomes(), listActiveStays()]);
        } catch (err) {
            render(outlet.querySelector('#homesBody'), errorState({ text: await reportError(err, 'Hogares'), retryId: 'retryHomes' }));
            outlet.querySelector('#retryHomes')?.addEventListener('click', reload);
            return;
        }

        const byHome = new Map();
        stays.forEach((s) => {
            if (!byHome.has(s.id_hogar)) byHome.set(s.id_hogar, []);
            byHome.get(s.id_hogar).push(s);
        });

        const fold = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const visible = homes.filter((h) => (showInactive || h.activo)
            && (!term || fold(h.nombre_responsable).includes(fold(term))));
        const inactiveCount = homes.filter((h) => !h.activo).length;
        const body = outlet.querySelector('#homesBody');

        render(body, html`
            <section class="card-panel mb-3">
                <form class="row g-2 align-items-end" id="homeFilters" role="search">
                    <div class="col-12 col-md-6">
                        <label class="form-label small" for="hfQ">Buscar por responsable</label>
                        <input class="form-control" id="hfQ" name="q" type="search" value="${term}" autocomplete="off">
                    </div>
                    <div class="col-12 col-md-6">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" role="switch" id="hfInactivos" ${showInactive ? 'checked' : ''}>
                            <label class="form-check-label" for="hfInactivos">Mostrar también hogares inactivos (${inactiveCount})</label>
                        </div>
                    </div>
                </form>
            </section>
            ${homes.length === 0
                ? html`<section class="card-panel">${emptyState({
                    icon: 'bi-house-heart', title: 'Aún no hay hogares temporales',
                    text: 'Registra el primer hogar para poder asignar animales.',
                    action: { label: 'Registrar primer hogar', icon: 'bi-house-add', id: 'btnFirstHome' },
                })}</section>`
                : visible.length === 0
                    ? html`<section class="card-panel">${emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay hogares que coincidan con la búsqueda' })}</section>`
                    : html`<div class="home-grid">${visible.map((h) => homeCard(h, byHome.get(h.id_hogar) ?? []))}</div>`}`);

        body.querySelector('#btnFirstHome')?.addEventListener('click', () => openHomeForm({ onSaved: reload }));
        body.querySelector('#hfInactivos').addEventListener('change', (e) => navigate('/hogares', { ...(e.target.checked ? { inactivos: 1 } : {}), ...(term ? { q: term } : {}) }, { replace: true }));
        const q = body.querySelector('#hfQ');
        q.addEventListener('change', () => navigate('/hogares', { ...(showInactive ? { inactivos: 1 } : {}), ...(q.value.trim() ? { q: q.value.trim() } : {}) }, { replace: true }));
        body.querySelector('#homeFilters').addEventListener('submit', (e) => { e.preventDefault(); q.dispatchEvent(new Event('change')); });

        body.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const home = homes.find((h) => String(h.id_hogar) === btn.dataset.id);
            if (!home) return;
            const occupied = byHome.get(home.id_hogar)?.length ?? 0;

            if (btn.dataset.action === 'edit') {
                openHomeForm({ home, occupiedCount: occupied, onSaved: reload });
            } else if (btn.dataset.action === 'assign') {
                const restore = setButtonBusy(btn, 'Cargando…');
                try {
                    const animals = await listAnimals();
                    const withStay = new Set(stays.map((s) => s.id_animal));
                    const eligible = animals.filter((a) => canEnterHome(a.estado?.nombre_estado, withStay.has(a.id_animal)));
                    restore();
                    openAssignAnimal({ home, animals: eligible, onSaved: reload });
                } catch (err) {
                    restore();
                    toast(await reportError(err, 'Animales disponibles'), 'error');
                }
            } else if (btn.dataset.action === 'history') {
                openHomeHistory(home);
            }
        });
    },
};

function homeCard(h, current) {
    return html`
        <article class="card-panel home-card ${h.activo ? '' : 'is-inactive'}">
            <header class="d-flex justify-content-between align-items-start gap-2">
                <div class="d-flex gap-2 align-items-center">
                    <span class="section-icon"><i class="bi bi-house-heart" aria-hidden="true"></i></span>
                    <h2 class="h6 mb-0">${h.nombre_responsable}</h2>
                </div>
                ${activeBadge(h.activo)}
            </header>
            <dl class="home-contact">
                <div><dt><i class="bi bi-telephone" aria-hidden="true"></i><span class="visually-hidden">Teléfono</span></dt><dd>${displayText(h.telefono)}</dd></div>
                <div><dt><i class="bi bi-envelope" aria-hidden="true"></i><span class="visually-hidden">Correo</span></dt><dd class="text-break">${displayText(h.email)}</dd></div>
                <div><dt><i class="bi bi-geo-alt" aria-hidden="true"></i><span class="visually-hidden">Dirección</span></dt><dd>${displayText(h.direccion)}</dd></div>
            </dl>
            ${h.observaciones ? html`<p class="small text-secondary pre-line">${h.observaciones}</p>` : ''}
            <div class="occupants">
                <div class="fw-semibold">${current.length} animal${current.length === 1 ? '' : 'es'} alojado${current.length === 1 ? '' : 's'} actualmente</div>
                ${current.length ? html`<ul class="list-unstyled mb-0 mt-1">${current.map((s) => html`
                    <li><a href="#/animales/${s.id_animal}/hogares">${animalName(s.animal ?? { id_animal: s.id_animal })}</a>
                        <span class="small text-secondary">desde ${formatDate(s.fecha_ingreso)}</span></li>`)}</ul>` : ''}
            </div>
            <footer class="d-flex flex-wrap gap-2 mt-auto pt-3">
                <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${h.id_hogar}"><i class="bi bi-pencil" aria-hidden="true"></i> Editar</button>
                <button type="button" class="btn btn-sm btn-outline-primary" data-action="history" data-id="${h.id_hogar}"><i class="bi bi-clock-history" aria-hidden="true"></i> Historial</button>
                ${h.activo ? html`<button type="button" class="btn btn-sm btn-primary" data-action="assign" data-id="${h.id_hogar}"><i class="bi bi-plus-lg" aria-hidden="true"></i> Asignar animal</button>` : ''}
            </footer>
        </article>`;
}

async function openHomeHistory(home) {
    const modal = openModal({ title: `Historial — ${home.nombre_responsable}`, size: 'modal-lg', body: loadingState() });
    try {
        const rows = await listStaysByHome(home.id_hogar);
        render(modal.body, rows.length === 0
            ? emptyState({ icon: 'bi-clock-history', title: 'Este hogar aún no ha recibido animales' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Animal</th><th scope="col">Ingreso</th><th scope="col">Salida</th><th scope="col">Observaciones</th></tr></thead>
                <tbody>${rows.map((s) => html`<tr>
                    <td><a href="#/animales/${s.id_animal}/hogares" data-modal-close>${animalName(s.animal ?? { id_animal: s.id_animal })}</a></td>
                    <td class="text-nowrap">${formatDate(s.fecha_ingreso)}</td>
                    <td class="text-nowrap">${s.fecha_salida ? formatDate(s.fecha_salida) : html`<span class="badge badge-soft-success">Actual</span>`}</td>
                    <td class="pre-line">${displayText(s.observaciones)}</td>
                </tr>`)}</tbody></table></div>`);
    } catch (err) {
        render(modal.body, errorState({ text: await reportError(err, 'Historial de hogar') }));
    }
}
