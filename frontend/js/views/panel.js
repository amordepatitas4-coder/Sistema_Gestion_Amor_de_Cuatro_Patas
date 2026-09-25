// ============================================================
// Panel principal (Etapa 2, Prompt Maestro §6 / Ficha §29.2).
//
// KPI exactos: Animales activos · En tratamiento · En hogar
// temporal · Adoptados · Rescatados este mes. Sin KPI
// "Disponible para adopción" y sin gráficos decorativos.
// Cada KPI es un enlace a Animales con su filtro en la URL.
// ============================================================

import { ESTADOS, findByName, loadCatalog } from '../api/catalogs.js';
import { loadKpis } from '../api/dashboard.js';
import { upcomingControls } from '../api/health.js';
import { listActiveStays } from '../api/homes.js';
import { reportError } from '../core/errors.js';
import { formatDate, formatLongDate, monthRangeISO, todayISO } from '../core/format.js';
import { buildHash } from '../core/router.js';
import { emptyState, errorState, html, loadingState, render } from '../core/ui.js';
import { animalName, ESTADO_ACTIVOS } from './animals/logic.js';

function greeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
}

/** Definición de KPI → filtro de Animales (función pura, testeable). */
export function kpiDefinitions(ids, month, monthLabel) {
    return [
        { key: 'activos', label: 'Animales activos', icon: 'bi-heart-pulse', tone: 'primary',
          hint: 'Registro activo, excluye Adoptados', query: { estado: ESTADO_ACTIVOS } },
        { key: 'enTratamiento', label: 'En tratamiento', icon: 'bi-bandaid', tone: 'warning',
          hint: 'Estado actual', query: ids.enTratamiento != null ? { estado: ids.enTratamiento } : null },
        { key: 'enHogar', label: 'En hogar temporal', icon: 'bi-house-heart', tone: 'teal',
          hint: 'Estado actual', query: ids.enHogar != null ? { estado: ids.enHogar } : null },
        { key: 'adoptados', label: 'Adoptados', icon: 'bi-house-check', tone: 'success',
          hint: 'Estado actual', query: ids.adoptado != null ? { estado: ids.adoptado } : null },
        { key: 'rescatadosMes', label: 'Rescatados este mes', icon: 'bi-calendar-heart', tone: 'brand',
          hint: monthLabel, query: { desde: month.from, hasta: month.to } },
    ];
}

export default {
    title: 'Panel principal',

    async render({ outlet, session }) {
        const nombre = session.state.profile?.nombre ?? '';
        const today = formatLongDate();
        const now = new Date();
        const month = monthRangeISO(now);
        const monthLabel = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(now);

        render(outlet, html`
            <header class="page-header welcome">
                <div>
                    <h1 class="page-title" tabindex="-1">${greeting(now)}, ${nombre}</h1>
                    <p class="page-subtitle">Resumen operativo de la Fundación</p>
                </div>
                <p class="welcome-date"><i class="bi bi-calendar3" aria-hidden="true"></i>
                    ${today.charAt(0).toUpperCase() + today.slice(1)}</p>
            </header>
            <section aria-label="Indicadores" id="kpiArea">${loadingState('Calculando indicadores…')}</section>
            <div class="row g-3 mt-1">
                <div class="col-12 col-xl-6"><section class="card-panel h-100" aria-labelledby="ctrlTitle">
                    <h2 class="block-title" id="ctrlTitle"><i class="bi bi-calendar-event" aria-hidden="true"></i> Próximos controles sanitarios</h2>
                    <div id="controlsArea">${loadingState()}</div>
                </section></div>
                <div class="col-12 col-xl-6"><section class="card-panel h-100" aria-labelledby="homesTitle">
                    <h2 class="block-title" id="homesTitle"><i class="bi bi-house-heart" aria-hidden="true"></i> Hogares actualmente ocupados</h2>
                    <div id="homesArea">${loadingState()}</div>
                </section></div>
            </div>`);

        // Las tres secciones cargan en paralelo y cada una maneja su propio error: si una falla, las demás se muestran igual.
        await Promise.all([
            renderKpis(outlet.querySelector('#kpiArea'), month, monthLabel),
            renderControls(outlet.querySelector('#controlsArea')),
            renderHomes(outlet.querySelector('#homesArea')),
        ]);
    },
};

