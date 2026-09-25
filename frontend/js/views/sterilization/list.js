// ============================================================
// Módulo Proyectos de esterilización:
// tarjetas con nombre, estado, período, entidad financiante y
// cantidad de animales registrados. Sin meta/cupo de animales.
// Filtros en la URL: #/esterilizacion?q=…&estado=…
// ============================================================

import { loadCatalog } from '../../api/catalogs.js';
import { listProjects } from '../../api/sterilization.js';
import { projectBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, options, pageHeader, render } from '../../core/ui.js';
import { openCreateProject } from './forms.js';
import { projectPeriod } from './logic.js';

// Normaliza texto para buscar sin distinguir tildes ni mayúsculas ("Nuñoa" = "nunoa").
const plain = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default {
    title: 'Proyectos de esterilización',

    async render({ outlet, query, navigate }) {
        const f = { q: (query.get('q') ?? '').trim(), estado: (query.get('estado') ?? '').trim() };
        const toQuery = () => Object.fromEntries(Object.entries(f).filter(([, v]) => v));
        const reload = () => navigate('/esterilizacion', toQuery(), { replace: true });

        render(outlet, html`
            ${pageHeader({
                title: 'Proyectos de esterilización',
                subtitle: 'Proyectos, nóminas de animales esterilizados, profesionales y documentación',
                actions: html`<button type="button" class="btn btn-primary" id="btnNewProject" disabled>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i> Nuevo proyecto</button>`,
            })}
            <div id="projectsBody">${loadingState('Cargando proyectos…')}</div>`);

        const body = outlet.querySelector('#projectsBody');
        let estados;
        let projects;
        try {
            [estados, projects] = await Promise.all([loadCatalog('estado_proyecto'), listProjects()]);
        } catch (err) {
            render(body, errorState({ text: await reportError(err, 'Proyectos de esterilización'), retryId: 'retryProjects' }));
            body.querySelector('#retryProjects')?.addEventListener('click', reload);
            return;
        }

        const newBtn = outlet.querySelector('#btnNewProject');
        newBtn.disabled = false;
        // knownIds permite reconocer el proyecto recién creado si la respuesta del servidor se pierde (evita duplicados).
        const openNew = () => openCreateProject({ estados, navigate, onCreated: reload, knownIds: projects.map((p) => p.id_proyecto) });
        newBtn.addEventListener('click', openNew);

        const hasFilters = () => Boolean(f.q || f.estado);
        render(body, html`
            <section class="card-panel mb-3">
                <form class="row g-2 align-items-end" id="projFilters" role="search">
                    <div class="col-md-7">
                        <label class="form-label small" for="pfQ">Buscar</label>
                        <input class="form-control" type="search" id="pfQ" name="q" value="${f.q}" autocomplete="off" placeholder="Nombre, entidad financiante o responsable">
                    </div>
                    <div class="col-md-5">
                        <label class="form-label small" for="pfEstado">Estado</label>
                        <select class="form-select" id="pfEstado" name="estado">
                            ${options(estados.map((e) => ({ value: e.id, label: e.nombre })), f.estado, { placeholder: 'Todos' })}
                        </select>
                    </div>
                </form>
                <div class="mt-2" id="clearProjBox"></div>
            </section>
            <div id="projResults"></div>`);

        const results = body.querySelector('#projResults');
        const clearBox = body.querySelector('#clearProjBox');

        // Filtrado en el navegador sobre la lista ya cargada: la búsqueda responde al instante mientras se escribe.
        const draw = () => {
            const term = plain(f.q);
            const visible = projects.filter((p) => (!f.estado || String(p.id_estado_proyecto) === f.estado)
                && (!term || plain(p.nombre).includes(term) || plain(p.entidad_financiante).includes(term) || plain(p.responsable).includes(term)));
            render(clearBox, hasFilters() ? html`<button type="button" class="btn btn-sm btn-link px-0" id="clearProjFilters">
                <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros</button>` : '');
            clearBox.querySelector('#clearProjFilters')?.addEventListener('click', () => navigate('/esterilizacion', {}, { replace: true }));

            if (projects.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({
                    icon: 'bi-clipboard2-pulse', title: 'Aún no hay proyectos de esterilización',
                    text: 'Registra el primer proyecto para comenzar su nómina y documentación.',
                    action: { label: 'Crear primer proyecto', id: 'btnFirstProject' },
                })}</section>`);
                results.querySelector('#btnFirstProject').addEventListener('click', openNew);
                return;
            }
            if (visible.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({
                    icon: 'bi-funnel', variant: 'noresults', title: 'No hay proyectos que coincidan con los filtros',
                    text: 'Prueba con otros criterios o limpia los filtros.' })}</section>`);
                return;
            }
            render(results, html`
                <p class="small text-secondary mb-2" role="status">${visible.length} ${visible.length === 1 ? 'proyecto' : 'proyectos'}</p>
                <div class="home-grid">${visible.map((p) => html`
                    <article class="card-panel project-card">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <h2 class="h6 fw-bold mb-0"><a class="stretched-link text-reset text-decoration-none" href="#/esterilizacion/${p.id_proyecto}">${p.nombre}</a></h2>
                            ${projectBadge(p.estado?.nombre)}
                        </div>
                        <dl class="home-contact small mb-0">
                            <div><dt><i class="bi bi-calendar-range" aria-hidden="true"></i><span class="visually-hidden">Período</span></dt><dd>${projectPeriod(p, formatDate)}</dd></div>
                            <div><dt><i class="bi bi-bank" aria-hidden="true"></i><span class="visually-hidden">Entidad financiante</span></dt><dd>${p.entidad_financiante ?? 'Sin entidad financiante'}</dd></div>
                            ${p.responsable ? html`<div><dt><i class="bi bi-person" aria-hidden="true"></i><span class="visually-hidden">Responsable</span></dt><dd>${p.responsable}</dd></div>` : ''}
                        </dl>
                        <div class="occupants small d-flex flex-wrap justify-content-between gap-2">
                            <span><i class="bi bi-list-check" aria-hidden="true"></i> <strong>${p.total_animales}</strong> ${p.total_animales === 1 ? 'animal registrado' : 'animales registrados'}</span>
                            ${p.id_carpeta_drive ? '' : html`<span class="text-warning-emphasis"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Carpeta Drive pendiente</span>`}
                        </div>
                    </article>`)}</div>`);
        };

        // Actualiza la URL sin recargar datos (el foco del buscador se conserva).
        const syncUrl = () => {
            const qs = new URLSearchParams(toQuery()).toString();
            history.replaceState(null, '', `#/esterilizacion${qs ? `?${qs}` : ''}`);
        };
        const form = body.querySelector('#projFilters');
        form.addEventListener('submit', (e) => e.preventDefault());
        form.addEventListener('input', (e) => { if (e.target.name === 'q') { f.q = e.target.value.trim(); syncUrl(); draw(); } });
        form.estado.addEventListener('change', () => { f.estado = form.estado.value; syncUrl(); draw(); });
        draw();
    },
};
