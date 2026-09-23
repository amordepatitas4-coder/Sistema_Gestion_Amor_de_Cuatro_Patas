// ============================================================
// Pestañas Resumen e Historial de la ficha del animal.
// ============================================================

import { getStateHistory } from '../../../api/animals.js';
import { stateBadge } from '../../../core/badges.js';
import { displayText, formatDate, formatDateTime } from '../../../core/format.js';
import { emptyState, html, render } from '../../../core/ui.js';

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
