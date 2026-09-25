// ============================================================
// Módulo Informes.
//
// - Tarjetas de tipo de informe: la seleccionada queda marcada de
//   forma persistente (fondo + borde + aria-pressed; REG-08,
//   PA-INF-01/02). No se repite un título "Informe seleccionado".
// - Filtros propios de cada informe (PA-INF-04); viajan en la URL:
//   #/informes?tipo=gastos&desde=…&categoria=…
// - Resultado: resumen calculado desde las filas, tabla, exportación
//   CSV para Excel e impresión / Guardar PDF del navegador.
// ============================================================

import { listAnimals } from '../../api/animals.js';
import { loadCatalogs } from '../../api/catalogs.js';
import { listHomes } from '../../api/homes.js';
import {
    fetchAdoptionsReport, fetchAnimalsReport, fetchAttentionsReport, fetchExpensesReport,
    fetchStaysReport, fetchSterilizationsReport,
} from '../../api/reports.js';
import { listProfessionals, listProjects } from '../../api/sterilization.js';
import { reportError } from '../../core/errors.js';
import { csvFileName, downloadCSV, toCSV } from '../../core/export.js';
import { showFormErrors, clearFormErrors } from '../../core/forms.js';
import { displayText, formatCLP, formatDate, formatLongDate, todayISO } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, options, pageHeader, render, toast } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import {
    ESTERILIZACION, REGISTRO_NACIONAL, REPORTS, SEXOS, SITUACIONES_PERMANENCIA,
    describeFilters, findReport, readReportFilters, validateReportFilters,
} from './definitions.js';

// Cada tipo de informe tiene su consulta en api/reports.js; la definición (filtros, columnas) está en definitions.js.
const FETCHERS = {
    animales: fetchAnimalsReport,
    adopciones: fetchAdoptionsReport,
    atenciones: fetchAttentionsReport,
    hogares: fetchStaysReport,
    gastos: fetchExpensesReport,
    esterilizaciones: fetchSterilizationsReport,
};

const CATALOG_SOURCES = ['especie', 'estado', 'rango_etario', 'tipo_atencion_sanitaria', 'estado_adopcion', 'categoria_gasto'];

/** Carga solo las fuentes de opciones que usa el informe. */
async function loadSources(report) {
    const needed = new Set(report.filters.filter((f) => f.type === 'select').map((f) => f.source));
    const catalogs = await loadCatalogs(CATALOG_SOURCES.filter((s) => needed.has(s)));
    const out = {};
    Object.entries(catalogs).forEach(([k, list]) => { out[k] = list.map((r) => ({ value: r.id, label: r.nombre })); });
    const tasks = [];
    if (needed.has('animal')) tasks.push(listAnimals().then((l) => { out.animal = l.map((a) => ({ value: a.id_animal, label: animalName(a) })).sort((a, b) => a.label.localeCompare(b.label, 'es')); }));
    if (needed.has('hogar')) tasks.push(listHomes().then((l) => { out.hogar = l.map((h) => ({ value: h.id_hogar, label: h.nombre_responsable })); }));
    if (needed.has('proyecto')) tasks.push(listProjects().then((l) => { out.proyecto = l.map((p) => ({ value: p.id_proyecto, label: p.nombre })); }));
    if (needed.has('profesional')) tasks.push(listProfessionals().then((l) => { out.profesional = l.map((p) => ({ value: p.id_profesional, label: p.nombre })); }));
    await Promise.all(tasks);
    out.sexo = SEXOS;
    out.registro = REGISTRO_NACIONAL;
    out.situacion = SITUACIONES_PERMANENCIA;
    out.esterilizacion = ESTERILIZACION;
    return out;
}

/** Texto de la opción vacía concordante con el filtro ("Todas las categorías", etc.). */
const ALL_LABEL = { especie: 'Todas', categoria: 'Todas', situacion: 'Todas' };

const optionLabel = (list = [], value) => {
    const item = list.find((o) => String(typeof o === 'object' ? o.value : o) === String(value));
    return item ? (typeof item === 'object' ? item.label : item) : value;
};

