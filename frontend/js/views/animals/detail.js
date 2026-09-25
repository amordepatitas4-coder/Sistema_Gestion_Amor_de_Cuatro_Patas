// ============================================================
// Ficha integral del animal: #/animales/:id/:tab
//
// Pestañas EXACTAS:
//   Resumen · Salud · Hogares · Adopción · Gastos · Archivos · Historial · Difusión
// Cada pestaña es una ruta propia: navegar a Historial nunca
// redirige al Dashboard (REG-09) y el botón Atrás funciona.
// ============================================================

import { getAnimal, signedPhotoUrls } from '../../api/animals.js';
import { loadCatalogs } from '../../api/catalogs.js';
import { listStaysByAnimal } from '../../api/homes.js';
import { availabilityIndicator, stateBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { emptyState, errorState, html, loadingState, render } from '../../core/ui.js';
import { openEditAnimal, openPhotoForm } from './form.js';
import { lastListQuery } from './list.js';
import { animalName } from './logic.js';
import { openChangeState } from './state.js';
import { renderHistoryTab, renderSummaryTab } from './tabs/basic.js';
import { renderHealthTab } from './tabs/health.js';
import { renderHomesTab } from './tabs/homes.js';
import { renderAdoptionTab, renderDiffusionTab, renderExpensesTab, renderFilesTab } from './tabs/processes.js';

// Cada pestaña es un módulo con su propia función render; el slug forma parte de la URL.
export const TABS = [
    { slug: 'resumen', label: 'Resumen', icon: 'bi-card-text', render: renderSummaryTab },
    { slug: 'salud', label: 'Salud', icon: 'bi-clipboard2-pulse', render: renderHealthTab },
    { slug: 'hogares', label: 'Hogares', icon: 'bi-house-heart', render: renderHomesTab },
    { slug: 'adopcion', label: 'Adopción', icon: 'bi-house-check', render: renderAdoptionTab },
    { slug: 'gastos', label: 'Gastos', icon: 'bi-cash-coin', render: renderExpensesTab },
    { slug: 'archivos', label: 'Archivos', icon: 'bi-folder2-open', render: renderFilesTab },
    { slug: 'historial', label: 'Historial', icon: 'bi-clock-history', render: renderHistoryTab },
    { slug: 'difusion', label: 'Difusión', icon: 'bi-megaphone', render: renderDiffusionTab },
];

export default {
    title: 'Ficha del animal',

    async render({ outlet, params, navigate }) {
        const id = Number(params.id);
        const tab = TABS.find((t) => t.slug === (params.tab ?? 'resumen'));
        const backHref = `#/animales${Object.keys(lastListQuery).length ? `?${new URLSearchParams(lastListQuery)}` : ''}`;

        if (!Number.isInteger(id) || id <= 0 || !tab) {
            render(outlet, notFound(backHref));
            return;
        }

        render(outlet, loadingState('Cargando ficha…'));

        let animal;
        let catalogs;
        let stays;
        try {
            [animal, catalogs, stays] = await Promise.all([
                getAnimal(id),
                loadCatalogs(['estado', 'especie', 'rango_etario', 'tipo_atencion_sanitaria']),
                listStaysByAnimal(id),
            ]);
        } catch (err) {
            render(outlet, errorState({ text: await reportError(err, 'Ficha del animal'), retryId: 'retryDetail' }));
            outlet.querySelector('#retryDetail')?.addEventListener('click', () => navigate(`/animales/${id}/${tab.slug}`, {}, { replace: true }));
            return;
        }
        // Un animal con registro inactivo se trata como no encontrado (activo no es el estado del proceso).
        if (!animal || !animal.activo) {
            render(outlet, notFound(backHref));
            return;
        }

        // El bucket es privado: la foto se muestra con una URL firmada que expira.
        const photoUrl = (await signedPhotoUrls([animal.foto_principal_path])).get(animal.foto_principal_path);
        const hasActiveStay = stays.some((s) => !s.fecha_salida);
        const name = animalName(animal);
        document.title = `${name} · Amor de Cuatro Patas`;

        const reloadAll = () => navigate(`/animales/${id}/${tab.slug}`, {}, { replace: true });

        render(outlet, html`
            <nav aria-label="Ruta de navegación" class="mb-2">
                <a class="back-link" href="${backHref}"><i class="bi bi-arrow-left" aria-hidden="true"></i> Animales</a>
            </nav>
            <section class="card-panel animal-header">
                <div class="animal-header-photo">
                    ${photoUrl
                        ? html`<img src="${photoUrl}" alt="Fotografía de ${name}">`
                        : html`<span class="photo-placeholder" aria-hidden="true"><i class="bi bi-heart"></i></span>`}
                    <button type="button" class="btn btn-sm btn-light photo-button" id="btnPhoto">
                        <i class="bi bi-camera" aria-hidden="true"></i> ${photoUrl ? 'Cambiar foto' : 'Agregar foto'}</button>
                </div>
                <div class="animal-header-info">
                    <h1 class="page-title" tabindex="-1">${name}</h1>
                    <p class="mb-2 text-secondary">${[animal.especie?.nombre, animal.sexo, animal.rango?.nombre].filter(Boolean).join(' · ')}</p>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        ${stateBadge(animal.estado?.nombre_estado)}
                        ${availabilityIndicator(animal.estado?.nombre_estado)}
                        ${animal.microchip ? html`<span class="badge badge-soft-info"><i class="bi bi-upc-scan" aria-hidden="true"></i> ${animal.microchip}</span>` : ''}
                    </div>
                </div>
                <div class="animal-header-actions">
                    <button type="button" class="btn btn-outline-primary" id="btnEdit"><i class="bi bi-pencil" aria-hidden="true"></i> Editar información</button>
                    <button type="button" class="btn btn-primary" id="btnState"><i class="bi bi-arrow-repeat" aria-hidden="true"></i> Cambiar estado</button>
                </div>
            </section>

            <nav class="detail-tabs" aria-label="Secciones de la ficha">
                <ul class="nav nav-underline flex-nowrap">
                    ${TABS.map((t) => html`<li class="nav-item">
                        <a class="nav-link ${t === tab ? 'active' : ''}" href="#/animales/${id}/${t.slug}"
                           ${t === tab ? html`aria-current="page"` : ''}><i class="bi ${t.icon}" aria-hidden="true"></i> ${t.label}</a>
                    </li>`)}
                </ul>
            </nav>
            <section class="card-panel tab-panel" id="tabPanel" aria-label="${tab.label}">${loadingState()}</section>`);

        outlet.querySelector('#btnEdit').addEventListener('click', () => openEditAnimal({ animal, catalogs, onSaved: reloadAll }));
        outlet.querySelector('#btnPhoto').addEventListener('click', () => openPhotoForm({ animal, onSaved: reloadAll }));
        outlet.querySelector('#btnState').addEventListener('click', () => openChangeState({
            animal, estados: catalogs.estado, hasActiveStay, navigate, onSaved: reloadAll,
        }));

        const panel = outlet.querySelector('#tabPanel');
        // Solo se recarga el panel de la pestaña; si falla, el encabezado de la ficha sigue visible.
        const renderTab = async () => {
            render(panel, loadingState());
            try {
                await tab.render(panel, { animal, catalogs, stays, navigate, reloadAll, reloadTab: renderTab });
            } catch (err) {
                render(panel, errorState({ text: await reportError(err, `Pestaña ${tab.label}`), retryId: 'retryTab' }));
                panel.querySelector('#retryTab')?.addEventListener('click', renderTab);
            }
        };
        await renderTab();
    },
};

function notFound(backHref) {
    return html`<section class="card-panel">${emptyState({
        icon: 'bi-search',
        title: 'No se encontró el animal',
        text: 'El enlace no corresponde a un animal registrado o la sección no existe.',
        action: { label: 'Volver a Animales', icon: 'bi-arrow-left', href: backHref },
    })}</section>`;
}
