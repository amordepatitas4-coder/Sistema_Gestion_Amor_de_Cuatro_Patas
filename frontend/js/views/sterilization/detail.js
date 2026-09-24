// ============================================================
// Detalle de un proyecto de esterilización: #/esterilizacion/:id/:tab
//
// Pestañas EXACTAS (Prompt Maestro §17.3, PA-PRO-04):
//   Información · Nómina · Profesionales · Documentación
//
// - Nómina (§18): código, especie, sexo, microchip, Registro Nacional,
//   fecha, lugar, profesional(es), documento y acciones.
//   Documento de esterilización (PDF, JPG, PNG o WebP; uno por animal):
//   "Adjuntar documento" si no existe; "Abrir documento" si existe.
//   Sin "Reemplazar" en el MVP (decisión 23/09/2026).
// - Profesionales (§19): derivados de la nómina
//   (PROYECTO → ANIMAL_ESTERILIZACION → ESTERILIZACION_PROFESIONAL → PROFESIONAL).
// - Documentación (§20): archivos del proyecto (contexto 'proyecto'),
//   subcarpeta Documentación; distintos de las fichas de la nómina.
// ============================================================

import { loadCatalogs } from '../../api/catalogs.js';
import { getProject, listEntries, listProfessionals } from '../../api/sterilization.js';
import { projectBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { csvFileName, downloadCSV, toCSV } from '../../core/export.js';
import { displayText, formatDate, todayISO } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, render, setButtonBusy, toast } from '../../core/ui.js';
import { openFile, renderFilesSection } from '../files/section.js';
import {
    documentIcon, openAddEntry, openAttachDocument, openEditEntry, openEditProject, openEntryProfessionals,
    openEntryDetail, openProfessionalForm, retryProjectFolder,
} from './forms.js';
import {
    DOC_CATEGORY, NOMINA_EXPORT_COLUMNS, deriveProjectProfessionals, documentStatus, filterEntries, projectPeriod,
} from './logic.js';

export const TABS = [
    { slug: 'informacion', label: 'Información', icon: 'bi-info-circle', render: renderInfoTab },
    { slug: 'nomina', label: 'Nómina', icon: 'bi-list-check', render: renderNominaTab },
    { slug: 'profesionales', label: 'Profesionales', icon: 'bi-person-badge', render: renderProfessionalsTab },
    { slug: 'documentacion', label: 'Documentación', icon: 'bi-folder2-open', render: renderDocsTab },
];

