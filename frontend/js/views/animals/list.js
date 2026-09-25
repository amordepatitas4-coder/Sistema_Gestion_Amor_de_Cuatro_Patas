// ============================================================
// Módulo Animales: listado en tarjetas o lista, búsqueda y filtros.
//
// - Los filtros viven en la URL (#/animales?estado=…) para que un
//   filtro aplicado desde el Dashboard quede visible (REG-02).
// - Cada tarjeta/fila es un enlace a la ficha: funciona desde el
//   primer render y con teclado (REG-01, PA-ACC-01).
// ============================================================

import { listAnimals, signedPhotoUrls } from '../../api/animals.js';
import { ESTADOS, findByName, loadCatalogs } from '../../api/catalogs.js';
import { availabilityIndicator, stateBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, options, pageHeader, render, collapsibleFilters } from '../../core/ui.js';
import { openRegisterAnimal } from './form.js';
import {
    ESTADO_ACTIVOS, SEXOS, animalName, applyFilters, filtersToQuery, hasActiveFilters, readFilters,
} from './logic.js';

/** Última consulta del listado, para volver desde la ficha con los mismos filtros. */
// Variable de módulo: sobrevive mientras la app está abierta y permite volver al listado con los mismos filtros.
export let lastListQuery = {};

export default {
    title: 'Animales',

    async render({ outlet, query, navigate }) {
        const filters = readFilters(query);
        lastListQuery = filtersToQuery(filters);

        render(outlet, html`
            ${pageHeader({
                title: 'Animales',
                subtitle: 'Registro central de animales rescatados',
                actions: html`<button type="button" class="btn btn-primary" id="btnNewAnimal">
                    <i class="bi bi-plus-lg" aria-hidden="true"></i> Registrar animal</button>`,
            })}
            <div id="animalsBody">${loadingState('Cargando animales…')}</div>`);

        let catalogs;
        let animals;
        try {
            [catalogs, animals] = await Promise.all([
                loadCatalogs(['estado', 'especie', 'rango_etario']),
                listAnimals(),
            ]);
        } catch (err) {
            const message = await reportError(err, 'Listado de animales');
            render(outlet.querySelector('#animalsBody'), errorState({ text: message, retryId: 'retryAnimals' }));
            outlet.querySelector('#retryAnimals')?.addEventListener('click', () => navigate('/animales', lastListQuery, { replace: true }));
            outlet.querySelector('#btnNewAnimal').disabled = true;
            return;
        }

        outlet.querySelector('#btnNewAnimal').addEventListener('click', () => openRegisterAnimal({
            catalogs,
            navigate,
            onCreated: () => navigate('/animales', lastListQuery, { replace: true }),
        }));

        const adoptado = findByName(catalogs.estado, ESTADOS.ADOPTADO);
        // Una sola solicitud firma las URLs de todas las fotos del listado.
        const photoUrls = await signedPhotoUrls(animals.map((a) => a.foto_principal_path));
        const body = outlet.querySelector('#animalsBody');

        render(body, html`
            <section class="card-panel mb-3" aria-label="Filtros">
                <form class="row g-2 align-items-end" id="animalFilters" role="search">
                    <div class="col-12 col-lg-4">
                        <label class="form-label small" for="flQ">Buscar por nombre o microchip</label>
                        <div class="input-group">
                            <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                            <input class="form-control" id="flQ" name="q" type="search" value="${filters.q}" autocomplete="off">
                        </div>
                    </div>
                    <div class="col-6 col-lg-3 filter-extra">
                        <label class="form-label small" for="flEstado">Estado</label>
                        <select class="form-select" id="flEstado" name="estado">
                            ${options([
                                { value: ESTADO_ACTIVOS, label: 'Activos (excluye Adoptados)' },
                                ...catalogs.estado.map((e) => ({ value: e.id, label: e.nombre })),
                            ], filters.estado, { placeholder: 'Todos' })}
                        </select>
                    </div>
                    <div class="col-6 col-lg-2 filter-extra">
                        <label class="form-label small" for="flEspecie">Especie</label>
                        <select class="form-select" id="flEspecie" name="especie">
                            ${options(catalogs.especie.map((e) => ({ value: e.id, label: e.nombre })), filters.especie, { placeholder: 'Todas' })}
                        </select>
                    </div>
                    <div class="col-6 col-lg-3 filter-extra">
                        <label class="form-label small" for="flSexo">Sexo</label>
                        <select class="form-select" id="flSexo" name="sexo">${options(SEXOS, filters.sexo, { placeholder: 'Todos' })}</select>
                    </div>
                    <div class="col-6 col-lg-3 filter-extra">
                        <label class="form-label small" for="flDesde">Rescatado desde</label>
                        <input class="form-control" type="date" id="flDesde" name="desde" value="${filters.desde}">
                    </div>
                    <div class="col-6 col-lg-3 filter-extra">
                        <label class="form-label small" for="flHasta">Rescatado hasta</label>
                        <input class="form-control" type="date" id="flHasta" name="hasta" value="${filters.hasta}">
                    </div>
                </form>
            </section>
            <div class="results-bar">
                <div id="filterSummary" class="flex-grow-1"></div>
                <div class="btn-group" role="group" aria-label="Tipo de vista">
                    <button type="button" class="btn btn-sm btn-outline-primary ${filters.modo === 'tarjetas' ? 'active' : ''}"
                            data-modo="tarjetas" aria-pressed="${filters.modo === 'tarjetas'}">
                        <i class="bi bi-grid-3x2-gap" aria-hidden="true"></i> Tarjetas</button>
                    <button type="button" class="btn btn-sm btn-outline-primary ${filters.modo === 'lista' ? 'active' : ''}"
                            data-modo="lista" aria-pressed="${filters.modo === 'lista'}">
                        <i class="bi bi-list-ul" aria-hidden="true"></i> Lista</button>
                </div>
            </div>
            <div id="animalResults" aria-live="polite"></div>`);

        const form = body.querySelector('#animalFilters');
        collapsibleFilters(form);
        const summary = body.querySelector('#filterSummary');
        const results = body.querySelector('#animalResults');

        // Redibuja solo los resultados con los datos ya cargados (sin nuevas consultas a Supabase).
        const draw = () => {
            const filtered = applyFilters(animals, filters, { adoptadoId: adoptado?.id ?? null });
            render(summary, filterSummary(filters, filtered.length, animals.length, catalogs));
            summary.querySelector('#clearFilters')?.addEventListener('click', () => {
                navigate('/animales', filters.modo === 'lista' ? { modo: 'lista' } : {}, { replace: true });
            });

            if (animals.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({
                    icon: 'bi-heart',
                    title: 'Aún no hay animales registrados',
                    text: 'Registra el primer animal rescatado para comenzar su ficha y trazabilidad.',
                    action: { label: 'Registrar primer animal', icon: 'bi-plus-lg', id: 'btnFirstAnimal' },
                })}</section>`);
                results.querySelector('#btnFirstAnimal').addEventListener('click', () => outlet.querySelector('#btnNewAnimal').click());
                return;
            }
            if (filtered.length === 0) {
                render(results, html`<section class="card-panel">${emptyState({
                    icon: 'bi-funnel', variant: 'noresults',
                    title: 'No hay animales que coincidan con los filtros',
                    text: 'Prueba con otros criterios o limpia los filtros.',
                })}</section>`);
                return;
            }
            render(results, filters.modo === 'lista' ? listView(filtered, photoUrls) : cardView(filtered, photoUrls));
        };

        // Actualiza URL (sin agregar historial) y redibuja sin recargar datos.
        const syncUrl = () => {
            lastListQuery = filtersToQuery(filters);
            const hash = `#/animales${new URLSearchParams(lastListQuery).toString() ? `?${new URLSearchParams(lastListQuery)}` : ''}`;
            history.replaceState(null, '', hash);
        };

        const onChange = (event) => {
            const { name, value } = event.target;
            if (!name) return;
            filters[name] = value.trim();
            syncUrl();
            draw();
        };
        form.addEventListener('input', (e) => { if (e.target.name === 'q') onChange(e); });
        form.addEventListener('change', onChange);
        form.addEventListener('submit', (e) => e.preventDefault());
        body.querySelectorAll('[data-modo]').forEach((btn) => btn.addEventListener('click', () => {
            filters.modo = btn.dataset.modo;
            body.querySelectorAll('[data-modo]').forEach((b) => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            syncUrl();
            draw();
        }));

        draw();
    },
};

function filterSummary(filters, shown, total, catalogs) {
    if (!hasActiveFilters(filters)) {
        return html`<p class="small text-secondary mb-2">${total} animal${total === 1 ? '' : 'es'} con registro activo.</p>`;
    }
    const chips = [];
    if (filters.q) chips.push(`Búsqueda: “${filters.q}”`);
    if (filters.estado === ESTADO_ACTIVOS) chips.push('Estado: Activos (excluye Adoptados)');
    else if (filters.estado) chips.push(`Estado: ${catalogs.estado.find((e) => String(e.id) === filters.estado)?.nombre ?? '—'}`);
    if (filters.especie) chips.push(`Especie: ${catalogs.especie.find((e) => String(e.id) === filters.especie)?.nombre ?? '—'}`);
    if (filters.sexo) chips.push(`Sexo: ${filters.sexo}`);
    if (filters.desde) chips.push(`Rescatado desde: ${formatDate(filters.desde)}`);
    if (filters.hasta) chips.push(`Rescatado hasta: ${formatDate(filters.hasta)}`);
    return html`
        <div class="filter-summary" role="status">
            <span class="fw-semibold"><i class="bi bi-funnel-fill" aria-hidden="true"></i> Filtros aplicados:</span>
            ${chips.map((c) => html`<span class="filter-chip">${c}</span>`)}
            <span class="text-secondary small">${shown} de ${total}</span>
            <button type="button" class="btn btn-sm btn-link" id="clearFilters"><i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros</button>
        </div>`;
}

function photo(a, urls, cls) {
    const url = urls.get(a.foto_principal_path);
    return url
        ? html`<img class="${cls}" src="${url}" alt="" loading="lazy">`
        : html`<span class="${cls} photo-placeholder" aria-hidden="true"><i class="bi bi-heart"></i></span>`;
}

function cardView(list, urls) {
    return html`<div class="animal-grid">
        ${list.map((a) => html`
            <a class="animal-card" href="#/animales/${a.id_animal}" aria-label="Ver ficha de ${animalName(a)}">
                ${photo(a, urls, 'animal-card-photo')}
                <span class="animal-card-body">
                    <span class="animal-card-name">${animalName(a)}</span>
                    <span class="animal-card-meta">${[a.especie?.nombre, a.sexo, a.rango?.nombre].filter(Boolean).join(' · ')}</span>
                    <span class="animal-card-badges">${stateBadge(a.estado?.nombre_estado)}${availabilityIndicator(a.estado?.nombre_estado)}</span>
                    ${a.microchip ? html`<span class="animal-card-chip"><i class="bi bi-upc-scan" aria-hidden="true"></i> ${a.microchip}</span>` : ''}
                </span>
            </a>`)}
    </div>`;
}

function listView(list, urls) {
    return html`<div class="card-panel p-0"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0 animal-table">
            <thead><tr>
                <th scope="col"><span class="visually-hidden">Foto</span></th>
                <th scope="col">Nombre</th><th scope="col">Especie</th><th scope="col">Sexo</th>
                <th scope="col">Estado</th><th scope="col">Microchip</th><th scope="col">Rescate</th>
                <th scope="col"><span class="visually-hidden">Acción</span></th>
            </tr></thead>
            <tbody>
                ${list.map((a) => html`<tr class="row-link">
                    <td>${photo(a, urls, 'animal-thumb')}</td>
                    <td class="fw-semibold">${animalName(a)}</td>
                    <td>${a.especie?.nombre ?? '—'}</td>
                    <td>${a.sexo}</td>
                    <td>${stateBadge(a.estado?.nombre_estado)} ${availabilityIndicator(a.estado?.nombre_estado)}</td>
                    <td>${a.microchip ?? '—'}</td>
                    <td class="text-nowrap">${formatDate(a.fecha_rescate)}</td>
                    <td class="text-end"><a class="btn btn-sm btn-outline-primary stretched-link text-nowrap" href="#/animales/${a.id_animal}">
                        Ver ficha <span class="visually-hidden">de ${animalName(a)}</span></a></td>
                </tr>`)}
            </tbody>
        </table>
    </div></div>`;
}