async function renderKpis(area, month, monthLabel) {
    try {
        const estados = await loadCatalog('estado');
        const id = (nombre) => findByName(estados, nombre)?.id ?? null;
        // Los id de estado se obtienen por nombre desde el catálogo (no se escriben fijos en el código).
        const ids = { adoptado: id(ESTADOS.ADOPTADO), enTratamiento: id(ESTADOS.EN_TRATAMIENTO), enHogar: id(ESTADOS.EN_HOGAR) };
        const values = await loadKpis(ids, month);
        const defs = kpiDefinitions(ids, month, monthLabel);
        render(area, html`<div class="kpi-grid">
            ${defs.map((k) => {
                const value = values[k.key];
                const content = html`
                    <span class="kpi-top"><span class="kpi-label">${k.label}</span>
                        <span class="kpi-icon kpi-${k.tone}" aria-hidden="true"><i class="bi ${k.icon}"></i></span></span>
                    <span class="kpi-value">${value ?? '—'}</span>
                    <span class="kpi-hint">${k.hint}</span>`;
                return k.query
                    ? html`<a class="kpi-card" href="${buildHash('/animales', k.query)}"
                              aria-label="${k.label}: ${value ?? 'sin dato'}. Ver animales">${content}</a>`
                    : html`<div class="kpi-card is-disabled" title="Estado no encontrado en el catálogo">${content}</div>`;
            })}
        </div>`);
    } catch (err) {
        render(area, errorState({ title: 'No fue posible calcular los indicadores', text: await reportError(err, 'KPI') }));
    }
}

async function renderControls(area) {
    try {
        const rows = await upcomingControls(todayISO(), 8);
        render(area, rows.length === 0
            ? emptyState({ icon: 'bi-calendar-check', title: 'Sin controles próximos', text: 'Los próximos controles registrados en Salud aparecerán aquí.' })
            : html`<ul class="list-group list-group-flush">${rows.map((r) => html`
                <li class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2">
                    <div>
                        <a class="fw-semibold" href="#/animales/${r.animal.id_animal}/salud">${animalName(r.animal)}</a>
                        <div class="small text-secondary">${r.tipo?.nombre ?? 'Atención'} del ${formatDate(r.fecha)}</div>
                    </div>
                    <span class="badge badge-soft-warning text-nowrap">${formatDate(r.proximo_control)}</span>
                </li>`)}</ul>`);
    } catch (err) {
        render(area, errorState({ text: await reportError(err, 'Próximos controles') }));
    }
}

async function renderHomes(area) {
    try {
        const stays = await listActiveStays();
        const byHome = new Map();
        stays.forEach((s) => {
            const key = s.id_hogar;
            if (!byHome.has(key)) byHome.set(key, { hogar: s.hogar, animals: [] });
            byHome.get(key).animals.push(s);
        });
        const groups = [...byHome.values()].sort((a, b) => b.animals.length - a.animals.length);
        render(area, groups.length === 0
            ? emptyState({ icon: 'bi-house', title: 'No hay hogares ocupados', text: 'Cuando un animal ingrese a un hogar temporal aparecerá aquí.' })
            : html`<ul class="list-group list-group-flush">${groups.map((g) => html`
                <li class="list-group-item px-0">
                    <div class="d-flex justify-content-between align-items-center gap-2">
                        <a class="fw-semibold" href="#/hogares">${g.hogar?.nombre_responsable ?? 'Hogar'}</a>
                        <span class="badge badge-soft-info">${g.animals.length} animal${g.animals.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div class="small mt-1">${g.animals.map((s, i) => html`${i ? ', ' : ''}<a href="#/animales/${s.id_animal}/hogares">${animalName(s.animal ?? { id_animal: s.id_animal })}</a>`)}</div>
                </li>`)}</ul>`);
    } catch (err) {
        render(area, errorState({ text: await reportError(err, 'Hogares ocupados') }));
    }
}
