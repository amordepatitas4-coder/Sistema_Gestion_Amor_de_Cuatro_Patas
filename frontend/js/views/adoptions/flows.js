// ============================================================
// Flujos de Adopciones compartidos por el módulo y la ficha.
//
//   Adoptante  → INSERT/UPDATE adoptante (RUT normalizado)
//   Adopción   → RPC registrar_adopcion (cierra hogar activo, estado Adoptado)
//   Seguimiento→ RPC registrar_seguimiento (medio_contacto exacto)
//   Devolución → RPC registrar_devolucion (adopción Devuelto + nueva situación)
//
// Sin cuestionarios, postulaciones ni puntajes (fuera del MVP).
// ============================================================

import {
    createAdopter, getActiveStay, registerAdoption, registerFollowUp, registerReturn, updateAdopter,
} from '../../api/adoptions.js';
import { bindForm } from '../../core/forms.js';
import { emptyToNull, formatDate, todayISO } from '../../core/format.js';
import { html, openModal, options, render, toast } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import {
    MEDIOS_CONTACTO, collectAdopter, returnStateOptions, validateAdopter, validateAdoption, validateFollowUp, validateReturn,
} from './logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;
const actions = (label, icon, cls = 'btn-primary') => html`
    <div class="modal-actions">
        <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
        <button type="submit" class="btn ${cls}"><i class="bi ${icon}" aria-hidden="true"></i> ${label}</button>
    </div>`;

// Reutiliza el modal abierto para pasar de un formulario a otro (adopción → nuevo adoptante) sin anidar modales.
function reuse(modal, title, body) {
    modal.element.querySelector('.modal-title').textContent = title;
    render(modal.body, body);
}

// ------------------------------------------------------------
// Adoptante (crear / editar)
// ------------------------------------------------------------

export function openAdopterForm({ adopter = null, existing = [], onSaved, modal = null, onCancel = null }) {
    const a = adopter ?? {};
    const title = adopter ? 'Editar adoptante' : 'Nuevo adoptante';
    const body = html`
        <form id="adopterForm" novalidate>
            <div data-form-error hidden></div>
            <div class="row g-3">
                <div class="col-md-7">
                    <label class="form-label" for="adNombre">Nombre completo ${req}</label>
                    <input class="form-control" id="adNombre" name="nombre" maxlength="150" required value="${a.nombre ?? ''}">
                </div>
                <div class="col-md-5">
                    <label class="form-label" for="adRut">RUT ${req}</label>
                    <input class="form-control" id="adRut" name="rut" maxlength="12" required value="${a.rut ?? ''}"
                           placeholder="12345678-9" aria-describedby="adRutHelp" autocomplete="off">
                    <div class="form-text" id="adRutHelp">Se guarda sin puntos y con guion (ej. 12345678-9).</div>
                </div>
                <div class="col-md-5">
                    <label class="form-label" for="adTel">Teléfono</label>
                    <input class="form-control" id="adTel" name="telefono" maxlength="30" inputmode="tel" value="${a.telefono ?? ''}">
                </div>
                <div class="col-md-7">
                    <label class="form-label" for="adEmail">Correo electrónico</label>
                    <input class="form-control" id="adEmail" name="email" type="email" maxlength="254" value="${a.email ?? ''}">
                </div>
                <div class="col-12">
                    <label class="form-label" for="adDir">Dirección</label>
                    <textarea class="form-control" id="adDir" name="direccion" rows="2">${a.direccion ?? ''}</textarea>
                </div>
                <div class="col-12">
                    <label class="form-label" for="adObs">Observaciones</label>
                    <textarea class="form-control" id="adObs" name="observaciones" rows="2">${a.observaciones ?? ''}</textarea>
                </div>
            </div>
            ${onCancel ? html`<div class="modal-actions">
                <button type="button" class="btn btn-outline-primary" id="adopterBack"><i class="bi bi-arrow-left" aria-hidden="true"></i> Volver</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Registrar y continuar</button></div>`
                : actions(adopter ? 'Guardar cambios' : 'Registrar adoptante', 'bi-check-lg')}
        </form>`;

    const m = modal ?? openModal({ title, body, size: 'modal-lg' });
    if (modal) reuse(m, title, body);
    const form = m.body.querySelector('#adopterForm');
    m.body.querySelector('#adopterBack')?.addEventListener('click', onCancel);

    bindForm(form, {
        context: adopter ? 'Edición de adoptante' : 'Registro de adoptante',
        busyLabel: 'Guardando…',
        collect: collectAdopter,
        validate: (v) => validateAdopter(v, existing, adopter?.id_adoptante),
        submit: async (v) => {
            m.setBusy(true);
            try {
                const values = { ...v };
                // rutValido es un dato auxiliar de la validación; no es una columna de la tabla adoptante.
                delete values.rutValido;
                return adopter ? await updateAdopter(adopter.id_adoptante, values) : await createAdopter(values);
            } finally { m.setBusy(false); }
        },
        onSuccess: async (saved) => {
            if (!modal) m.close();
            toast(adopter ? 'Adoptante actualizado.' : 'Adoptante registrado.', 'success');
            await onSaved?.(saved);
        },
    });
    return m;
}