export default {
    title: 'Proyecto de esterilización',

    async render({ outlet, params, navigate }) {
        const id = Number(params.id);
        const tab = TABS.find((t) => t.slug === (params.tab ?? 'informacion'));
        if (!Number.isInteger(id) || id <= 0 || !tab) {
            render(outlet, notFound());
            return;
        }
        const reloadAll = () => navigate(`/esterilizacion/${id}/${tab.slug}`, {}, { replace: true });
        render(outlet, loadingState('Cargando proyecto…'));

        let project;
        let entries;
        let catalogs;
        try {
            [project, entries, catalogs] = await Promise.all([
                getProject(id),
                listEntries(id),
                loadCatalogs(['estado_proyecto', 'especie', 'rango_etario', 'categoria_archivo']),
            ]);
        } catch (err) {
            render(outlet, errorState({ text: await reportError(err, 'Proyecto de esterilización'), retryId: 'retryProject' }));
            outlet.querySelector('#retryProject')?.addEventListener('click', reloadAll);
            return;
        }
        if (!project) {
            render(outlet, notFound());
            return;
        }
        document.title = `${project.nombre} · Amor de Cuatro Patas`;

        const professionals = deriveProjectProfessionals(entries);
        const pendingDocs = entries.filter((e) => !documentStatus(e).exists).length;
        const hasFolder = Boolean(project.id_carpeta_drive);

        render(outlet, html`
            <nav aria-label="Ruta de navegación" class="mb-2">
                <a class="back-link" href="#/esterilizacion"><i class="bi bi-arrow-left" aria-hidden="true"></i> Proyectos de esterilización</a>
            </nav>
            <section class="card-panel mb-3">
                <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
                    <div>
                        <h1 class="page-title" tabindex="-1">${project.nombre}</h1>
                        <p class="mb-2 text-secondary">${projectPeriod(project, formatDate)}${project.entidad_financiante ? ` · ${project.entidad_financiante}` : ''}</p>
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            ${projectBadge(project.estado?.nombre)}
                            <span class="badge badge-soft-info"><i class="bi bi-list-check" aria-hidden="true"></i> ${entries.length} en nómina</span>
                            <span class="badge badge-soft-info"><i class="bi bi-person-badge" aria-hidden="true"></i> ${professionals.length} profesionales</span>
                            ${pendingDocs > 0 ? html`<span class="badge badge-soft-warning"><i class="bi bi-file-earmark-text" aria-hidden="true"></i> ${pendingDocs} documento(s) pendiente(s)</span>` : ''}
                        </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <button type="button" class="btn btn-outline-primary" id="btnEditProject"><i class="bi bi-pencil" aria-hidden="true"></i> Editar proyecto</button>
                    </div>
                </div>
                ${hasFolder ? '' : html`
                <div class="alert alert-warning d-flex flex-wrap gap-2 align-items-center mt-3 mb-0" role="alert">
                    <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                    <div class="flex-grow-1">La carpeta del proyecto en Google Drive aún no está preparada. Es necesaria para la nómina (documentos de esterilización) y la documentación.</div>
                    <button type="button" class="btn btn-sm btn-primary" id="btnRetryFolder"><i class="bi bi-folder-plus" aria-hidden="true"></i> Crear carpeta en Drive</button>
                </div>`}
            </section>

            <nav class="detail-tabs" aria-label="Secciones del proyecto">
                <ul class="nav nav-underline flex-nowrap">
                    ${TABS.map((t) => html`<li class="nav-item">
                        <a class="nav-link ${t === tab ? 'active' : ''}" href="#/esterilizacion/${id}/${t.slug}"
                           ${t === tab ? html`aria-current="page"` : ''}><i class="bi ${t.icon}" aria-hidden="true"></i> ${t.label}</a>
                    </li>`)}
                </ul>
            </nav>
            <section class="card-panel tab-panel" id="tabPanel" aria-label="${tab.label}">${loadingState()}</section>`);

        outlet.querySelector('#btnEditProject').addEventListener('click', () => openEditProject({ project, estados: catalogs.estado_proyecto, onSaved: reloadAll }));
        outlet.querySelector('#btnRetryFolder')?.addEventListener('click', (e) => retryProjectFolder(e.currentTarget, id, reloadAll));

        const panel = outlet.querySelector('#tabPanel');
        const ctx = { project, entries, catalogs, professionals, hasFolder, reloadAll, navigate };
        const renderTab = async () => {
            render(panel, loadingState());
            try {
                await tab.render(panel, ctx);
            } catch (err) {
                render(panel, errorState({ text: await reportError(err, `Pestaña ${tab.label}`), retryId: 'retryTab' }));
                panel.querySelector('#retryTab')?.addEventListener('click', renderTab);
            }
        };
        await renderTab();
    },
};

function notFound() {
    return html`<section class="card-panel">${emptyState({
        icon: 'bi-search',
        title: 'No se encontró el proyecto',
        text: 'El enlace no corresponde a un proyecto registrado o la sección no existe.',
        action: { label: 'Volver a Proyectos', icon: 'bi-arrow-left', href: '#/esterilizacion' },
    })}</section>`;
}