function cellDisplay(col, row) {
    const v = col.value(row);
    if (col.type === 'date') return formatDate(v);
    if (col.type === 'money') return formatCLP(v);
    if (col.type === 'number') return v === null || v === undefined ? '—' : String(v);
    return displayText(v);
}

export default {
    title: 'Informes',

    async render({ outlet, query, navigate }) {
        const report = findReport(query.get('tipo') ?? '');

        render(outlet, html`
            ${pageHeader({ title: 'Informes', subtitle: 'Consultas sobre la información registrada, con filtros definidos por ti' })}
            <section class="report-cards no-print" aria-label="Tipo de informe">
                ${REPORTS.map((r) => html`
                    <button type="button" class="report-card ${r === report ? 'is-selected' : ''}" data-report="${r.key}"
                            aria-pressed="${r === report ? 'true' : 'false'}">
                        <span class="report-card-icon" aria-hidden="true"><i class="bi ${r.icon}"></i></span>
                        <span class="report-card-text"><strong>${r.label}</strong><span><span class="visually-hidden">: </span>${r.description}</span></span>
                        ${r === report ? html`<i class="bi bi-check-circle-fill report-card-check" aria-hidden="true"></i>` : ''}
                    </button>`)}
            </section>
            <div id="reportBody"></div>`);

        outlet.querySelectorAll('[data-report]').forEach((btn) => btn.addEventListener('click', () => {
            if (report?.key === btn.dataset.report) return;
            navigate('/informes', { tipo: btn.dataset.report });
        }));

        const body = outlet.querySelector('#reportBody');
        if (!report) {
            render(body, html`<section class="card-panel">${emptyState({
                icon: 'bi-bar-chart-line', title: 'Selecciona un tipo de informe',
                text: 'Luego podrás ajustar los filtros, exportar a Excel o imprimir el resultado.',
            })}</section>`);
            return;
        }

        const f = readReportFilters(report, query);
        render(body, loadingState('Preparando filtros…'));
        let sources;
        try {
            sources = await loadSources(report);
        } catch (err) {
            render(body, errorState({ text: await reportError(err, 'Filtros de informe'), retryId: 'retrySources' }));
            body.querySelector('#retrySources')?.addEventListener('click', () => navigate('/informes', { tipo: report.key, ...f }, { replace: true }));
            return;
        }

        const labels = Object.fromEntries(report.filters.filter((flt) => f[flt.key]).map((flt) => [flt.key,
            flt.type === 'date' ? formatDate(f[flt.key]) : optionLabel(sources[flt.source], f[flt.key])]));
        const filtersText = describeFilters(report, f, labels);

        render(body, html`
            <section class="card-panel mb-3 no-print">
                <form id="reportFilters" class="row g-2 align-items-end" novalidate>
                    <div data-form-error hidden class="col-12"></div>
                    ${report.filters.map((flt) => html`
                        <div class="col-6 col-md-4 col-xl-3">
                            <label class="form-label small" for="rf-${flt.key}">${flt.label}</label>
                            ${flt.type === 'date'
                                ? html`<input class="form-control" type="date" id="rf-${flt.key}" name="${flt.key}" value="${f[flt.key]}">`
                                : html`<select class="form-select" id="rf-${flt.key}" name="${flt.key}">${options(sources[flt.source] ?? [], f[flt.key], { placeholder: ALL_LABEL[flt.key] ?? 'Todos' })}</select>`}
                        </div>`)}
                    <div class="col-12 d-flex flex-wrap gap-2 mt-3">
                        <button type="submit" class="btn btn-primary"><i class="bi bi-funnel" aria-hidden="true"></i> Generar informe</button>
                        <button type="button" class="btn btn-outline-primary" id="btnClearReport"><i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros</button>
                    </div>
                </form>
            </section>
            <div id="reportResult">${loadingState('Generando informe…')}</div>`);

        const form = body.querySelector('#reportFilters');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            clearFormErrors(form);
            const values = Object.fromEntries(report.filters.map((flt) => [flt.key, String(form.elements[flt.key].value ?? '').trim()]));
            const errors = validateReportFilters(values);
            if (Object.keys(errors).length) { showFormErrors(form, errors); return; }
            const q = { tipo: report.key, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) };
            navigate('/informes', q, { replace: true });
        });
        body.querySelector('#btnClearReport').addEventListener('click', () => navigate('/informes', { tipo: report.key }, { replace: true }));

        const result = body.querySelector('#reportResult');
        // Los filtros también se validan al leerlos de la URL (alguien podría editar el enlace a mano).
        const invalid = validateReportFilters(f);
        if (Object.keys(invalid).length) {
            render(result, errorState({ title: 'Revisa los filtros', text: Object.values(invalid).join(' ') }));
            return;
        }

        let rows;
        try {
            // Dos pasos: la consulta filtra en Supabase y clientFilter aplica los filtros sobre datos relacionados.
            rows = report.clientFilter(await FETCHERS[report.key](f), f);
        } catch (err) {
            render(result, errorState({ text: await reportError(err, `Informe ${report.label}`), retryId: 'retryReport' }));
            result.querySelector('#retryReport')?.addEventListener('click', () => navigate('/informes', { tipo: report.key, ...f }, { replace: true }));
            return;
        }

        const summary = report.summary(rows, f);
        const generatedAt = formatLongDate(new Date());
        render(result, html`
            <section class="card-panel report-result">
                <div class="print-only mb-3">
                    <h2 class="h4 mb-1">Informe de ${report.label.toLowerCase()} — Fundación Amor de Cuatro Patas</h2>
                    <p class="small mb-0">Generado el ${generatedAt}</p>
                </div>
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                    <p class="small text-secondary mb-0 report-filters-text"><i class="bi bi-funnel" aria-hidden="true"></i> ${filtersText}</p>
                    <div class="d-flex flex-wrap gap-2 no-print">
                        <button type="button" class="btn btn-sm btn-outline-primary" id="btnExportReport" ${rows.length ? '' : 'disabled'}>
                            <i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i> Exportar Excel (CSV)</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="btnPrintReport" ${rows.length ? '' : 'disabled'}>
                            <i class="bi bi-printer" aria-hidden="true"></i> Imprimir / Guardar PDF</button>
                    </div>
                </div>
                ${rows.length === 0
                    ? emptyState({ icon: 'bi-funnel', variant: 'noresults', title: 'No hay registros que coincidan con los filtros',
                        text: 'Prueba con otros criterios o limpia los filtros.' })
                    : html`
                    <div class="expense-summary report-summary mb-3" role="status">
                        ${summary.map((s) => html`<div class="${s.main ? 'is-main' : ''}"><span>${s.label}</span>
                            <strong>${s.kind === 'money' ? formatCLP(s.value) : s.value}</strong></div>`)}
                    </div>
                    <div class="table-responsive"><table class="table table-sm table-striped align-middle mb-0 report-table">
                        <thead><tr>${report.columns.map((c) => html`<th scope="col" class="${c.type === 'money' || c.type === 'number' ? 'text-end' : ''}">${c.label}</th>`)}</tr></thead>
                        <tbody>${rows.map((r) => html`<tr>${report.columns.map((c) => html`
                            <td class="${c.type === 'money' || c.type === 'number' ? 'text-end text-nowrap' : ''}${c.type === 'date' ? 'text-nowrap' : ''}">${cellDisplay(c, r)}</td>`)}</tr>`)}</tbody>
                    </table></div>
                    <p class="small text-secondary mt-2 mb-0">${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}.</p>`}
            </section>`);

        result.querySelector('#btnExportReport')?.addEventListener('click', () => {
            downloadCSV(csvFileName(`informe ${report.label}`, todayISO()), toCSV(report.columns, rows));
            toast(`Informe exportado (${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}).`, 'success');
        });
        // Impresión nativa del navegador; los estilos @media print ocultan menú y botones.
        result.querySelector('#btnPrintReport')?.addEventListener('click', () => window.print());
    },
};
