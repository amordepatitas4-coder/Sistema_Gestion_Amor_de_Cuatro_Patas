// ============================================================
// Pestañas Resumen e Historial, y pestañas de etapas posteriores
// (Adopción, Gastos, Archivos, Difusión) en modo consulta.
// ============================================================

import { createDriveFolder, getStateHistory } from '../../../api/animals.js';
import { listAdoptionsByAnimal, listExpensesByAnimal, listFilesByAnimal } from '../../../api/related.js';
import { stateBadge } from '../../../core/badges.js';
import { reportError } from '../../../core/errors.js';
import { displayText, formatCLP, formatDate, formatDateTime } from '../../../core/format.js';
import { emptyState, html, render, setButtonBusy, toast } from '../../../core/ui.js';

const block = (title, value) => html`<div class="info-block"><dt>${title}</dt><dd class="pre-line">${displayText(value)}</dd></div>`;

// ------------------------------------------------------------
// Resumen
// ------------------------------------------------------------
export async function renderSummaryTab(container, { animal }) {
    render(container, html`
        <h2 class="visually-hidden">Resumen</h2>
        <dl class="info-grid">
            ${block('Especie', animal.especie?.nombre)}
            ${block('Sexo', animal.sexo)}
            ${block('Rango etario', animal.rango?.nombre)}
            ${block('Tamaño', animal.tamaño)}
            ${block('Fecha de nacimiento', animal.fecha_nacimiento ? formatDate(animal.fecha_nacimiento) : null)}
            ${block('Fecha de rescate', formatDate(animal.fecha_rescate))}
            ${block('Lugar de rescate', animal.lugar_rescate)}
            ${block('Microchip', animal.microchip ?? 'No registrado')}
            ${block('Registro Nacional', animal.estado_registro_nacional ?? 'Sin información')}
            ${block('Fecha de registro en el sistema', formatDateTime(animal.fecha_registro))}
        </dl>
        <dl class="info-text">
            ${block('Historia del rescate', animal.historia_rescate)}
            ${block('Características', animal.caracteristicas)}
            ${block('Personalidad', animal.personalidad)}
            ${block('Observaciones', animal.observaciones)}
        </dl>`);
}

// ------------------------------------------------------------
// Historial de estados (HISTORIAL_ESTADO)
// ------------------------------------------------------------
export async function renderHistoryTab(container, { animal }) {
    const rows = await getStateHistory(animal.id_animal);
    render(container, html`
        <div class="tab-toolbar"><div>
            <h2 class="tab-title">Historial de estados</h2>
            <p class="small text-secondary mb-0">Cada cambio de estado se conserva; el registro abierto es el estado actual.</p>
        </div></div>
        ${rows.length === 0
            ? emptyState({ icon: 'bi-clock-history', title: 'Sin historial registrado' })
            : html`<ol class="timeline">${rows.map((r) => html`
                <li class="timeline-item ${r.fecha_fin ? '' : 'is-current'}">
                    <div class="timeline-date">${formatDateTime(r.fecha_inicio)}</div>
                    <div class="timeline-card">
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            ${stateBadge(r.estado?.nombre_estado)}
                            ${r.fecha_fin ? html`<span class="small text-secondary">hasta ${formatDateTime(r.fecha_fin)}</span>`
                                : html`<span class="badge badge-soft-success">Estado actual</span>`}
                        </div>
                        ${r.motivo_cambio ? html`<p class="mb-0 mt-2"><strong>Motivo:</strong> ${r.motivo_cambio}</p>` : ''}
                        ${r.observaciones ? html`<p class="mb-0 mt-1 pre-line small text-secondary">${r.observaciones}</p>` : ''}
                    </div>
                </li>`)}</ol>`}`);
}