// ------------------------------------------------------------
// Información
// ------------------------------------------------------------
async function renderInfoTab(panel, { project, entries, hasFolder }) {
    const item = (label, value) => html`<div class="info-block"><dt>${label}</dt><dd>${displayText(value)}</dd></div>`;
    const withDoc = entries.filter((e) => documentStatus(e).exists).length;
    render(panel, html`
        <dl class="info-grid">
            ${item('Estado', project.estado?.nombre)}
            ${item('Fecha de postulación', project.fecha_postulacion ? formatDate(project.fecha_postulacion) : null)}
            ${item('Fecha de inicio', project.fecha_inicio ? formatDate(project.fecha_inicio) : null)}
            ${item('Fecha de término', project.fecha_fin ? formatDate(project.fecha_fin) : null)}
            ${item('Responsable', project.responsable)}
            ${item('Entidad financiante', project.entidad_financiante)}
            ${item('Animales en nómina', String(entries.length))}
            ${item('Documentos de esterilización', `${withDoc} de ${entries.length}`)}
            ${item('Carpeta en Google Drive', hasFolder ? 'Preparada (Documentación y Animales)' : 'Pendiente')}
        </dl>
        <dl class="info-text">
            ${item('Descripción', project.descripcion)}
            ${item('Observaciones', project.observaciones)}
        </dl>
        <p class="small text-secondary mt-3 mb-0"><i class="bi bi-info-circle" aria-hidden="true"></i>
            Los animales de la nómina pertenecen solo a este proyecto y no forman parte del módulo Animales (rescate y adopción).
            Al finalizar el proyecto, su nómina, profesionales y documentación se conservan como historial.</p>`);
}

