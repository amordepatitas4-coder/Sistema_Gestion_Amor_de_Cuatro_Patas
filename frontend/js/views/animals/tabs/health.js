// ============================================================
// Pestaña Salud: historial sanitario del animal (ATENCION_SANITARIA).
//
// Registrar una atención NO cambia el estado del animal; el paso a
// "En tratamiento" es una decisión explícita (Cambiar estado).
// Regla del backend: próximo control >= fecha de la atención.
// ============================================================

import { selectable } from '../../../api/catalogs.js';
import { createAttention, listAttentions } from '../../../api/health.js';
import { bindForm } from '../../../core/forms.js';
import { displayText, emptyToNull, formatDate, todayISO } from '../../../core/format.js';
import { emptyState, html, openModal, options, render, toast } from '../../../core/ui.js';
import { controlStatus, validateAttention } from '../logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

export async function renderHealthTab(container, { animal, catalogs, reloadTab }) {
    const rows = await listAttentions(animal.id_animal);
    // Próximo control pendiente más cercano, destacado sobre el historial.
    const upcoming = rows
        .filter((r) => controlStatus(r.proximo_control) && controlStatus(r.proximo_control) !== 'pasado')
        .sort((a, b) => a.proximo_control.localeCompare(b.proximo_control))[0];

    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Historial sanitario</h2>
                <p class="small text-secondary mb-0">Registrar una atención no modifica el estado del animal.</p>
            </div>
            <button type="button" class="btn btn-primary" id="btnAttention"><i class="bi bi-plus-lg" aria-hidden="true"></i> Registrar atención</button>
        </div>
        ${upcoming ? html`
            <div class="alert alert-warning d-flex gap-2 align-items-center" role="status">
                <i class="bi bi-calendar-event" aria-hidden="true"></i>
                <div>Próximo control: <strong>${formatDate(upcoming.proximo_control)}</strong>
                    (${upcoming.tipo?.nombre ?? 'atención'} del ${formatDate(upcoming.fecha)}).</div>
            </div>` : ''}
        ${rows.length === 0
            ? emptyState({ icon: 'bi-clipboard2-pulse', title: 'Sin atenciones registradas', text: 'Registra vacunas, controles, tratamientos u otras atenciones veterinarias.' })
            : html`<ol class="timeline">
                ${rows.map((r) => {
                    const status = controlStatus(r.proximo_control);
                    return html`<li class="timeline-item">
                        <div class="timeline-date">${formatDate(r.fecha)}</div>
                        <div class="timeline-card">
                            <div class="d-flex flex-wrap justify-content-between gap-2">
                                <strong>${r.tipo?.nombre ?? 'Atención'}</strong>
                                ${status ? html`<span class="badge ${status === 'pasado' ? 'badge-soft-muted' : status === 'proximo' ? 'badge-soft-warning' : 'badge-soft-info'}">
                                    <i class="bi bi-calendar-check" aria-hidden="true"></i> Próximo control: ${formatDate(r.proximo_control)}</span>` : ''}
                            </div>
                            <dl class="mini-dl">
                                <div><dt>Veterinario/a</dt><dd>${displayText(r.veterinario)}</dd></div>
                                <div><dt>Tratamiento</dt><dd>${displayText(r.tratamiento)}</dd></div>
                                <div><dt>Medicamento</dt><dd>${displayText(r.medicamento)}</dd></div>
                                ${r.observaciones ? html`<div><dt>Observaciones</dt><dd>${r.observaciones}</dd></div>` : ''}
                            </dl>
                        </div>
                    </li>`;
                })}
            </ol>`}`);

    container.querySelector('#btnAttention').addEventListener('click', () => openAttentionForm({ animal, catalogs, onSaved: reloadTab }));
}

function openAttentionForm({ animal, catalogs, onSaved }) {
    const tipos = selectable(catalogs.tipo_atencion_sanitaria).map((t) => ({ value: t.id, label: t.nombre }));
    const modal = openModal({
        title: 'Registrar atención sanitaria',
        size: 'modal-lg',
        body: html`
            <form id="attentionForm" novalidate>
                <div data-form-error hidden></div>
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label" for="aTipo">Tipo de atención ${req}</label>
                        <select class="form-select" id="aTipo" name="tipo" required>${options(tipos, '')}</select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label" for="aFecha">Fecha ${req}</label>
                        <input class="form-control" type="date" id="aFecha" name="fecha" required value="${todayISO()}">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label" for="aProx">Próximo control</label>
                        <input class="form-control" type="date" id="aProx" name="proximo_control">
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="aVet">Veterinario/a</label>
                        <input class="form-control" id="aVet" name="veterinario" maxlength="150">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="aTrat">Tratamiento</label>
                        <textarea class="form-control" id="aTrat" name="tratamiento" rows="2"></textarea>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="aMed">Medicamento</label>
                        <textarea class="form-control" id="aMed" name="medicamento" rows="2"></textarea>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="aObs">Observaciones</label>
                        <textarea class="form-control" id="aObs" name="observaciones" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Registrar atención</button>
                </div>
            </form>`,
    });
    bindForm(modal.body.querySelector('#attentionForm'), {
        context: 'Atención sanitaria',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            id_animal: animal.id_animal,
            id_tipo_atencion: Number(fd.get('tipo')) || null,
            fecha: emptyToNull(fd.get('fecha')),
            veterinario: emptyToNull(fd.get('veterinario')),
            tratamiento: emptyToNull(fd.get('tratamiento')),
            medicamento: emptyToNull(fd.get('medicamento')),
            proximo_control: emptyToNull(fd.get('proximo_control')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: validateAttention,
        submit: async (v) => {
            // Mientras se guarda, el modal no se puede cerrar (evita perder la respuesta o reenviar).
            modal.setBusy(true);
            try { await createAttention(v); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Atención registrada.', 'success');
            await onSaved?.();
        },
    });
}
