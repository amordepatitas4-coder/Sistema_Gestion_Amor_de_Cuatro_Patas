// ============================================================
// Formularios de animal: registro, edición y foto principal.
//
// Registro (Prompt Maestro §8.4):
//   1. capturar y validar todo (incluida la foto) antes de bloquear;
//   2. RPC registrar_animal con la firma completa;
//   3. desde este punto el animal EXISTE: el formulario se reemplaza
//      por un resumen de progreso y ya no puede reenviarse (REG-13);
//   4. Edge Function crear-carpeta-animal (fallo = aviso + reintento);
//   5. foto WebP a Storage + foto_principal_path (fallo = aviso).
// ============================================================

import { createDriveFolder, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, registerAnimal, updateAnimal, uploadPhoto } from '../../api/animals.js';
import { selectable } from '../../api/catalogs.js';
import { reportError } from '../../core/errors.js';
import { bindForm } from '../../core/forms.js';
import { todayISO } from '../../core/format.js';
import { optimizeToWebp, validateImageFile } from '../../core/images.js';
import { html, openModal, options, render, toast } from '../../core/ui.js';
import { REGISTRO_NACIONAL, SEXOS, TAMANOS, animalName, collectAnimal, validateAnimal } from './logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

/** Campos del formulario de ANIMAL (sin estado, código interno ni URL de Drive). */
function animalFields(v, catalogs, { withPhoto = false } = {}) {
    // selectable: solo opciones activas, conservando la ya elegida aunque se haya desactivado.
    const especies = selectable(catalogs.especie, v.id_especie).map((r) => ({ value: r.id, label: r.nombre }));
    const rangos = selectable(catalogs.rango_etario, v.id_rango_etario).map((r) => ({ value: r.id, label: r.nombre }));
    return html`
        <p class="form-hint"><span class="text-danger">*</span> Campo obligatorio. El resto es opcional.</p>

        <fieldset class="form-section">
            <legend>Identificación</legend>
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label" for="fNombre">Nombre</label>
                    <input class="form-control" id="fNombre" name="nombre" maxlength="100" value="${v.nombre ?? ''}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="fEspecie">Especie ${req}</label>
                    <select class="form-select" id="fEspecie" name="id_especie" required>${options(especies, v.id_especie)}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="fSexo">Sexo ${req}</label>
                    <select class="form-select" id="fSexo" name="sexo" required>${options(SEXOS, v.sexo)}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="fRango">Rango etario</label>
                    <select class="form-select" id="fRango" name="id_rango_etario">${options(rangos, v.id_rango_etario, { placeholder: 'Sin indicar' })}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="fTamano">Tamaño</label>
                    <select class="form-select" id="fTamano" name="tamano">${options(TAMANOS, v.tamaño, { placeholder: 'Sin indicar' })}</select>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="fMicrochip">Microchip</label>
                    <input class="form-control" id="fMicrochip" name="microchip" inputmode="numeric" maxlength="15"
                           autocomplete="off" value="${v.microchip ?? ''}" aria-describedby="fMicrochipHelp">
                    <div class="form-text" id="fMicrochipHelp">15 dígitos, sin espacios ni guiones.</div>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="fRegistro">Registro Nacional</label>
                    <select class="form-select" id="fRegistro" name="estado_registro_nacional">${options(REGISTRO_NACIONAL, v.estado_registro_nacional, { placeholder: 'Sin información' })}</select>
                </div>
            </div>
        </fieldset>

        <fieldset class="form-section">
            <legend>Rescate</legend>
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label" for="fRescate">Fecha de rescate ${req}</label>
                    <input class="form-control" type="date" id="fRescate" name="fecha_rescate" required value="${v.fecha_rescate ?? ''}">
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="fNacimiento">Fecha de nacimiento</label>
                    <input class="form-control" type="date" id="fNacimiento" name="fecha_nacimiento" value="${v.fecha_nacimiento ?? ''}">
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="fLugar">Lugar de rescate</label>
                    <input class="form-control" id="fLugar" name="lugar_rescate" maxlength="255" value="${v.lugar_rescate ?? ''}">
                </div>
                <div class="col-12">
                    <label class="form-label" for="fHistoria">Historia del rescate</label>
                    <textarea class="form-control" id="fHistoria" name="historia_rescate" rows="3">${v.historia_rescate ?? ''}</textarea>
                </div>
            </div>
        </fieldset>

        <fieldset class="form-section">
            <legend>Descripción</legend>
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label" for="fCaract">Características</label>
                    <textarea class="form-control" id="fCaract" name="caracteristicas" rows="3">${v.caracteristicas ?? ''}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="fPersonalidad">Personalidad</label>
                    <textarea class="form-control" id="fPersonalidad" name="personalidad" rows="3">${v.personalidad ?? ''}</textarea>
                </div>
                <div class="col-12">
                    <label class="form-label" for="fObs">Observaciones</label>
                    <textarea class="form-control" id="fObs" name="observaciones" rows="2">${v.observaciones ?? ''}</textarea>
                </div>
            </div>
        </fieldset>

        ${withPhoto ? html`
        <fieldset class="form-section">
            <legend>Fotografía principal</legend>
            <label class="form-label" for="fFoto">Foto (opcional)</label>
            <input class="form-control" type="file" id="fFoto" name="foto" accept="image/jpeg,image/png,image/webp" aria-describedby="fFotoHelp">
            <div class="form-text" id="fFotoHelp">JPG, PNG o WebP. Se optimiza automáticamente (WebP, máx. ${PHOTO_MAX_SIDE} px).</div>
        </fieldset>` : ''}`;
}