// ------------------------------------------------------------
// Nómina
// ------------------------------------------------------------
async function renderNominaTab(panel, { project, entries, catalogs, hasFolder, reloadAll }) {
    const categoriaDoc = catalogs.categoria_archivo.find((c) => c.nombre === DOC_CATEGORY && c.activo);
    const blockReason = !hasFolder
        ? 'Para agregar animales primero debe crearse la carpeta del proyecto en Google Drive (botón superior).'
        : !categoriaDoc
            ? `No se encontró la categoría de archivo activa "${DOC_CATEGORY}". Revísala en Configuración → Catálogos.`
            : null;
    let term = '';

    render(panel, html`
        <div class="tab-toolbar">
            <div class="flex-grow-1 nomina-search">
                <label class="visually-hidden" for="nomQ">Buscar en la nómina</label>
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                    <input class="form-control" type="search" id="nomQ" placeholder="Código, microchip, sector, lugar o profesional" autocomplete="off">
                </div>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnExportNomina" ${entries.length ? '' : 'disabled'}>
                    <i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i> Exportar Excel (CSV)</button>
                <button type="button" class="btn btn-sm btn-primary" id="btnAddEntry" ${blockReason ? 'disabled' : ''}>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i> Agregar animal</button>
            </div>
        </div>
        ${blockReason ? html`<p class="small text-warning-emphasis"><i class="bi bi-info-circle" aria-hidden="true"></i> ${blockReason}</p>` : ''}
        <div id="nominaTable"></div>`);

    const table = panel.querySelector('#nominaTable');
    const draw = () => {
        const visible = filterEntries(entries, term);
        if (entries.length === 0) {
            render(table, emptyState({ icon: 'bi-list-check', title: 'La nómina está vacía',
                text: 'Agrega los animales esterilizados en este proyecto con su código, profesionales y documento de esterilización.' }));
            return;
        }
        if (visible.length === 0) {
            render(table, emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay animales que coincidan con la búsqueda' }));
            return;
        }
        render(table, html`
            <div class="table-responsive"><table class="table align-middle mb-0 nomina-table">
                <thead><tr>
                    <th scope="col">Código</th><th scope="col">Especie</th><th scope="col">Sexo</th>
                    <th scope="col">Microchip</th><th scope="col">Registro Nacional</th><th scope="col">Fecha</th>
                    <th scope="col">Lugar</th><th scope="col">Profesional(es)</th><th scope="col">Documento</th>
                    <th scope="col"><span class="visually-hidden">Acciones</span></th>
                </tr></thead>
                <tbody>${visible.map((e) => {
                    const doc = documentStatus(e);
                    return html`<tr>
                        <th scope="row" class="text-nowrap"><span class="badge badge-soft-info code-badge">${e.codigo}</span></th>
                        <td>${e.especie?.nombre ?? '—'}</td>
                        <td>${e.sexo}</td>
                        <td class="text-nowrap">${e.microchip ? html`<i class="bi bi-upc-scan" aria-hidden="true"></i> ${e.microchip}` : html`<span class="text-secondary">Sin microchip</span>`}</td>
                        <td>${displayText(e.estado_registro_nacional)}</td>
                        <td class="text-nowrap">${formatDate(e.fecha_esterilizacion)}</td>
                        <td>${displayText(e.lugar_esterilizacion)}</td>
                        <td>${(e.profesionales ?? []).length
                            ? html`<ul class="list-unstyled mb-0 small">${e.profesionales.map((r) => html`<li>${r.profesional?.nombre ?? '—'} <span class="text-secondary">(${r.funcion})</span></li>`)}</ul>`
                            : html`<span class="small text-warning-emphasis">Sin profesional</span>`}</td>
                        <td class="text-nowrap">${doc.exists
                            ? html`<button type="button" class="btn btn-sm btn-outline-primary" data-open-doc="${doc.latest.id_archivo}">
                                <i class="bi ${documentIcon(doc.latest.mime_type)}" aria-hidden="true"></i> Abrir documento</button>`
                            : html`<button type="button" class="btn btn-sm btn-warning" data-attach="${e.id_animal_esterilizacion}" ${blockReason ? 'disabled' : ''}>
                                <i class="bi bi-paperclip" aria-hidden="true"></i> Adjuntar documento</button>`}</td>
                        <td class="text-end text-nowrap">
                            <div class="btn-group btn-group-sm" role="group" aria-label="Acciones para ${e.codigo}">
                                <button type="button" class="btn btn-outline-secondary" data-view="${e.id_animal_esterilizacion}" title="Ver detalle"><i class="bi bi-eye" aria-hidden="true"></i><span class="visually-hidden">Ver detalle de ${e.codigo}</span></button>
                                <button type="button" class="btn btn-outline-secondary" data-edit="${e.id_animal_esterilizacion}" title="Editar datos"><i class="bi bi-pencil" aria-hidden="true"></i><span class="visually-hidden">Editar ${e.codigo}</span></button>
                                <button type="button" class="btn btn-outline-secondary" data-add-prof="${e.id_animal_esterilizacion}" title="Profesionales (agregar o corregir función)"><i class="bi bi-person-gear" aria-hidden="true"></i><span class="visually-hidden">Profesionales de ${e.codigo}</span></button>
                            </div>
                        </td>
                    </tr>`;
                })}</tbody></table></div>
            <p class="small text-secondary mt-2 mb-0">${visible.length} de ${entries.length} animales. El código es interno del proyecto y es distinto del microchip.</p>`);
    };
    draw();

    const byId = (id) => entries.find((e) => String(e.id_animal_esterilizacion) === String(id));
    panel.querySelector('#nomQ').addEventListener('input', (ev) => { term = ev.target.value; draw(); });

    table.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || btn.disabled) return;
        if (btn.dataset.openDoc) return openFile(btn, Number(btn.dataset.openDoc));
        if (btn.dataset.attach) return openAttachDocument({ entry: byId(btn.dataset.attach), idCategoriaDoc: categoriaDoc.id, onSaved: reloadAll });
        if (btn.dataset.view) return openEntryDetail({ entry: byId(btn.dataset.view) });
        if (btn.dataset.edit) {
            const entry = byId(btn.dataset.edit);
            return openEditEntry({ entry, others: entries.filter((x) => x !== entry), catalogs, onSaved: reloadAll });
        }
        if (btn.dataset.addProf) {
            const restore = setButtonBusy(btn, '');
            try {
                const all = await listProfessionals();
                restore();
                openEntryProfessionals({ entry: byId(btn.dataset.addProf), professionals: all, onSaved: reloadAll });
            } catch (err) {
                restore();
                toast(await reportError(err, 'Profesionales'), 'error');
            }
        }
        return undefined;
    });

    panel.querySelector('#btnAddEntry').addEventListener('click', async (ev) => {
        const restore = setButtonBusy(ev.currentTarget, 'Cargando…');
        try {
            const all = await listProfessionals();
            restore();
            openAddEntry({ project, entries, catalogs, professionals: all, idCategoriaDoc: categoriaDoc.id, onDone: reloadAll });
        } catch (err) {
            restore();
            toast(await reportError(err, 'Profesionales'), 'error');
        }
    });

    panel.querySelector('#btnExportNomina').addEventListener('click', () => {
        const rows = filterEntries(entries, term);
        downloadCSV(csvFileName(`nomina ${project.nombre}`, todayISO()), toCSV(NOMINA_EXPORT_COLUMNS, rows));
        toast(`Nómina exportada (${rows.length} ${rows.length === 1 ? 'animal' : 'animales'}).`, 'success');
    });
}

