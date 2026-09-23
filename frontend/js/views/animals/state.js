// ============================================================
// Cambio manual de estado (RPC cambiar_estado_animal).
//
// - No se ofrecen los estados reservados a procesos
//   (En hogar temporal, Adoptado) ni el estado actual.
// - Guarda de interfaz: si el animal está En hogar temporal o
//   Adoptado, la salida de esa situación corresponde a su proceso
//   (Finalizar permanencia / Registrar devolución). La RPC no lo
//   impide por sí sola; ver informe de Etapa 0 (hueco de proceso).
// ============================================================

import { changeState } from '../../api/animals.js';
import { bindForm } from '../../core/forms.js';
import { emptyToNull } from '../../core/format.js';
import { html, openModal, options, toast } from '../../core/ui.js';
import { manualChangeBlock, manualStateOptions } from './logic.js';

export function openChangeState({ animal, estados, hasActiveStay, navigate, onSaved }) {
    const block = manualChangeBlock(animal.estado?.nombre_estado, hasActiveStay);
    if (block) {
        const modal = openModal({
            title: 'Cambiar estado',
            body: html`
                <div class="alert alert-info d-flex gap-2" role="note">
                    <i class="bi bi-info-circle" aria-hidden="true"></i><div>${block.reason}</div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cerrar</button>
                    <button type="button" class="btn btn-primary" id="goProcess">${block.action}</button>
                </div>`,
        });
        modal.body.querySelector('#goProcess').addEventListener('click', () => {
            modal.close();
            navigate(`/animales/${animal.id_animal}/${block.tab}`);
        });
        return;
    }

    const allowed = manualStateOptions(estados, animal.id_estado_actual);
    const modal = openModal({
        title: 'Cambiar estado',
        body: html`
            <form id="stateForm" novalidate>
                <div data-form-error hidden></div>
                <p class="small text-secondary">Estado actual: <strong>${animal.estado?.nombre_estado ?? '—'}</strong>.
                    El cambio quedará registrado en el historial.</p>
                <div class="mb-3">
                    <label class="form-label" for="sNuevo">Nuevo estado <span class="text-danger">*</span></label>
                    <select class="form-select" id="sNuevo" name="estado" required>
                        ${options(allowed.map((e) => ({ value: e.id, label: e.nombre })), '')}
                    </select>
                    <div class="form-text">Hogar temporal y Adopción se asignan mediante sus propios procesos.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="sMotivo">Motivo del cambio</label>
                    <input class="form-control" id="sMotivo" name="motivo" maxlength="500">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="sObs">Observaciones</label>
                    <textarea class="form-control" id="sObs" name="observaciones" rows="2"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-arrow-repeat" aria-hidden="true"></i> Confirmar cambio</button>
                </div>
            </form>`,
    });

    bindForm(modal.body.querySelector('#stateForm'), {
        context: 'Cambio de estado',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            estado: Number(fd.get('estado')) || null,
            motivo: emptyToNull(fd.get('motivo')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => (v.estado ? null : { estado: 'Selecciona el nuevo estado.' }),
        submit: async (v) => {
            modal.setBusy(true);
            try { await changeState(animal.id_animal, v.estado, v.motivo, v.observaciones); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Estado actualizado.', 'success');
            await onSaved?.();
        },
    });
}