function formActions(submitLabel, icon) {
    return html`
        <div class="modal-actions">
            <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="bi ${icon}" aria-hidden="true"></i> ${submitLabel}</button>
        </div>`;
}

// ------------------------------------------------------------
// Registro
// ------------------------------------------------------------

export function openRegisterAnimal({ catalogs, navigate, onCreated }) {
    let createdId = null;
    const modal = openModal({
        title: 'Registrar animal',
        size: 'modal-lg',
        // Al cerrar el resumen (sin ir a la ficha) se refresca la vista de origen.
        onHidden: () => { if (createdId) onCreated?.(createdId); },
        body: html`
            <div class="alert alert-info d-flex gap-2 py-2" role="note">
                <i class="bi bi-info-circle" aria-hidden="true"></i>
                <div>El estado inicial será <strong>Rescatado</strong> y se creará su carpeta en Google Drive.</div>
            </div>
            <form id="animalForm" novalidate>
                <div data-form-error hidden></div>
                ${animalFields({ fecha_rescate: todayISO() }, catalogs, { withPhoto: true })}
                ${formActions('Registrar animal', 'bi-heart-pulse')}
            </form>`,
    });
    const form = modal.body.querySelector('#animalForm');

    bindForm(form, {
        context: 'Registro de animal',
        busyLabel: 'Registrando…',
        collect: (fd) => ({ values: collectAnimal(fd), foto: fd.get('foto') }),
        validate: ({ values, foto }) => {
            const errors = validateAnimal(values);
            if (foto instanceof File && foto.size > 0) {
                const photoError = validateImageFile(foto);
                if (photoError) errors.foto = photoError;
            }
            return errors;
        },
        submit: async ({ values }) => {
            modal.setBusy(true);
            try {
                // Si la RPC falla se libera el modal; si tiene éxito, sigue ocupado durante los pasos siguientes.
                return await registerAnimal(values);
            } catch (err) {
                modal.setBusy(false);
                throw err;
            }
        },
        onSuccess: async (idAnimal, { values, foto }) => {
            // El animal ya existe: el formulario se reemplaza (no puede reenviarse).
            createdId = idAnimal;
            await runPostRegistration(modal, {
                idAnimal, nombre: values.nombre, foto,
                goToAnimal: () => { createdId = null; modal.close(); navigate(`/animales/${idAnimal}`); },
            });
        },
    });
}

// Pasos secundarios tras crear el animal: cada uno informa su propio resultado y un fallo no deshace el registro.
async function runPostRegistration(modal, { idAnimal, nombre, foto, goToAnimal }) {
    const hasPhoto = foto instanceof File && foto.size > 0;
    const steps = [
        { key: 'animal', label: 'Animal registrado en estado Rescatado', status: 'ok' },
        { key: 'drive', label: 'Carpeta en Google Drive', status: 'pending' },
        ...(hasPhoto ? [{ key: 'photo', label: 'Fotografía principal', status: 'pending' }] : []),
    ];
    const displayName = animalName({ nombre, id_animal: idAnimal });

    const draw = (done = false) => render(modal.body, html`
        <div class="post-steps" aria-live="polite">
            <p class="mb-3"><strong>${displayName}</strong></p>
            <ul class="list-unstyled mb-3">
                ${steps.map((s) => html`<li class="post-step post-step-${s.status}">
                    ${stepIcon(s.status)} <span>${s.label}</span>
                    ${s.message ? html`<div class="small text-secondary ms-4">${s.message}</div>` : ''}</li>`)}
            </ul>
            ${done ? html`
                ${steps.some((s) => s.status === 'error') ? html`
                <div class="alert alert-warning py-2" role="alert">
                    El animal quedó registrado correctamente. <strong>No vuelvas a registrarlo.</strong>
                    Lo pendiente puede completarse desde su ficha.
                </div>` : ''}
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cerrar</button>
                    <button type="button" class="btn btn-primary" id="goToAnimal"><i class="bi bi-arrow-right" aria-hidden="true"></i> Ver ficha</button>
                </div>` : ''}
        </div>`);

    modal.setBusy(true);
    draw();

    const setStep = (key, status, message = '') => {
        const step = steps.find((s) => s.key === key);
        step.status = status;
        step.message = message;
        draw();
    };

    // Carpeta Drive
    setStep('drive', 'running');
    try {
        await createDriveFolder(idAnimal);
        setStep('drive', 'ok');
    } catch (err) {
        setStep('drive', 'error', `${await reportError(err, 'Carpeta Drive')} Podrás reintentarlo desde la pestaña Archivos.`);
    }

    // Foto principal
    if (hasPhoto) {
        // La foto se comprime a WebP en el navegador antes de subirla, para respetar el límite del bucket.
        setStep('photo', 'running');
        try {
            const webp = await optimizeToWebp(foto, { maxSide: PHOTO_MAX_SIDE, maxBytes: PHOTO_MAX_BYTES });
            await uploadPhoto(idAnimal, webp);
            setStep('photo', 'ok');
        } catch (err) {
            setStep('photo', 'error', `${await reportError(err, 'Foto principal')} Podrás cargarla desde la ficha.`);
        }
    }

    modal.setBusy(false);
    draw(true);
    const failed = steps.filter((s) => s.status === 'error');
    toast(failed.length ? 'Animal registrado; hay tareas pendientes en su ficha.' : 'Animal registrado correctamente.', failed.length ? 'warning' : 'success');
    modal.body.querySelector('#goToAnimal')?.addEventListener('click', goToAnimal);
}

