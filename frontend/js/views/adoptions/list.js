// ============================================================
// Módulo Adopciones: subsecciones
//   #/adopciones            → Adopciones
//   #/adopciones/adoptantes → Adoptantes
// Sin postulaciones, cuestionarios ni puntajes.
// ============================================================

import { listAdopters, listAdoptions, listAdoptionsByAdopter } from '../../api/adoptions.js';
import { listAnimals } from '../../api/animals.js';
import { adoptionBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { displayText, formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, openModal, options, pageHeader, render, setButtonBusy, toast } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import { openAdopterForm, openAdoptionForm } from './flows.js';
import { canAdopt } from './logic.js';

const fold = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default {
    title: 'Adopciones',

    async render({ outlet, route, query, navigate }) {
        // Un mismo módulo atiende dos subsecciones; la ruta decide cuál se muestra.
        const view = route.path === '/adopciones/adoptantes' ? 'adoptantes' : 'adopciones';
        const term = (query.get('q') ?? '').trim();
        const estadoFiltro = query.get('estado') ?? '';
        const reload = () => navigate(route.path, { ...(term ? { q: term } : {}), ...(estadoFiltro ? { estado: estadoFiltro } : {}) }, { replace: true });

        render(outlet, html`
            ${pageHeader({
                title: 'Adopciones',
                subtitle: 'Adopciones, adoptantes, seguimientos y devoluciones',
                actions: view === 'adopciones'
                    ? html`<button type="button" class="btn btn-primary" id="btnNewAdoption"><i class="bi bi-plus-lg" aria-hidden="true"></i> Registrar adopción</button>`
                    : html`<button type="button" class="btn btn-primary" id="btnNewAdopter"><i class="bi bi-person-plus" aria-hidden="true"></i> Nuevo adoptante</button>`,
            })}
            <nav class="section-tabs mb-3" aria-label="Secciones de adopciones">
                <ul class="nav nav-underline">
                    <li class="nav-item"><a class="nav-link ${view === 'adopciones' ? 'active' : ''}" href="#/adopciones"
                        ${view === 'adopciones' ? html`aria-current="page"` : ''}><i class="bi bi-house-check" aria-hidden="true"></i> Adopciones</a></li>
                    <li class="nav-item"><a class="nav-link ${view === 'adoptantes' ? 'active' : ''}" href="#/adopciones/adoptantes"
                        ${view === 'adoptantes' ? html`aria-current="page"` : ''}><i class="bi bi-people" aria-hidden="true"></i> Adoptantes</a></li>
                </ul>
            </nav>
            <div id="adoptionsBody">${loadingState()}</div>`);

        const body = outlet.querySelector('#adoptionsBody');
        try {
            if (view === 'adopciones') await renderAdoptions(outlet, body, { term, estadoFiltro, navigate, reload });
            else await renderAdopters(outlet, body, { term, navigate, reload });
        } catch (err) {
            render(body, errorState({ text: await reportError(err, 'Adopciones'), retryId: 'retryAdoptions' }));
            body.querySelector('#retryAdoptions')?.addEventListener('click', reload);
        }
    },
};

// ------------------------------------------------------------
// Adopciones
// ------------------------------------------------------------
async function renderAdoptions(outlet, body, { term, estadoFiltro, navigate, reload }) {
    const [adoptions, adopters] = await Promise.all([listAdoptions(), listAdopters()]);

    outlet.querySelector('#btnNewAdoption').addEventListener('click', async (e) => {
        const restore = setButtonBusy(e.currentTarget, 'Cargando…');
        try {
            const animals = await listAnimals();
            const active = new Set(adoptions.filter((a) => !a.fecha_finalizacion).map((a) => a.id_animal));
            // Solo animales adoptables y sin adopción vigente; la RPC registrar_adopcion lo vuelve a validar.
            const eligible = animals.filter((a) => canAdopt(a.estado?.nombre_estado, active.has(a.id_animal)));
            restore();
            openAdoptionForm({ animals: eligible, adopters, onSaved: (id) => navigate(`/adopciones/${id}`) });
        } catch (err) {
            restore();
            toast(await reportError(err, 'Animales disponibles'), 'error');
        }
    });

    const estados = [...new Set(adoptions.map((a) => a.estado?.nombre).filter(Boolean))];
    const visible = adoptions.filter((a) => (!estadoFiltro || a.estado?.nombre === estadoFiltro)
        && (!term || fold(a.animal?.nombre).includes(fold(term)) || fold(a.adoptante?.nombre).includes(fold(term))));

    render(body, html`
        <section class="card-panel mb-3">
            <form class="row g-2 align-items-end" id="adFilters" role="search">
                <div class="col-12 col-md-7">
                    <label class="form-label small" for="afQ">Buscar por animal o adoptante</label>
                    <input class="form-control" id="afQ" name="q" type="search" value="${term}">
                </div>
                <div class="col-12 col-md-5">
                    <label class="form-label small" for="afEstado">Estado de la adopción</label>
                    <select class="form-select" id="afEstado" name="estado">${options(estados, estadoFiltro, { placeholder: 'Todos' })}</select>
                </div>
            </form>
        </section>
        ${adoptions.length === 0
            ? html`<section class="card-panel">${emptyState({ icon: 'bi-house-check', title: 'Aún no hay adopciones registradas', text: 'Registra la primera adopción desde aquí o desde la ficha del animal.' })}</section>`
            : visible.length === 0
                ? html`<section class="card-panel">${emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay adopciones que coincidan con los filtros' })}</section>`
                : html`<div class="card-panel p-0"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
                    <thead><tr><th scope="col">Animal</th><th scope="col">Adoptante</th><th scope="col">Fecha</th>
                        <th scope="col">Estado</th><th scope="col">Seguimientos</th><th scope="col"><span class="visually-hidden">Acción</span></th></tr></thead>
                    <tbody>${visible.map((a) => html`<tr class="row-link">
                        <td class="fw-semibold">${animalName(a.animal ?? { id_animal: a.id_animal })}</td>
                        <td>${a.adoptante?.nombre ?? '—'}</td>
                        <td class="text-nowrap">${formatDate(a.fecha_adopcion)}${a.fecha_finalizacion ? html`<div class="small text-secondary">hasta ${formatDate(a.fecha_finalizacion)}</div>` : ''}</td>
                        <td>${adoptionBadge(a.estado?.nombre)}</td>
                        <td>${a.seguimiento?.[0]?.count ?? 0}</td>
                        <td class="text-end"><a class="btn btn-sm btn-outline-primary stretched-link text-nowrap" href="#/adopciones/${a.id_adopcion}">Ver detalle</a></td>
                    </tr>`)}</tbody></table></div></div>`}`);

    const form = body.querySelector('#adFilters');
    const apply = () => navigate('/adopciones', {
        ...(form.q.value.trim() ? { q: form.q.value.trim() } : {}),
        ...(form.estado.value ? { estado: form.estado.value } : {}),
    }, { replace: true });
    form.q.addEventListener('change', apply);
    form.estado.addEventListener('change', apply);
    form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
}

// ------------------------------------------------------------
// Adoptantes
// ------------------------------------------------------------
async function renderAdopters(outlet, body, { term, navigate, reload }) {
    const adopters = await listAdopters();
    outlet.querySelector('#btnNewAdopter').addEventListener('click', () => openAdopterForm({ existing: adopters, onSaved: reload }));

    // El RUT se compara sin puntos ni guion, para encontrarlo como sea que se escriba.
    const visible = adopters.filter((a) => !term || fold(a.nombre).includes(fold(term)) || fold(a.rut).replace(/[.-]/g, '').includes(fold(term).replace(/[.-]/g, '')));
    render(body, html`
        <section class="card-panel mb-3">
            <form id="apFilters" role="search">
                <label class="form-label small" for="apQ">Buscar por nombre o RUT</label>
                <input class="form-control" id="apQ" name="q" type="search" value="${term}">
            </form>
        </section>
        ${adopters.length === 0
            ? html`<section class="card-panel">${emptyState({ icon: 'bi-people', title: 'Aún no hay adoptantes registrados', text: 'Los adoptantes también pueden registrarse al momento de la adopción.' })}</section>`
            : visible.length === 0
                ? html`<section class="card-panel">${emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay adoptantes que coincidan con la búsqueda' })}</section>`
                : html`<div class="card-panel p-0"><div class="table-responsive"><table class="table align-middle mb-0">
                    <thead><tr><th scope="col">Nombre</th><th scope="col">RUT</th><th scope="col">Teléfono</th><th scope="col">Correo</th>
                        <th scope="col"><span class="visually-hidden">Acciones</span></th></tr></thead>
                    <tbody>${visible.map((a) => html`<tr>
                        <td class="fw-semibold">${a.nombre}</td>
                        <td class="text-nowrap">${a.rut}</td>
                        <td>${displayText(a.telefono)}</td>
                        <td class="text-break">${displayText(a.email)}</td>
                        <td class="text-end text-nowrap">
                            <button type="button" class="btn btn-sm btn-outline-primary" data-view="${a.id_adoptante}"><i class="bi bi-eye" aria-hidden="true"></i> Ver</button>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-edit="${a.id_adoptante}"><i class="bi bi-pencil" aria-hidden="true"></i> Editar</button>
                        </td>
                    </tr>`)}</tbody></table></div></div>`}`);

    const form = body.querySelector('#apFilters');
    form.addEventListener('submit', (e) => { e.preventDefault(); form.q.dispatchEvent(new Event('change')); });
    form.q.addEventListener('change', () => navigate('/adopciones/adoptantes', form.q.value.trim() ? { q: form.q.value.trim() } : {}, { replace: true }));

    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const adopter = adopters.find((a) => String(a.id_adoptante) === b.dataset.edit);
        openAdopterForm({ adopter, existing: adopters, onSaved: reload });
    }));
    body.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
        openAdopterDetail(adopters.find((a) => String(a.id_adoptante) === b.dataset.view));
    }));
}

async function openAdopterDetail(adopter) {
    const modal = openModal({ title: adopter.nombre, size: 'modal-lg', body: loadingState() });
    try {
        const adoptions = await listAdoptionsByAdopter(adopter.id_adoptante);
        render(modal.body, html`
            <dl class="info-grid">
                <div class="info-block"><dt>RUT</dt><dd>${adopter.rut}</dd></div>
                <div class="info-block"><dt>Teléfono</dt><dd>${displayText(adopter.telefono)}</dd></div>
                <div class="info-block"><dt>Correo</dt><dd class="text-break">${displayText(adopter.email)}</dd></div>
                <div class="info-block"><dt>Dirección</dt><dd class="pre-line">${displayText(adopter.direccion)}</dd></div>
                <div class="info-block"><dt>Edad</dt><dd>${adopter.edad ? `${adopter.edad} años` : displayText(null)}</dd></div>
                <div class="info-block"><dt>Ocupación</dt><dd>${displayText(adopter.ocupacion)}</dd></div>
            </dl>
            ${adopter.observaciones ? html`<p class="pre-line small">${adopter.observaciones}</p>` : ''}
            <h3 class="h6 mt-3">Adopciones</h3>
            ${adoptions.length === 0
                ? html`<p class="text-secondary small">Sin adopciones registradas.</p>`
                : html`<ul class="list-group list-group-flush">${adoptions.map((a) => html`
                    <li class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2">
                        <a href="#/adopciones/${a.id_adopcion}" data-modal-close>${animalName(a.animal ?? { id_animal: a.id_animal })} — ${formatDate(a.fecha_adopcion)}</a>
                        ${adoptionBadge(a.estado?.nombre)}
                    </li>`)}</ul>`}`);
    } catch (err) {
        render(modal.body, errorState({ text: await reportError(err, 'Detalle de adoptante') }));
    }
}
