// ============================================================
// Flujos de hogares temporales, compartidos por la ficha del
// animal y el módulo Hogares temporales.
//
// Permanencias: SOLO mediante RPC
//   ingresar_hogar_temporal  (crea permanencia + estado En hogar temporal)
//   cambiar_hogar_temporal   (cierra la anterior, abre otra; sin cambio de estado)
//   finalizar_hogar_temporal (cierra + nueva situación del animal)
//
// No se anidan modales: la creación rápida de un hogar reemplaza el
// contenido y luego vuelve al ingreso conservando lo ya ingresado.
// ============================================================

import { createHome, changeHome, enterHome, finishHome, updateHome } from '../../api/homes.js';
import { bindForm } from '../../core/forms.js';
import { emptyToNull, formatDate, isValidEmail, parseISODate, todayISO } from '../../core/format.js';
import { html, openModal, options, toast } from '../../core/ui.js';
import { animalName, exitStateOptions } from '../animals/logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

const actions = (label, icon) => html`
    <div class="modal-actions">
        <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="bi ${icon}" aria-hidden="true"></i> ${label}</button>
    </div>`;

function validDateField(value, label) {
    if (!value) return `Ingresa la ${label}.`;
    if (!parseISODate(value)) return `La ${label} no es válida.`;
    return null;
}

// ------------------------------------------------------------
// Crear / editar hogar
// ------------------------------------------------------------

function homeFields(h = {}) {
    return html`
        <div class="row g-3">
            <div class="col-12">
                <label class="form-label" for="hResp">Nombre de la persona responsable ${req}</label>
                <input class="form-control" id="hResp" name="nombre_responsable" maxlength="150" required value="${h.nombre_responsable ?? ''}">
            </div>
            <div class="col-md-6">
                <label class="form-label" for="hTel">Teléfono</label>
                <input class="form-control" id="hTel" name="telefono" maxlength="30" inputmode="tel" value="${h.telefono ?? ''}">
            </div>
            <div class="col-md-6">
                <label class="form-label" for="hEmail">Correo electrónico</label>
                <input class="form-control" id="hEmail" name="email" type="email" maxlength="254" value="${h.email ?? ''}">
            </div>
            <div class="col-12">
                <label class="form-label" for="hDir">Dirección</label>
                <textarea class="form-control" id="hDir" name="direccion" rows="2">${h.direccion ?? ''}</textarea>
            </div>
            <div class="col-12">
                <label class="form-label" for="hObs">Observaciones</label>
                <textarea class="form-control" id="hObs" name="observaciones" rows="2">${h.observaciones ?? ''}</textarea>
            </div>
        </div>`;
}

function collectHome(fd) {
    return {
        nombre_responsable: emptyToNull(fd.get('nombre_responsable')),
        telefono: emptyToNull(fd.get('telefono')),
        email: emptyToNull(fd.get('email')),
        direccion: emptyToNull(fd.get('direccion')),
        observaciones: emptyToNull(fd.get('observaciones')),
        ...(fd.has('activo') || fd.has('activo_presente') ? { activo: fd.get('activo') === 'on' } : {}),
    };
}

function validateHome(v) {
    const e = {};
    if (!v.nombre_responsable) e.nombre_responsable = 'Ingresa el nombre de la persona responsable.';
    if (v.email && !isValidEmail(v.email)) e.email = 'El correo electrónico no tiene un formato válido.';
    return e;
}

/**
 * home: null para crear. occupiedCount: animales alojados actualmente (aviso al desactivar).
 * modal: modal existente a reutilizar (creación rápida dentro de otro flujo).
 */