// ------------------------------------------------------------
// Adopción (consulta; proceso en Etapa 5)
// ------------------------------------------------------------
export async function renderAdoptionTab(container, { animal }) {
    const rows = await listAdoptionsByAnimal(animal.id_animal);
    render(container, html`
        <div class="tab-toolbar"><div>
            <h2 class="tab-title">Adopción</h2>
            <p class="small text-secondary mb-0">Registro de adopciones, seguimientos y devoluciones: disponible en la Etapa 5.</p>
        </div></div>
        ${rows.length === 0
            ? emptyState({ icon: 'bi-house-check', title: 'Sin adopciones registradas', text: 'Las adopciones de este animal aparecerán aquí.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Adoptante</th><th scope="col">Estado</th><th scope="col">Finalización</th></tr></thead>
                <tbody>${rows.map((r) => html`<tr>
                    <td class="text-nowrap">${formatDate(r.fecha_adopcion)}</td>
                    <td>${r.adoptante?.nombre ?? '—'}</td>
                    <td>${r.estado?.nombre ?? '—'}</td>
                    <td>${r.fecha_finalizacion ? formatDate(r.fecha_finalizacion) : '—'}</td>
                </tr>`)}</tbody></table></div>`}`);
}

// ------------------------------------------------------------
// Gastos (consulta; registro en Etapa 6)
// ------------------------------------------------------------
export async function renderExpensesTab(container, { animal }) {
    const rows = await listExpensesByAnimal(animal.id_animal);
    const total = rows.reduce((sum, r) => sum + Number(r.monto_asignado || 0), 0);
    render(container, html`
        <div class="tab-toolbar"><div>
            <h2 class="tab-title">Gastos asignados</h2>
            <p class="small text-secondary mb-0">Registro y asignación de gastos: disponible en la Etapa 6.</p>
        </div></div>
        ${rows.length === 0
            ? emptyState({ icon: 'bi-cash-coin', title: 'Sin gastos asignados', text: 'Los gastos asignados a este animal aparecerán aquí.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Categoría</th><th scope="col">Descripción</th>
                    <th scope="col" class="text-end">Asignado</th><th scope="col" class="text-end">Total del gasto</th></tr></thead>
                <tbody>${rows.map((r) => html`<tr>
                    <td class="text-nowrap">${formatDate(r.gasto?.fecha)}</td>
                    <td>${r.gasto?.categoria?.nombre ?? '—'}</td>
                    <td>${r.gasto?.descripcion ?? '—'}</td>
                    <td class="text-end">${formatCLP(r.monto_asignado)}</td>
                    <td class="text-end text-secondary">${formatCLP(r.gasto?.monto)}</td>
                </tr>`)}</tbody>
                <tfoot><tr><th scope="row" colspan="3">Total asignado al animal</th><td class="text-end fw-bold">${formatCLP(total)}</td><td></td></tr></tfoot>
            </table></div>`}`);
}

// ------------------------------------------------------------
// Archivos: estado de la carpeta Drive (con reintento, RN-23)
// y listado en consulta. Carga/apertura en Etapa 7.
// ------------------------------------------------------------
export async function renderFilesTab(container, { animal, reloadAll }) {
    const rows = await listFilesByAnimal(animal.id_animal);
    const hasFolder = Boolean(animal.id_carpeta_drive);
    render(container, html`
        <div class="tab-toolbar"><div>
            <h2 class="tab-title">Archivos</h2>
            <p class="small text-secondary mb-0">Carga y apertura de documentos en Google Drive: disponible en la Etapa 7.</p>
        </div></div>
        ${hasFolder
            ? html`<div class="alert alert-success d-flex gap-2 align-items-center" role="status">
                <i class="bi bi-folder-check" aria-hidden="true"></i><div>La carpeta del animal en Google Drive está creada.</div></div>`
            : html`<div class="alert alert-warning d-flex flex-wrap gap-2 align-items-center justify-content-between" role="alert">
                <div><i class="bi bi-folder-x" aria-hidden="true"></i> La carpeta del animal en Google Drive aún no se ha creado.</div>
                <button type="button" class="btn btn-sm btn-warning" id="retryFolder"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Crear carpeta ahora</button>
            </div>`}
        ${rows.length === 0
            ? emptyState({ icon: 'bi-folder2-open', title: 'Sin archivos asociados', text: 'Los documentos relacionados con este animal aparecerán aquí.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Nombre</th><th scope="col">Categoría</th><th scope="col">Fecha documento</th><th scope="col">Descripción</th></tr></thead>
                <tbody>${rows.map((r) => html`<tr>
                    <td>${r.archivo?.nombre_original ?? r.archivo?.nombre_archivo ?? '—'}</td>
                    <td>${r.archivo?.categoria?.nombre ?? '—'}</td>
                    <td>${formatDate(r.archivo?.fecha_documento)}</td>
                    <td>${displayText(r.archivo?.descripcion)}</td>
                </tr>`)}</tbody></table></div>`}`);

    const retry = container.querySelector('#retryFolder');
    retry?.addEventListener('click', async () => {
        const restore = setButtonBusy(retry, 'Creando carpeta…');
        try {
            await createDriveFolder(animal.id_animal);
            toast('Carpeta de Google Drive creada.', 'success');
            await reloadAll();
        } catch (err) {
            restore();
            toast(await reportError(err, 'Carpeta Drive'), 'error');
        }
    });
}

// ------------------------------------------------------------
// Difusión (Etapa 7)
// ------------------------------------------------------------
export async function renderDiffusionTab(container) {
    render(container, emptyState({
        icon: 'bi-megaphone',
        title: 'Difusión en preparación',
        text: 'El texto base y el prompt editable para difusión se habilitarán en la Etapa 7.',
    }));
}
