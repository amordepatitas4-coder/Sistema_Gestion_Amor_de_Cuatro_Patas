// ============================================================
// Módulo Documentos (Prompt Maestro §21): buscador transversal de
// los registros ARCHIVO ya relacionados con sus contextos.
//
// - No es un editor documental: solo buscar, filtrar y abrir en Drive
//   (obtener-link-archivo → data.archivo.url).
// - Filtros en la URL: texto, categoría, contexto, animal, proyecto
//   y rango de fechas (fecha del documento o, si falta, de carga).
// - "Subir documento" general: contexto Fundación (fundacion_archivo),
//   soportado por subir-archivo-drive y registrar_archivo.
// - No se muestran id_externo ni rutas internas (PA-DOC-05).
// ============================================================

import { loadCatalog } from '../../api/catalogs.js';
import { listDocuments } from '../../api/documents.js';
import { reportError } from '../../core/errors.js';
import { formatDate, formatDateTime } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, options, pageHeader, render } from '../../core/ui.js';
import { openFile, openUploadForm } from '../files/section.js';
import { CONTEXT_TYPES, FILTER_KEYS, fileContexts, filterDocuments, filterOptions } from './logic.js';

const ICONS = { 'application/pdf': 'bi-file-earmark-pdf', 'image/': 'bi-file-earmark-image', 'video/': 'bi-file-earmark-play', 'text/': 'bi-file-earmark-text' };
const fileIcon = (mime = '') => Object.entries(ICONS).find(([k]) => String(mime).startsWith(k))?.[1] ?? 'bi-file-earmark';
const CONTEXT_ICONS = { animal: 'bi-heart', adopcion: 'bi-house-check', gasto: 'bi-cash-coin', proyecto: 'bi-clipboard2-pulse', esterilizacion: 'bi-file-earmark-medical', fundacion: 'bi-building' };