// ------------------------------------------------------------
// Profesionales (derivados de la nómina; no hay FK directa)
// ------------------------------------------------------------
async function renderProfessionalsTab(panel, { professionals, reloadAll }) {
    render(panel, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Profesionales del proyecto</h2>
                <p class="small text-secondary mb-0">Se obtienen de las esterilizaciones de la nómina. Un profesional puede participar en varios proyectos.</p>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" id="btnNewProf"><i class="bi bi-person-plus" aria-hidden="true"></i> Nuevo profesional</button>
        </div>
        ${professionals.length === 0
            ? emptyState({ icon: 'bi-person-badge', title: 'Aún no hay profesionales asociados',
                text: 'Los profesionales aparecen aquí al asociarlos a los animales de la nómina.' })
            : html`<div class="table-responsive"><table class="table align-middle mb-0">
                <thead><tr><th scope="col">Nombre</th><th scope="col">Profesión</th><th scope="col">Contacto</th>
                    <th scope="col">Funciones</th><th scope="col" class="text-end">Esterilizaciones</th><th scope="col"><span class="visually-hidden">Acciones</span></th></tr></thead>
                <tbody>${professionals.map((p) => html`<tr>
                    <td class="fw-semibold">${p.nombre ?? '—'}</td>
                    <td>${displayText(p.profesion)}</td>
                    <td class="small">${p.telefono ? html`<div><i class="bi bi-telephone" aria-hidden="true"></i> ${p.telefono}</div>` : ''}
                        ${p.email ? html`<div><i class="bi bi-envelope" aria-hidden="true"></i> ${p.email}</div>` : ''}
                        ${!p.telefono && !p.email ? '—' : ''}</td>
                    <td>${p.funciones.join(', ')}</td>
                    <td class="text-end"><span title="${p.codigos.join(', ')}">${p.esterilizaciones}</span></td>
                    <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" data-edit-prof="${p.id_profesional}">
                        <i class="bi bi-pencil" aria-hidden="true"></i> Editar</button></td>
                </tr>`)}</tbody></table></div>`}`);

    panel.querySelector('#btnNewProf').addEventListener('click', () => openProfessionalForm({ onSaved: reloadAll }));
    panel.querySelectorAll('[data-edit-prof]').forEach((btn) => btn.addEventListener('click', () => {
        const prof = professionals.find((p) => String(p.id_profesional) === btn.dataset.editProf);
        openProfessionalForm({ professional: prof, onSaved: reloadAll });
    }));
}

// ------------------------------------------------------------
// Documentación del proyecto (subcarpeta Documentación)
// ------------------------------------------------------------
async function renderDocsTab(panel, { project, hasFolder }) {
    await renderFilesSection(panel, {
        context: 'proyecto',
        idContext: project.id_proyecto,
        title: 'Documentación del proyecto',
        emptyText: 'Bases, convenios, informes, rendiciones u otros documentos generales. Se guardan en la subcarpeta Documentación (las fichas de cada animal están en la Nómina).',
        uploadBlocked: hasFolder ? null : 'Primero debe crearse la carpeta del proyecto en Google Drive (botón superior).',
    });
}