// ------------------------------------------------------------
// Registrar adopción
// animal: animal fijo (desde la ficha) o null (se elige de animals).
// ------------------------------------------------------------

export function openAdoptionForm({ animal = null, animals = [], adopters, onSaved, preset = {}, modal = null }) {
    const title = animal ? `Registrar adopción — ${animalName(animal)}` : 'Registrar adopción';
    const body = html`
        <form id="adoptionForm" novalidate>
            <div data-form-error hidden></div>
            <p class="small text-secondary">La adopción cambia el estado del animal a <strong>Adoptado</strong> y,
                si está en un hogar temporal, finaliza esa permanencia.</p>
            <div class="mb-3">
                <label class="form-label" for="aoAnimal">Animal ${req}</label>
                ${animal
                    ? html`<input type="hidden" name="animal" value="${animal.id_animal}">
                        <input class="form-control" id="aoAnimal" value="${animalName(animal)}" readonly>`
                    : html`<select class="form-select" id="aoAnimal" name="animal" required>
                        ${options(animals.map((a) => ({ value: a.id_animal, label: `${animalName(a)} — ${a.estado?.nombre_estado ?? ''}` })), preset.idAnimal ?? '')}
                      </select>
                      ${animals.length === 0 ? html`<div class="form-text">No hay animales disponibles para adopción (sin adopción activa).</div>` : ''}`}
                <div class="form-text" id="aoStay" aria-live="polite"></div>
            </div>
            <div class="mb-3">
                <label class="form-label" for="aoAdoptante">Adoptante ${req}</label>
                <select class="form-select" id="aoAdoptante" name="adoptante" required>
                    ${options(adopters.map((a) => ({ value: a.id_adoptante, label: `${a.nombre} — ${a.rut}` })), preset.idAdoptante ?? '')}
                </select>
                <button type="button" class="btn btn-link px-0" id="aoNuevoAdoptante"><i class="bi bi-person-plus" aria-hidden="true"></i> Registrar nuevo adoptante</button>
            </div>
            <div class="mb-3">
                <label class="form-label" for="aoFecha">Fecha de adopción ${req}</label>
                <input class="form-control" type="date" id="aoFecha" name="fecha" required value="${preset.fecha ?? todayISO()}">
            </div>
            <div class="mb-3">
                <label class="form-label" for="aoObs">Observaciones</label>
                <textarea class="form-control" id="aoObs" name="observaciones" rows="2">${preset.observaciones ?? ''}</textarea>
            </div>
            ${actions('Registrar adopción', 'bi-house-check')}
        </form>`;

    const m = modal ?? openModal({ title, body });
    if (modal) reuse(m, title, body);
    const form = m.body.querySelector('#adoptionForm');
    const stayInfo = m.body.querySelector('#aoStay');
    let fechaIngresoHogar = null;

    // Si el animal está en un hogar temporal, la adopción no puede ser anterior al ingreso.
    const loadStay = async (idAnimal) => {
        fechaIngresoHogar = null;
        stayInfo.textContent = '';
        form.fecha.removeAttribute('min');
        if (!idAnimal) return;
        try {
            const stay = await getActiveStay(idAnimal);
            // Se descarta la respuesta si la usuaria ya eligió otro animal mientras se consultaba.
            if (stay && String(form.animal.value) === String(idAnimal)) {
                fechaIngresoHogar = stay.fecha_ingreso;
                form.fecha.min = stay.fecha_ingreso;
                stayInfo.textContent = `Está en el hogar temporal de ${stay.hogar?.nombre_responsable ?? '—'} desde ${formatDate(stay.fecha_ingreso)}; la adopción finalizará esa permanencia.`;
            }
        } catch (err) {
            // Consulta solo informativa: si falla, el formulario sigue disponible y la RPC valida las fechas igual.
            console.warn('[Adopción] No fue posible consultar el hogar activo', err);
        }
    };
    if (!animal) form.animal.addEventListener('change', () => loadStay(form.animal.value));
    loadStay(animal?.id_animal ?? form.animal.value);

    // Crear un adoptante sin perder lo ya escrito: se guardan los valores y se restauran al volver.
    m.body.querySelector('#aoNuevoAdoptante').addEventListener('click', () => {
        const kept = {
            idAnimal: form.animal.value,
            fecha: form.fecha.value,
            observaciones: form.observaciones.value,
        };
        openAdopterForm({
            modal: m,
            existing: adopters,
            onCancel: () => openAdoptionForm({ animal, animals, adopters, onSaved, preset: { ...kept, idAdoptante: form.adoptante.value }, modal: m }),
            onSaved: (nuevo) => openAdoptionForm({ animal, animals, adopters: [...adopters, nuevo], onSaved, preset: { ...kept, idAdoptante: nuevo.id_adoptante }, modal: m }),
        });
    });

    bindForm(form, {
        context: 'Registro de adopción',
        busyLabel: 'Registrando…',
        collect: (fd) => ({
            idAnimal: Number(fd.get('animal')) || null,
            idAdoptante: Number(fd.get('adoptante')) || null,
            fecha: emptyToNull(fd.get('fecha')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => validateAdoption(v, { fechaIngresoHogar }),
        submit: async (v) => {
            m.setBusy(true);
            // La RPC hace todo en una transacción: adopción, cierre de hogar y cambio de estado del animal.
            try { return await registerAdoption(v); } finally { m.setBusy(false); }
        },
        onSuccess: async (idAdopcion) => {
            m.close();
            toast('Adopción registrada.', 'success');
            await onSaved?.(idAdopcion);
        },
    });
}

// ------------------------------------------------------------
// Seguimiento
// ------------------------------------------------------------

export function openFollowUpForm({ adoption, onSaved }) {
    const modal = openModal({
        title: 'Registrar seguimiento',
        body: html`
            <form id="followForm" novalidate>
                <div data-form-error hidden></div>
                <p class="small text-secondary">Adopción del ${formatDate(adoption.fecha_adopcion)}. Los seguimientos anteriores se conservan.</p>
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label" for="sgFecha">Fecha ${req}</label>
                        <input class="form-control" type="date" id="sgFecha" name="fecha" required value="${todayISO()}" min="${adoption.fecha_adopcion}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="sgMedio">Medio de contacto ${req}</label>
                        <select class="form-select" id="sgMedio" name="medio" required>${options(MEDIOS_CONTACTO, '')}</select>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="sgSituacion">Situación del animal</label>
                        <textarea class="form-control" id="sgSituacion" name="situacion" rows="2"></textarea>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="sgObs">Observaciones</label>
                        <textarea class="form-control" id="sgObs" name="observaciones" rows="2"></textarea>
                    </div>
                </div>
                ${actions('Registrar seguimiento', 'bi-chat-heart')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#followForm'), {
        context: 'Seguimiento',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            idAdopcion: adoption.id_adopcion,
            fecha: emptyToNull(fd.get('fecha')),
            medio: String(fd.get('medio') ?? ''),
            situacion: emptyToNull(fd.get('situacion')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => validateFollowUp(v, adoption.fecha_adopcion),
        submit: async (v) => {
            modal.setBusy(true);
            try { await registerFollowUp(v); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Seguimiento registrado.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Devolución
// ------------------------------------------------------------

export function openReturnForm({ adoption, estados, onSaved }) {
    const allowed = returnStateOptions(estados);
    const modal = openModal({
        title: 'Registrar devolución',
        body: html`
            <form id="returnForm" novalidate>
                <div data-form-error hidden></div>
                <div class="alert alert-warning py-2" role="note">
                    La adopción quedará como <strong>Devuelto</strong> y se conservará en el historial.
                    El animal pasará a la situación que indiques y podrá adoptarse nuevamente.
                </div>
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label" for="dvFecha">Fecha de devolución ${req}</label>
                        <input class="form-control" type="date" id="dvFecha" name="fecha" required value="${todayISO()}" min="${adoption.fecha_adopcion}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="dvEstado">Nueva situación del animal ${req}</label>
                        <select class="form-select" id="dvEstado" name="estado" required>
                            ${options(allowed.map((e) => ({ value: e.id, label: e.nombre })), '')}
                        </select>
                        <div class="form-text">Para ingresarlo a un hogar temporal, usa luego el proceso de hogares.</div>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="dvMotivo">Motivo</label>
                        <textarea class="form-control" id="dvMotivo" name="motivo" rows="2"></textarea>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="dvObs">Observaciones</label>
                        <textarea class="form-control" id="dvObs" name="observaciones" rows="2"></textarea>
                    </div>
                </div>
                ${actions('Registrar devolución', 'bi-arrow-return-left', 'btn-danger')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#returnForm'), {
        context: 'Devolución',
        busyLabel: 'Registrando…',
        collect: (fd) => ({
            idAdopcion: adoption.id_adopcion,
            fecha: emptyToNull(fd.get('fecha')),
            idNuevoEstado: Number(fd.get('estado')) || null,
            motivo: emptyToNull(fd.get('motivo')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => validateReturn(v, adoption.fecha_adopcion),
        submit: async (v) => {
            modal.setBusy(true);
            // La adopción no se borra: queda como "Devuelto" en el historial.
            try { await registerReturn(v); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Devolución registrada. La adopción se conserva en el historial.', 'success');
            await onSaved?.();
        },
    });
}