export default {
    title: 'Documentos',

    async render({ outlet, query, navigate }) {
        const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, (query.get(k) ?? '').trim()]));
        const toQuery = () => Object.fromEntries(FILTER_KEYS.filter((k) => f[k]).map((k) => [k, f[k]]));
        const reload = () => navigate('/documentos', toQuery(), { replace: true });

        render(outlet, html`
            ${pageHeader({
                title: 'Documentos',
                subtitle: 'Buscador de los archivos guardados en Google Drive, con su contexto en el sistema',
                actions: html`<button type="button" class="btn btn-primary" id="btnUploadFoundation" disabled>
                    <i class="bi bi-cloud-arrow-up" aria-hidden="true"></i> Subir documento de la Fundación</button>`,
            })}
            <div id="docsBody">${loadingState('Cargando documentos…')}</div>`);

        const body = outlet.querySelector('#docsBody');
        let files;
        let categorias;
        try {
            [files, categorias] = await Promise.all([listDocuments(), loadCatalog('categoria_archivo')]);
        } catch (err) {
            render(body, errorState({ text: await reportError(err, 'Documentos'), retryId: 'retryDocs' }));
            body.querySelector('#retryDocs')?.addEventListener('click', reload);
            return;
        }

        const uploadBtn = outlet.querySelector('#btnUploadFoundation');
        uploadBtn.disabled = false;
        uploadBtn.addEventListener('click', () => openUploadForm({ context: 'fundacion', idContext: null, onSaved: reload }));

        const opts = filterOptions(files);
        render(body, html`
            <section class="card-panel mb-3">
                <form class="row g-2 align-items-end" id="docFilters" role="search">
                    <div class="col-12 col-lg-4">
                        <label class="form-label small" for="dfQ">Buscar</label>
                        <input class="form-control" type="search" id="dfQ" name="q" value="${f.q}" autocomplete="off" placeholder="Nombre, descripción o contexto">
                    </div>
                    <div class="col-6 col-lg-4">
                        <label class="form-label small" for="dfCat">Categoría</label>
                        <select class="form-select" id="dfCat" name="categoria">${options(categorias.map((c) => ({ value: c.id, label: c.nombre })), f.categoria, { placeholder: 'Todas' })}</select>
                    </div>
                    <div class="col-6 col-lg-4">
                        <label class="form-label small" for="dfCtx">Contexto</label>
                        <select class="form-select" id="dfCtx" name="contexto">${options(CONTEXT_TYPES, f.contexto, { placeholder: 'Todos' })}</select>
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="dfAnimal">Animal</label>
                        <select class="form-select" id="dfAnimal" name="animal">${options(opts.animals, f.animal, { placeholder: 'Todos' })}</select>
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="dfProyecto">Proyecto</label>
                        <select class="form-select" id="dfProyecto" name="proyecto">${options(opts.projects, f.proyecto, { placeholder: 'Todos' })}</select>
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="dfDesde">Fecha desde</label>
                        <input class="form-control" type="date" id="dfDesde" name="desde" value="${f.desde}">
                    </div>
                    <div class="col-6 col-lg-3">
                        <label class="form-label small" for="dfHasta">Fecha hasta</label>
                        <input class="form-control" type="date" id="dfHasta" name="hasta" value="${f.hasta}">
                    </div>
                </form>
                <p class="small text-secondary mt-2 mb-0">Las fechas consideran la fecha del documento o, si no fue indicada, la fecha de carga.</p>
                <div class="mt-1" id="clearDocsBox"></div>
            </section>
            <div id="docsResults"></div>`);

        const results = body.querySelector('#docsResults');
        const clearBox = body.querySelector('#clearDocsBox');

        const draw = () => {
            const visible = filterDocuments(files, f);
            const hasFilters = FILTER_KEYS.some((k) => f[k]);
            render(clearBox, hasFilters ? html`<button type="button" class="btn btn-sm btn-link px-0" id="clearDocs">
                <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros</button>` : '');
            clearBox.querySelector('#clearDocs')?.addEventListener('click', () => navigate('/documentos', {}, { replace: true }));

            if (files.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({ icon: 'bi-folder2-open', title: 'Aún no hay documentos registrados',
                    text: 'Los archivos se suben desde la ficha del animal, las adopciones, los gastos o los proyectos de esterilización.' })}</section>`);
                return;
            }
            if (visible.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({ icon: 'bi-funnel', variant: 'noresults',
                    title: 'No hay documentos que coincidan con los filtros', text: 'Prueba con otros criterios o limpia los filtros.' })}</section>`);
                return;
            }
            render(results, html`
                <section class="card-panel">
                    <p class="small text-secondary" role="status">${visible.length} de ${files.length} documentos</p>
                    <ul class="file-list">${visible.map((file) => html`
                        <li class="file-item">
                            <i class="bi ${fileIcon(file.mime_type)} file-icon" aria-hidden="true"></i>
                            <div class="file-info">
                                <div class="fw-semibold text-break">${file.nombre_original ?? file.nombre_archivo}</div>
                                <div class="small text-secondary">${file.categoria?.nombre ?? 'Sin categoría'}
                                    · Documento: ${formatDate(file.fecha_documento)} · Cargado: ${formatDateTime(file.fecha_carga)}</div>
                                <div class="d-flex flex-wrap gap-1 mt-1">${fileContexts(file).map((c) => (c.href
                                    ? html`<a class="badge badge-soft-info text-decoration-none" href="${c.href}"><i class="bi ${CONTEXT_ICONS[c.tipo]}" aria-hidden="true"></i> ${c.label}</a>`
                                    : html`<span class="badge badge-soft-muted"><i class="bi ${CONTEXT_ICONS[c.tipo]}" aria-hidden="true"></i> ${c.label}</span>`))}</div>
                                ${file.descripcion ? html`<div class="small pre-line mt-1">${file.descripcion}</div>` : ''}
                            </div>
                            <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-open="${file.id_archivo}">
                                <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Abrir en Drive</button>
                        </li>`)}</ul>
                </section>`);
        };

        const syncUrl = () => {
            const qs = new URLSearchParams(toQuery()).toString();
            history.replaceState(null, '', `#/documentos${qs ? `?${qs}` : ''}`);
        };
        const form = body.querySelector('#docFilters');
        form.addEventListener('submit', (e) => e.preventDefault());
        const onChange = (e) => {
            if (!e.target.name) return;
            f[e.target.name] = e.target.value.trim();
            syncUrl();
            draw();
        };
        form.addEventListener('input', (e) => { if (e.target.name === 'q') onChange(e); });
        form.addEventListener('change', onChange);
        results.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-open]');
            if (btn) openFile(btn, Number(btn.dataset.open));
        });
        draw();
    },
};