function stepIcon(status) {
    switch (status) {
        case 'ok': return html`<i class="bi bi-check-circle-fill text-success" aria-label="Completado"></i>`;
        case 'error': return html`<i class="bi bi-exclamation-triangle-fill text-warning" aria-label="No completado"></i>`;
        case 'running': return html`<span class="spinner-border spinner-border-sm text-primary" aria-label="En curso"></span>`;
        default: return html`<i class="bi bi-circle text-secondary" aria-label="Pendiente"></i>`;
    }
}

// ------------------------------------------------------------
// Edición (solo datos descriptivos; nunca estado ni procesos)
// ------------------------------------------------------------

export function openEditAnimal({ animal, catalogs, onSaved }) {
    const modal = openModal({
        title: 'Editar información',
        size: 'modal-lg',
        body: html`
            <div class="alert alert-secondary d-flex gap-2 py-2" role="note">
                <i class="bi bi-info-circle" aria-hidden="true"></i>
                <div>El estado, los hogares temporales y las adopciones se modifican desde sus propios procesos.</div>
            </div>
            <form id="animalEditForm" novalidate>
                <div data-form-error hidden></div>
                ${animalFields(animal, catalogs)}
                ${formActions('Guardar cambios', 'bi-check-lg')}
            </form>`,
    });
    const form = modal.body.querySelector('#animalEditForm');
    bindForm(form, {
        context: 'Edición de animal',
        busyLabel: 'Guardando…',
        collect: (fd) => collectAnimal(fd),
        validate: validateAnimal,
        submit: async (values) => {
            modal.setBusy(true);
            try { await updateAnimal(animal.id_animal, values); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Información actualizada.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Foto principal desde la ficha (cargar o reemplazar)
// ------------------------------------------------------------

export function openPhotoForm({ animal, onSaved }) {
    const modal = openModal({
        title: animal.foto_principal_path ? 'Reemplazar fotografía principal' : 'Cargar fotografía principal',
        body: html`
            <form id="photoForm" novalidate>
                <div data-form-error hidden></div>
                <label class="form-label" for="pFoto">Fotografía ${req}</label>
                <input class="form-control" type="file" id="pFoto" name="foto" accept="image/jpeg,image/png,image/webp" required>
                <div class="form-text">JPG, PNG o WebP. Se optimiza automáticamente a WebP (máx. ${PHOTO_MAX_SIDE} px, 2 MB).</div>
                ${formActions('Guardar fotografía', 'bi-upload')}
            </form>`,
    });
    const form = modal.body.querySelector('#photoForm');
    bindForm(form, {
        context: 'Foto principal',
        busyLabel: 'Subiendo…',
        collect: (fd) => ({ foto: fd.get('foto') }),
        validate: ({ foto }) => {
            const error = validateImageFile(foto);
            return error ? { foto: error } : null;
        },
        submit: async ({ foto }) => {
            modal.setBusy(true);
            try {
                const webp = await optimizeToWebp(foto, { maxSide: PHOTO_MAX_SIDE, maxBytes: PHOTO_MAX_BYTES });
                await uploadPhoto(animal.id_animal, webp);
            } finally {
                modal.setBusy(false);
            }
        },
        onSuccess: async () => {
            modal.close();
            toast('Fotografía actualizada.', 'success');
            await onSaved?.();
        },
    });
}