export function openHomeForm({ home = null, occupiedCount = 0, onSaved, modal = null, onCancel = null }) {
    const body = html`
        <form id="homeForm" novalidate>
            <div data-form-error hidden></div>
            ${homeFields(home ?? {})}
            ${home ? html`
                <div class="form-check form-switch mt-3">
                    <input type="hidden" name="activo_presente" value="1">
                    <input class="form-check-input" type="checkbox" role="switch" id="hActivo" name="activo" ${home.activo ? 'checked' : ''}>
                    <label class="form-check-label" for="hActivo">Hogar activo (disponible para recibir animales)</label>
                </div>
                ${occupiedCount > 0 ? html`<div class="form-text" id="hActivoAviso">Este hogar tiene ${occupiedCount} animal(es) alojado(s).
                    Desactivarlo no finaliza sus permanencias.</div>` : ''}` : ''}
            ${onCancel
                ? html`<div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" id="homeBack"><i class="bi bi-arrow-left" aria-hidden="true"></i> Volver</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Crear hogar y continuar</button></div>`
                : actions(home ? 'Guardar cambios' : 'Crear hogar', 'bi-check-lg')}
        </form>`;

    const m = modal ?? openModal({ title: home ? 'Editar hogar temporal' : 'Nuevo hogar temporal', body });
    if (modal) {
        m.element.querySelector('.modal-title').textContent = 'Nuevo hogar temporal';
        m.body.innerHTML = String(body);
    }
    const form = m.body.querySelector('#homeForm');
    m.body.querySelector('#homeBack')?.addEventListener('click', onCancel);

    bindForm(form, {
        context: home ? 'Edición de hogar' : 'Creación de hogar',
        busyLabel: 'Guardando…',
        collect: collectHome,
        validate: validateHome,
        submit: async (v) => {
            m.setBusy(true);
            try { return home ? await updateHome(home.id_hogar, v) : await createHome(v); } finally { m.setBusy(false); }
        },
        onSuccess: async (saved) => {
            if (!modal) m.close();
            toast(home ? 'Hogar actualizado.' : 'Hogar temporal creado.', 'success');
            await onSaved?.(saved);
        },
    });
    return m;
}

// ------------------------------------------------------------
// Ingresar a hogar (desde la ficha del animal)
// ------------------------------------------------------------

export function openEnterHome({ animal, homes, onSaved, preset = {}, modal = null }) {
    const activos = homes.filter((h) => h.activo);
    const body = html`
        <form id="enterForm" novalidate>
            <div data-form-error hidden></div>
            <p class="small text-secondary">Al ingresar, el estado del animal pasará a <strong>En hogar temporal</strong>.</p>
            <div class="mb-3">
                <label class="form-label" for="eHogar">Hogar temporal ${req}</label>
                <select class="form-select" id="eHogar" name="hogar" required>
                    ${options(activos.map((h) => ({ value: h.id_hogar, label: h.nombre_responsable })), preset.idHogar ?? '')}
                </select>
                ${activos.length === 0 ? html`<div class="form-text text-warning-emphasis">No hay hogares activos. Registra uno para continuar.</div>` : ''}
                <button type="button" class="btn btn-link px-0" id="eNuevoHogar"><i class="bi bi-house-add" aria-hidden="true"></i> Registrar nuevo hogar</button>
            </div>
            <div class="mb-3">
                <label class="form-label" for="eFecha">Fecha de ingreso ${req}</label>
                <input class="form-control" type="date" id="eFecha" name="fecha" required value="${preset.fecha ?? todayISO()}">
            </div>
            <div class="mb-3">
                <label class="form-label" for="eObs">Observaciones</label>
                <textarea class="form-control" id="eObs" name="observaciones" rows="2">${preset.observaciones ?? ''}</textarea>
            </div>
            ${actions('Ingresar a hogar', 'bi-house-heart')}
        </form>`;

    const m = modal ?? openModal({ title: `Ingresar a hogar temporal — ${animalName(animal)}`, body });
    if (modal) {
        m.element.querySelector('.modal-title').textContent = `Ingresar a hogar temporal — ${animalName(animal)}`;
        m.body.innerHTML = String(body);
    }
    const form = m.body.querySelector('#enterForm');

    // Creación rápida: conserva lo ingresado y vuelve con el hogar nuevo seleccionado.
    m.body.querySelector('#eNuevoHogar').addEventListener('click', () => {
        const kept = { fecha: form.fecha.value, observaciones: form.observaciones.value };
        openHomeForm({
            modal: m,
            onCancel: () => openEnterHome({ animal, homes, onSaved, preset: { ...kept, idHogar: form.hogar.value }, modal: m }),
            onSaved: (nuevo) => openEnterHome({ animal, homes: [...homes, nuevo], onSaved, preset: { ...kept, idHogar: nuevo.id_hogar }, modal: m }),
        });
    });

    bindForm(form, {
        context: 'Ingreso a hogar temporal',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            idHogar: Number(fd.get('hogar')) || null,
            fecha: emptyToNull(fd.get('fecha')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => {
            const e = {};
            if (!v.idHogar) e.hogar = 'Selecciona el hogar temporal.';
            const d = validDateField(v.fecha, 'fecha de ingreso');
            if (d) e.fecha = d;
            return e;
        },
        submit: async (v) => {
            m.setBusy(true);
            try { await enterHome({ idAnimal: animal.id_animal, ...v }); } finally { m.setBusy(false); }
        },
        onSuccess: async () => {
            m.close();
            toast('Animal ingresado al hogar temporal.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Asignar animal (desde el módulo Hogares)
// ------------------------------------------------------------

export function openAssignAnimal({ home, animals, onSaved }) {
    const modal = openModal({
        title: `Asignar animal — ${home.nombre_responsable}`,
        body: html`
            <form id="assignForm" novalidate>
                <div data-form-error hidden></div>
                <p class="small text-secondary">Se muestran animales sin hogar temporal activo y que no están adoptados.
                    Al ingresar, su estado pasará a <strong>En hogar temporal</strong>.</p>
                <div class="mb-3">
                    <label class="form-label" for="aAnimal">Animal ${req}</label>
                    <select class="form-select" id="aAnimal" name="animal" required>
                        ${options(animals.map((a) => ({ value: a.id_animal, label: `${animalName(a)} — ${a.estado?.nombre_estado ?? ''}` })), '')}
                    </select>
                    ${animals.length === 0 ? html`<div class="form-text">No hay animales disponibles para ingresar a un hogar.</div>` : ''}
                </div>
                <div class="mb-3">
                    <label class="form-label" for="aFecha">Fecha de ingreso ${req}</label>
                    <input class="form-control" type="date" id="aFecha" name="fecha" required value="${todayISO()}">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="aObs">Observaciones</label>
                    <textarea class="form-control" id="aObs" name="observaciones" rows="2"></textarea>
                </div>
                ${actions('Asignar animal', 'bi-house-heart')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#assignForm'), {
        context: 'Asignación a hogar temporal',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            idAnimal: Number(fd.get('animal')) || null,
            fecha: emptyToNull(fd.get('fecha')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => {
            const e = {};
            if (!v.idAnimal) e.animal = 'Selecciona el animal.';
            const d = validDateField(v.fecha, 'fecha de ingreso');
            if (d) e.fecha = d;
            return e;
        },
        submit: async (v) => {
            modal.setBusy(true);
            try { await enterHome({ idHogar: home.id_hogar, ...v }); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Animal asignado al hogar temporal.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Cambiar de hogar
// ------------------------------------------------------------

export function openChangeHome({ animal, currentStay, homes, onSaved }) {
    const destinos = homes.filter((h) => h.activo && h.id_hogar !== currentStay.id_hogar);
    const modal = openModal({
        title: `Cambiar de hogar — ${animalName(animal)}`,
        body: html`
            <form id="changeForm" novalidate>
                <div data-form-error hidden></div>
                <p class="small text-secondary">Hogar actual: <strong>${currentStay.hogar?.nombre_responsable ?? '—'}</strong>
                    desde ${formatDate(currentStay.fecha_ingreso)}. La permanencia actual se cerrará y quedará en el historial.</p>
                <div class="mb-3">
                    <label class="form-label" for="cHogar">Nuevo hogar ${req}</label>
                    <select class="form-select" id="cHogar" name="hogar" required>
                        ${options(destinos.map((h) => ({ value: h.id_hogar, label: h.nombre_responsable })), '')}
                    </select>
                    ${destinos.length === 0 ? html`<div class="form-text">No hay otros hogares activos.</div>` : ''}
                </div>
                <div class="mb-3">
                    <label class="form-label" for="cFecha">Fecha del cambio ${req}</label>
                    <input class="form-control" type="date" id="cFecha" name="fecha" required value="${todayISO()}" min="${currentStay.fecha_ingreso}">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="cObs">Observaciones</label>
                    <textarea class="form-control" id="cObs" name="observaciones" rows="2"></textarea>
                </div>
                ${actions('Cambiar de hogar', 'bi-arrow-left-right')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#changeForm'), {
        context: 'Cambio de hogar temporal',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            idNuevoHogar: Number(fd.get('hogar')) || null,
            fecha: emptyToNull(fd.get('fecha')),
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => {
            const e = {};
            if (!v.idNuevoHogar) e.hogar = 'Selecciona el nuevo hogar.';
            const d = validDateField(v.fecha, 'fecha del cambio');
            if (d) e.fecha = d;
            else if (v.fecha < currentStay.fecha_ingreso) e.fecha = 'La fecha no puede ser anterior al ingreso al hogar actual.';
            return e;
        },
        submit: async (v) => {
            modal.setBusy(true);
            try { await changeHome({ idAnimal: animal.id_animal, ...v }); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Cambio de hogar registrado.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Finalizar permanencia
// ------------------------------------------------------------

export function openFinishHome({ animal, currentStay, estados, onSaved }) {
    const allowed = exitStateOptions(estados, animal.id_estado_actual);
    const modal = openModal({
        title: `Finalizar permanencia — ${animalName(animal)}`,
        body: html`
            <form id="finishForm" novalidate>
                <div data-form-error hidden></div>
                <p class="small text-secondary">Hogar actual: <strong>${currentStay.hogar?.nombre_responsable ?? '—'}</strong>
                    desde ${formatDate(currentStay.fecha_ingreso)}. Indica la nueva situación del animal.</p>
                <div class="mb-3">
                    <label class="form-label" for="fFecha">Fecha de salida ${req}</label>
                    <input class="form-control" type="date" id="fFecha" name="fecha" required value="${todayISO()}" min="${currentStay.fecha_ingreso}">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="fEstado">Nuevo estado del animal ${req}</label>
                    <select class="form-select" id="fEstado" name="estado" required>
                        ${options(allowed.map((e) => ({ value: e.id, label: e.nombre })), '')}
                    </select>
                    <div class="form-text">Para una adopción utiliza el proceso de adopción (cierra el hogar automáticamente).</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="fObs">Observaciones</label>
                    <textarea class="form-control" id="fObs" name="observaciones" rows="2"></textarea>
                </div>
                ${actions('Finalizar permanencia', 'bi-box-arrow-right')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#finishForm'), {
        context: 'Finalización de permanencia',
        busyLabel: 'Guardando…',
        collect: (fd) => ({
            fecha: emptyToNull(fd.get('fecha')),
            idNuevoEstado: Number(fd.get('estado')) || null,
            observaciones: emptyToNull(fd.get('observaciones')),
        }),
        validate: (v) => {
            const e = {};
            const d = validDateField(v.fecha, 'fecha de salida');
            if (d) e.fecha = d;
            else if (v.fecha < currentStay.fecha_ingreso) e.fecha = 'La fecha de salida no puede ser anterior a la fecha de ingreso.';
            if (!v.idNuevoEstado) e.estado = 'Selecciona el nuevo estado.';
            return e;
        },
        submit: async (v) => {
            modal.setBusy(true);
            try { await finishHome({ idAnimal: animal.id_animal, ...v }); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Permanencia finalizada.', 'success');
            await onSaved?.();
        },
    });
}
