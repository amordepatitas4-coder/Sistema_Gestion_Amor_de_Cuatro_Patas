// ============================================================
// Formularios del módulo Proyectos de esterilización.
//
// Proyecto (Prompt §17.2): INSERT proyecto → crear-carpeta-proyecto.
//   Si Drive falla, el proyecto permanece creado y se ofrece
//   reintento desde su detalle (PA-PRO-03). Si el INSERT falla sin
//   respuesta, se busca un proyecto idéntico creado después de abrir
//   el formulario y se continúa con él (sin exigir nombres únicos).
//
// Alta en nómina (Prompt §18, flujo conceptual):
//   1. capturar y validar TODO antes de bloquear (datos, filas de
//      profesionales y el File del documento: REG-04, REG-06);
//   2. verificar el tipo real del documento (PDF, JPG, PNG o WebP);
//   3. INSERT animal_esterilizacion  → desde aquí el registro EXISTE
//      y el formulario se reemplaza por un resumen (no reenviable);
//   4. INSERT esterilizacion_profesional por cada profesional (N:M);
//   5. subir-archivo-drive (contexto 'esterilizacion'): el documento
//      queda en Proyecto/Animales/{codigo}.{ext} y registrar_archivo
//      crea ARCHIVO + ESTERILIZACION_ARCHIVO.
//   Un fallo en 4 o 5 se informa como resultado parcial y se
//   completa desde la nómina (Adjuntar documento / Profesionales).
//
// Reintentos seguros (sin duplicados):
//   - si el INSERT del paso 3 falla, se busca el código: si el animal
//     existe con los mismos datos se recupera en vez de crear otro;
//   - los pasos 4 y 5 omiten relaciones y documento ya existentes;
//   - UNIQUE en BD: (id_proyecto, codigo), (esterilización, profesional)
//     y uq_esterilizacion_archivo_documento (un documento por animal).
//
// Documento de esterilización: uno por animal, sin reemplazo en el MVP.
// Si no existe → "Adjuntar documento"; si existe → "Abrir documento".
// ============================================================

import { selectable } from '../../api/catalogs.js';
import { uploadFile } from '../../api/files.js';
import {
    countEntryFiles, createEntry, createProfessional, createProject, createProjectFolder, findEntryByCode,
    findRecoveredProject as queryRecoveredProject, linkProfessional, listEntryLinks, listProfessionals,
    removeProfessionalLink, updateEntry, updateLinkFunction, updateProfessional, updateProject,
} from '../../api/sterilization.js';
import { AppError, reportError } from '../../core/errors.js';
import { bindForm } from '../../core/forms.js';
import { displayText, emptyToNull, formatDate, formatDateTime, todayISO } from '../../core/format.js';
import { html, openModal, options, render, setButtonBusy, toast } from '../../core/ui.js';
import { openFile } from '../files/section.js';
import {
    DOC_ACCEPT, DOC_MAX_BYTES, FUNCIONES_SUGERIDAS, REGISTRO_NACIONAL, SEXOS,
    collectEntry, collectProfessional, collectProject, documentStatus, findRecoveredProject, findSimilarProfessional, hasRowErrors,
    isSameEntry, pendingLinks, readDocumentType, suggestNextCode, validateDocumentFile, validateEntry,
    validateFunction, validateProfessional, validateProfessionalRows, validateProject,
} from './logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;
const NOT_DOC = 'El archivo seleccionado no es un PDF ni una imagen válida (JPG, PNG o WebP). Selecciona el documento de esterilización.';

function formActions(submitLabel, icon) {
    return html`
        <div class="modal-actions">
            <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="bi ${icon}" aria-hidden="true"></i> ${submitLabel}</button>
        </div>`;
}

function stepIcon(status) {
    switch (status) {
        case 'ok': return html`<i class="bi bi-check-circle-fill text-success" aria-label="Completado"></i>`;
        case 'error': return html`<i class="bi bi-exclamation-triangle-fill text-warning" aria-label="No completado"></i>`;
        case 'running': return html`<span class="spinner-border spinner-border-sm text-primary" aria-label="En curso"></span>`;
        default: return html`<i class="bi bi-circle text-secondary" aria-label="Pendiente"></i>`;
    }
}

/** Pasos posteriores a un registro ya creado (el formulario ya no existe). */
function stepsPanel(modal, { title, steps, warning, goLabel }) {
    return (done = false) => render(modal.body, html`
        <div aria-live="polite">
            <p class="mb-3"><strong>${title}</strong></p>
            <ul class="list-unstyled mb-3">${steps.map((s) => html`
                <li class="post-step">${stepIcon(s.status)} <span>${s.label}</span>
                    ${s.message ? html`<div class="small text-secondary ms-4 w-100">${s.message}</div>` : ''}</li>`)}</ul>
            ${done && steps.some((s) => s.status === 'error') ? html`
                <div class="alert alert-warning py-2" role="alert">${warning}</div>` : ''}
            ${done ? html`<div class="modal-actions">
                ${goLabel ? html`<button type="button" class="btn btn-outline-primary" data-modal-close>Cerrar</button>
                    <button type="button" class="btn btn-primary" id="stepsGo"><i class="bi bi-arrow-right" aria-hidden="true"></i> ${goLabel}</button>`
                    : html`<button type="button" class="btn btn-primary" data-modal-close>Cerrar</button>`}
            </div>` : ''}
        </div>`);
}

/** File con el tipo real detectado (algunos sistemas no informan el tipo o lo informan mal). */
const withType = (file, type) => (file.type === type.mime ? file : new File([file], file.name, { type: type.mime }));

/** Icono según el tipo del documento (PDF o imagen). */
export const documentIcon = (mime) => (String(mime ?? '').startsWith('image/') ? 'bi-file-earmark-image' : 'bi-file-earmark-pdf');

/** Verifica el tipo real ANTES de crear registros; devuelve el File listo para subir. */
async function prepareDocument(file) {
    const type = await readDocumentType(file);
    if (!type) throw new AppError(NOT_DOC);
    return { file: withType(file, type), type };
}

// ============================================================
// Proyecto: crear / editar
// ============================================================

function projectFields(v, estados) {
    const opts = selectable(estados, v.id_estado_proyecto).map((e) => ({ value: e.id, label: e.nombre }));
    return html`
        <p class="form-hint"><span class="text-danger">*</span> Campo obligatorio. El resto es opcional.</p>
        <div class="row g-3">
            <div class="col-md-8">
                <label class="form-label" for="pNombre">Nombre del proyecto ${req}</label>
                <input class="form-control" id="pNombre" name="nombre" maxlength="150" required value="${v.nombre ?? ''}">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="pEstado">Estado ${req}</label>
                <select class="form-select" id="pEstado" name="id_estado_proyecto" required>${options(opts, v.id_estado_proyecto ?? '')}</select>
            </div>
            <div class="col-md-4">
                <label class="form-label" for="pPostulacion">Fecha de postulación</label>
                <input class="form-control" type="date" id="pPostulacion" name="fecha_postulacion" value="${v.fecha_postulacion ?? ''}">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="pInicio">Fecha de inicio</label>
                <input class="form-control" type="date" id="pInicio" name="fecha_inicio" value="${v.fecha_inicio ?? ''}">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="pFin">Fecha de término</label>
                <input class="form-control" type="date" id="pFin" name="fecha_fin" value="${v.fecha_fin ?? ''}">
            </div>
            <div class="col-md-6">
                <label class="form-label" for="pResponsable">Responsable</label>
                <input class="form-control" id="pResponsable" name="responsable" maxlength="150" value="${v.responsable ?? ''}">
            </div>
            <div class="col-md-6">
                <label class="form-label" for="pEntidad">Entidad financiante</label>
                <input class="form-control" id="pEntidad" name="entidad_financiante" maxlength="150" value="${v.entidad_financiante ?? ''}">
            </div>
            <div class="col-12">
                <label class="form-label" for="pDesc">Descripción</label>
                <textarea class="form-control" id="pDesc" name="descripcion" rows="3">${v.descripcion ?? ''}</textarea>
            </div>
            <div class="col-12">
                <label class="form-label" for="pObs">Observaciones</label>
                <textarea class="form-control" id="pObs" name="observaciones" rows="2">${v.observaciones ?? ''}</textarea>
            </div>
        </div>`;
}

/** INSERT del proyecto con recuperación segura ante una respuesta perdida. */
async function createProjectSafely(values, knownIds) {
    try {
        return { id: await createProject(values), recovered: false };
    } catch (err) {
        let found = null;
        try { found = findRecoveredProject(values, await queryRecoveredProject(values, knownIds), knownIds); } catch { /* error original */ }
        if (found) return { id: found.id_proyecto, recovered: true };
        throw err;
    }
}

/** knownIds: proyectos existentes al abrir el formulario (para la recuperación). */
export function openCreateProject({ estados, navigate, onCreated, knownIds = [] }) {
    let createdId = null;
    const defaultEstado = estados.find((e) => e.nombre === 'Postulado' && e.activo)?.id ?? '';
    const modal = openModal({
        title: 'Nuevo proyecto de esterilización',
        size: 'modal-lg',
        onHidden: () => { if (createdId) onCreated?.(createdId); },
        body: html`
            <div class="alert alert-info d-flex gap-2 py-2" role="note">
                <i class="bi bi-info-circle" aria-hidden="true"></i>
                <div>Al crear el proyecto se preparará su carpeta en Google Drive con las subcarpetas <strong>Documentación</strong> y <strong>Animales</strong>.</div>
            </div>
            <form id="projectForm" novalidate>
                <div data-form-error hidden></div>
                ${projectFields({ id_estado_proyecto: defaultEstado }, estados)}
                ${formActions('Crear proyecto', 'bi-clipboard2-plus')}
            </form>`,
    });

    bindForm(modal.body.querySelector('#projectForm'), {
        context: 'Creación de proyecto',
        busyLabel: 'Creando…',
        collect: collectProject,
        validate: validateProject,
        submit: async (values) => {
            modal.setBusy(true);
            try {
                return await createProjectSafely(values, knownIds);
            } catch (err) {
                modal.setBusy(false);
                throw err;
            }
        },
        onSuccess: async ({ id: idProyecto, recovered }, values) => {
            createdId = idProyecto;
            const steps = [
                { label: 'Proyecto registrado', status: 'ok',
                    message: recovered ? 'El proyecto ya se había creado en un intento anterior: se continuó con él (sin duplicarlo).' : '' },
                { label: 'Carpeta en Google Drive (Documentación y Animales)', status: 'running' },
            ];
            const draw = stepsPanel(modal, {
                title: values.nombre,
                steps,
                warning: html`El proyecto quedó creado. <strong>No vuelvas a crearlo.</strong> La carpeta de Drive puede prepararse desde su detalle.`,
                goLabel: 'Ver proyecto',
            });
            modal.setBusy(true);
            draw();
            try {
                await createProjectFolder(idProyecto);
                steps[1].status = 'ok';
            } catch (err) {
                steps[1].status = 'error';
                steps[1].message = `${await reportError(err, 'Carpeta Drive del proyecto')} Podrás reintentarlo desde el detalle del proyecto.`;
            }
            modal.setBusy(false);
            draw(true);
            const failed = steps[1].status === 'error';
            toast(failed ? 'Proyecto creado; la carpeta de Drive quedó pendiente.' : 'Proyecto creado correctamente.', failed ? 'warning' : 'success');
            modal.body.querySelector('#stepsGo')?.addEventListener('click', () => {
                createdId = null;
                modal.close();
                navigate(`/esterilizacion/${idProyecto}`);
            });
        },
    });
}

export function openEditProject({ project, estados, onSaved }) {
    const modal = openModal({
        title: 'Editar proyecto',
        size: 'modal-lg',
        body: html`
            <form id="projectEditForm" novalidate>
                <div data-form-error hidden></div>
                ${projectFields(project, estados)}
                ${formActions('Guardar cambios', 'bi-check-lg')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#projectEditForm'), {
        context: 'Edición de proyecto',
        collect: collectProject,
        validate: validateProject,
        submit: async (values) => {
            modal.setBusy(true);
            try { await updateProject(project.id_proyecto, values); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Proyecto actualizado.', 'success');
            await onSaved?.();
        },
    });
}

/** Reintento de la estructura Drive desde el detalle del proyecto. */
export async function retryProjectFolder(button, idProyecto, onDone) {
    const restore = setButtonBusy(button, 'Preparando carpeta…');
    try {
        await createProjectFolder(idProyecto);
        toast('Carpeta del proyecto preparada en Google Drive.', 'success');
        await onDone?.();
    } catch (err) {
        restore();
        toast(await reportError(err, 'Carpeta Drive del proyecto'), 'error');
    }
}

// ============================================================
// Selector de profesionales (N:M) con creación rápida en línea.
// No abre un segundo modal: el formulario principal conserva sus
// valores mientras se crea el profesional (Prompt §25).
// ============================================================

function professionalPicker(form, { professionals, excludeIds = [] }) {
    const root = form.querySelector('[data-prof-picker]');
    const rowsBox = root.querySelector('[data-prof-rows]');
    const quick = root.querySelector('[data-quick]');
    const excluded = new Set(excludeIds.map(String));
    let index = 0;

    const optionList = () => professionals
        .filter((p) => !excluded.has(String(p.id_profesional)))
        .map((p) => ({ value: p.id_profesional, label: `${p.nombre} — ${p.profesion}` }));

    const rowHtml = (preset = {}) => {
        const i = index++;
        return html`
            <div class="allocation-row" data-prof-row>
                <div class="flex-grow-1">
                    <label class="form-label small" for="prProf${i}">Profesional</label>
                    <select class="form-select" id="prProf${i}" data-pr-prof>${options(optionList(), preset.idProfesional ?? '')}</select>
                </div>
                <div class="allocation-amount prof-function">
                    <label class="form-label small" for="prFun${i}">Función</label>
                    <input class="form-control" id="prFun${i}" data-pr-fun list="funcionesSugeridas" maxlength="100" autocomplete="off" value="${preset.funcion ?? ''}">
                </div>
                <button type="button" class="btn btn-outline-secondary btn-icon-sm" data-remove-prof aria-label="Quitar profesional"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
                <div class="invalid-feedback d-block w-100" data-row-error></div>
            </div>`;
    };

    const addRow = (preset) => {
        rowsBox.insertAdjacentHTML('beforeend', String(rowHtml(preset)));
        return rowsBox.lastElementChild;
    };

    const readRows = () => [...rowsBox.querySelectorAll('[data-prof-row]')].map((row) => ({
        idProfesional: Number(row.querySelector('[data-pr-prof]').value) || null,
        funcion: emptyToNull(row.querySelector('[data-pr-fun]').value),
    }));

    const showRowErrors = (result) => {
        rowsBox.querySelectorAll('[data-row-error]').forEach((el) => { el.textContent = ''; });
        const used = [...rowsBox.querySelectorAll('[data-prof-row]')].filter((row) =>
            row.querySelector('[data-pr-prof]').value || row.querySelector('[data-pr-fun]').value.trim());
        Object.entries(result.rows).forEach(([i, msg]) => {
            const el = used[Number(i)]?.querySelector('[data-row-error]');
            if (el) el.textContent = msg;
        });
    };

    root.querySelector('[data-add-prof]').addEventListener('click', () => addRow().querySelector('select').focus());
    rowsBox.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-prof]')) e.target.closest('[data-prof-row]').remove();
    });

    // --- Creación rápida (inserta PROFESIONAL reutilizable) ---
    const toggle = root.querySelector('[data-quick-toggle]');
    const quickError = quick.querySelector('[data-quick-error]');
    const quickField = (name) => quick.querySelector(`[data-q="${name}"]`);
    const closeQuick = () => {
        quick.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        quick.querySelectorAll('[data-q]').forEach((el) => { el.value = ''; el.classList.remove('is-invalid'); });
        quickError.textContent = '';
    };
    toggle.addEventListener('click', () => {
        const open = quick.hidden;
        if (open) {
            quick.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            quickField('nombre').focus();
        } else {
            closeQuick();
        }
    });
    quick.querySelector('[data-quick-cancel]').addEventListener('click', closeQuick);

    let creating = false;
    quick.querySelector('[data-quick-save]').addEventListener('click', async (e) => {
        if (creating) return;
        // Captura antes de bloquear.
        const values = collectProfessional((n) => quickField(n)?.value ?? '');
        const errors = validateProfessional(values);
        quick.querySelectorAll('[data-q]').forEach((el) => el.classList.toggle('is-invalid', Boolean(errors[el.dataset.q])));
        if (Object.keys(errors).length) {
            quickError.textContent = Object.values(errors).join(' ');
            return;
        }
        creating = true;
        const restore = setButtonBusy(e.currentTarget, 'Creando…');
        try {
            // Reintento seguro: si ya existe (p. ej. se perdió la respuesta de un
            // intento anterior), se reutiliza en lugar de duplicar el profesional.
            const existing = findSimilarProfessional(await listProfessionals(), values);
            const prof = existing ?? await createProfessional(values);
            if (!professionals.some((p) => p.id_profesional === prof.id_profesional)) {
                professionals.push(prof);
                professionals.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
                const option = html`<option value="${prof.id_profesional}">${prof.nombre} — ${prof.profesion}</option>`;
                rowsBox.querySelectorAll('[data-pr-prof]').forEach((sel) => sel.insertAdjacentHTML('beforeend', String(option)));
            }
            const emptyRow = [...rowsBox.querySelectorAll('[data-prof-row]')].find((r) => !r.querySelector('[data-pr-prof]').value);
            const row = emptyRow ?? addRow();
            row.querySelector('[data-pr-prof]').value = String(prof.id_profesional);
            restore();
            closeQuick();
            row.querySelector('[data-pr-fun]').focus();
            toast(existing ? `"${prof.nombre}" ya estaba registrado: se seleccionó el existente. Indica su función.`
                : `Profesional "${prof.nombre}" creado. Indica su función.`, existing ? 'info' : 'success');
        } catch (err) {
            restore();
            quickError.textContent = await reportError(err, 'Creación de profesional');
        } finally {
            creating = false;
        }
    });

    addRow();
    return { readRows, showRowErrors };
}

function professionalPickerHtml({ required }) {
    return html`
        <fieldset class="form-section" data-prof-picker>
            <legend>Profesional(es) participante(s) ${required ? req : ''}</legend>
            <p class="small text-secondary mb-1">Una esterilización puede registrar uno o más profesionales, cada uno con su función.
                Los profesionales se reutilizan entre proyectos.</p>
            <div data-prof-rows></div>
            <datalist id="funcionesSugeridas">${FUNCIONES_SUGERIDAS.map((f) => html`<option value="${f}"></option>`)}</datalist>
            <div class="d-flex flex-wrap gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-primary" data-add-prof><i class="bi bi-plus-lg" aria-hidden="true"></i> Agregar otro profesional</button>
                <button type="button" class="btn btn-sm btn-link" data-quick-toggle aria-expanded="false" aria-controls="quickProf">
                    <i class="bi bi-person-plus" aria-hidden="true"></i> ¿No está en la lista? Crear profesional</button>
            </div>
            <div class="quick-create mt-2" id="quickProf" data-quick hidden>
                <p class="small fw-semibold mb-2">Nuevo profesional (quedará disponible para otros proyectos)</p>
                <div class="row g-2">
                    <div class="col-md-6"><label class="form-label small" for="qpNombre">Nombre ${req}</label>
                        <input class="form-control form-control-sm" id="qpNombre" data-q="nombre" maxlength="150" autocomplete="off"></div>
                    <div class="col-md-6"><label class="form-label small" for="qpProfesion">Profesión ${req}</label>
                        <input class="form-control form-control-sm" id="qpProfesion" data-q="profesion" maxlength="100" placeholder="Ej.: Médico veterinario"></div>
                    <div class="col-md-6"><label class="form-label small" for="qpTelefono">Teléfono</label>
                        <input class="form-control form-control-sm" id="qpTelefono" data-q="telefono" maxlength="30" inputmode="tel"></div>
                    <div class="col-md-6"><label class="form-label small" for="qpEmail">Correo</label>
                        <input class="form-control form-control-sm" id="qpEmail" data-q="email" type="email" maxlength="254"></div>
                </div>
                <div class="invalid-feedback d-block" data-quick-error role="alert"></div>
                <div class="d-flex gap-2 mt-2">
                    <button type="button" class="btn btn-sm btn-primary" data-quick-save><i class="bi bi-check-lg" aria-hidden="true"></i> Crear y agregar</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-quick-cancel>Cancelar</button>
                </div>
            </div>
        </fieldset>`;
}

// ============================================================
// Nómina: agregar animal (datos + profesionales + documento)
// ============================================================

function entryFields(v, catalogs, { lockCode = false } = {}) {
    const especies = selectable(catalogs.especie, v.id_especie).map((r) => ({ value: r.id, label: r.nombre }));
    const rangos = selectable(catalogs.rango_etario, v.id_rango_etario).map((r) => ({ value: r.id, label: r.nombre }));
    return html`
        <p class="form-hint"><span class="text-danger">*</span> Campo obligatorio. El resto es opcional.</p>
        <fieldset class="form-section">
            <legend>Identificación en el proyecto</legend>
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label" for="eCodigo">Código ${req}</label>
                    <input class="form-control" id="eCodigo" name="codigo" maxlength="50" required autocomplete="off"
                           value="${v.codigo ?? ''}" ${lockCode ? 'readonly' : ''} aria-describedby="eCodigoHelp">
                    <div class="form-text" id="eCodigoHelp">${lockCode
                        ? 'No se modifica porque el documento de esterilización ya fue guardado con este código.'
                        : 'Código interno del proyecto (no es el microchip). Puedes editarlo.'}</div>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eMicrochip">Microchip</label>
                    <input class="form-control" id="eMicrochip" name="microchip" inputmode="numeric" maxlength="15" autocomplete="off"
                           value="${v.microchip ?? ''}" aria-describedby="eMicrochipHelp">
                    <div class="form-text" id="eMicrochipHelp">15 dígitos, sin espacios ni guiones.</div>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eRegistro">Registro Nacional</label>
                    <select class="form-select" id="eRegistro" name="estado_registro_nacional">${options(REGISTRO_NACIONAL, v.estado_registro_nacional, { placeholder: 'Sin información' })}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eEspecie">Especie ${req}</label>
                    <select class="form-select" id="eEspecie" name="id_especie" required>${options(especies, v.id_especie)}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eSexo">Sexo ${req}</label>
                    <select class="form-select" id="eSexo" name="sexo" required>${options(SEXOS, v.sexo)}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eRango">Rango etario</label>
                    <select class="form-select" id="eRango" name="id_rango_etario">${options(rangos, v.id_rango_etario, { placeholder: 'Sin indicar' })}</select>
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="eNacimiento">Fecha de nacimiento</label>
                    <input class="form-control" type="date" id="eNacimiento" name="fecha_nacimiento" value="${v.fecha_nacimiento ?? ''}">
                </div>
                <div class="col-md-8">
                    <label class="form-label" for="eSector">Sector de origen</label>
                    <input class="form-control" id="eSector" name="sector_origen" maxlength="255" value="${v.sector_origen ?? ''}">
                </div>
            </div>
        </fieldset>
        <fieldset class="form-section">
            <legend>Esterilización</legend>
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label" for="eFecha">Fecha de esterilización</label>
                    <input class="form-control" type="date" id="eFecha" name="fecha_esterilizacion" value="${v.fecha_esterilizacion ?? ''}">
                </div>
                <div class="col-md-8">
                    <label class="form-label" for="eLugar">Lugar de esterilización</label>
                    <input class="form-control" id="eLugar" name="lugar_esterilizacion" maxlength="255" value="${v.lugar_esterilizacion ?? ''}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="eCaract">Características</label>
                    <textarea class="form-control" id="eCaract" name="caracteristicas" rows="2">${v.caracteristicas ?? ''}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="eObs">Observaciones</label>
                    <textarea class="form-control" id="eObs" name="observaciones" rows="2">${v.observaciones ?? ''}</textarea>
                </div>
            </div>
        </fieldset>`;
}

function documentFieldsHtml({ prefix = 'e' } = {}) {
    return html`
        <div class="row g-3">
            <div class="col-md-8">
                <label class="form-label" for="${prefix}Doc">Documento de esterilización ${req}</label>
                <input class="form-control" type="file" id="${prefix}Doc" name="documento" accept="${DOC_ACCEPT}" required aria-describedby="${prefix}DocHelp">
                <div class="form-text" id="${prefix}DocHelp">PDF o fotografía del documento (JPG, PNG o WebP), máximo ${DOC_MAX_BYTES / (1024 * 1024)} MB.
                    Se guardará en la carpeta <em>Animales</em> del proyecto con el código como nombre.</div>
            </div>
            <div class="col-md-4">
                <label class="form-label" for="${prefix}DocFecha">Fecha del documento</label>
                <input class="form-control" type="date" id="${prefix}DocFecha" name="doc_fecha">
            </div>
        </div>`;
}

/**
 * entries: nómina actual del proyecto (para sugerir código y validar duplicados).
 * idCategoriaDoc: id de "Documento de esterilización".
 */
export function openAddEntry({ project, entries, catalogs, professionals, idCategoriaDoc, onDone }) {
    let created = false;
    const modal = openModal({
        title: 'Agregar animal a la nómina',
        size: 'modal-lg',
        onHidden: () => { if (created) onDone?.(); },
        body: html`
            <div class="alert alert-info d-flex gap-2 py-2" role="note">
                <i class="bi bi-info-circle" aria-hidden="true"></i>
                <div>Este registro pertenece solo al proyecto <strong>${project.nombre}</strong>; no se incorpora al módulo Animales (rescate y adopción).</div>
            </div>
            <form id="entryForm" novalidate>
                <div data-form-error hidden></div>
                ${entryFields({ codigo: suggestNextCode(entries.map((e) => e.codigo)), fecha_esterilizacion: todayISO() }, catalogs)}
                ${professionalPickerHtml({ required: true })}
                <fieldset class="form-section">
                    <legend>Documento de esterilización</legend>
                    ${documentFieldsHtml()}
                </fieldset>
                ${formActions('Agregar a la nómina', 'bi-clipboard2-plus')}
            </form>`,
    });
    const form = modal.body.querySelector('#entryForm');
    const picker = professionalPicker(form, { professionals });

    bindForm(form, {
        context: 'Alta en nómina',
        busyLabel: 'Registrando…',
        // El File del documento y las filas se capturan aquí, antes de bloquear el botón.
        collect: (fd) => ({
            values: collectEntry(fd),
            rows: picker.readRows().filter((r) => r.idProfesional || r.funcion),
            documento: fd.get('documento'),
            fechaDocumento: emptyToNull(fd.get('doc_fecha')),
        }),
        validate: ({ values, rows, documento, fechaDocumento }) => {
            const errors = validateEntry(values, entries);
            const docError = validateDocumentFile(documento);
            if (docError) errors.documento = docError;
            if (fechaDocumento && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDocumento)) errors.doc_fecha = 'La fecha no es válida.';
            const rowCheck = validateProfessionalRows(rows, { required: true });
            picker.showRowErrors(rowCheck);
            if (hasRowErrors(rowCheck)) errors._form = rowCheck.general ?? 'Revisa los profesionales participantes.';
            return errors;
        },
        submit: async (data) => {
            modal.setBusy(true);
            try {
                // Verificación de contenido ANTES de crear cualquier registro.
                data.prepared = await prepareDocument(data.documento);
                return await createEntrySafely(project.id_proyecto, data.values);
            } catch (err) {
                modal.setBusy(false);
                throw err;
            }
        },
        onSuccess: async ({ id: idEntry, recovered }, { values, rows, prepared, fechaDocumento }) => {
            created = true;
            const profName = (id) => professionals.find((p) => p.id_profesional === id)?.nombre ?? 'Profesional';
            const steps = [
                { key: 'entry', label: `Animal ${values.codigo} agregado a la nómina`, status: 'ok',
                    message: recovered ? 'El registro ya se había creado en un intento anterior: se continuó con él (sin duplicarlo).' : '' },
                ...rows.map((r) => ({ key: 'prof', row: r, label: `Profesional: ${profName(r.idProfesional)} (${r.funcion})`, status: 'pending' })),
                { key: 'doc', label: `Documento → Animales/${values.codigo}${prepared.type.extension}`, status: 'pending' },
            ];
            const draw = stepsPanel(modal, {
                title: `Nómina de ${project.nombre}`,
                steps,
                warning: html`El animal quedó registrado en la nómina. <strong>No vuelvas a agregarlo.</strong>
                    Lo pendiente puede completarse desde la nómina (<em>Profesionales</em> o <em>Adjuntar documento</em>).`,
            });
            modal.setBusy(true);
            draw();
            await runEntryCompletion({ idEntry, steps, draw, prepared, idCategoriaDoc, fechaDocumento });
            modal.setBusy(false);
            draw(true);
            const failed = steps.some((s) => s.status === 'error');
            toast(failed ? 'Animal agregado a la nómina con tareas pendientes.' : 'Animal agregado a la nómina.', failed ? 'warning' : 'success');
        },
    });
}

/**
 * INSERT del animal de la nómina con recuperación segura: si falla (red,
 * respuesta perdida o código ya usado), se busca por código y, solo si el
 * registro existente tiene exactamente los mismos datos, se continúa con él.
 */
async function createEntrySafely(idProyecto, values) {
    try {
        return { id: await createEntry(idProyecto, values), recovered: false };
    } catch (err) {
        let existing = null;
        try { existing = await findEntryByCode(idProyecto, values.codigo); } catch { /* se informa el error original */ }
        if (existing && isSameEntry(values, existing)) return { id: existing.id_animal_esterilizacion, recovered: true };
        throw err;
    }
}

/** Pasos 4 y 5 del alta; cada uno omite lo que ya existe (reintento sin duplicados). */
async function runEntryCompletion({ idEntry, steps, draw, prepared, idCategoriaDoc, fechaDocumento }) {
    const profSteps = steps.filter((s) => s.key === 'prof');
    let linked = [];
    try {
        linked = (await listEntryLinks(idEntry)).map((l) => l.id_profesional);
    } catch { /* si no se puede consultar, la restricción única evita duplicados */ }
    const plan = pendingLinks(profSteps.map((s) => s.row), linked);
    for (const [i, step] of profSteps.entries()) {
        step.status = 'running';
        draw();
        if (plan[i].alreadyLinked) {
            step.status = 'ok';
            step.message = 'Ya estaba asociado.';
        } else {
            try {
                await linkProfessional(idEntry, step.row.idProfesional, step.row.funcion);
                step.status = 'ok';
            } catch (err) {
                step.status = 'error';
                step.message = await reportError(err, 'Relación con profesional');
            }
        }
        draw();
    }
    const docStep = steps.find((s) => s.key === 'doc');
    docStep.status = 'running';
    draw();
    try {
        if ((await countEntryFiles(idEntry)) > 0) {
            docStep.message = 'Ya existía un documento registrado: no se volvió a subir.';
        } else {
            await uploadFile('esterilizacion', idEntry, {
                archivo: prepared.file, idCategoria: idCategoriaDoc, fechaDocumento, descripcion: null,
            });
        }
        docStep.status = 'ok';
    } catch (err) {
        docStep.status = 'error';
        docStep.message = `${await reportError(err, 'Documento de esterilización')} Podrás adjuntarlo desde la nómina.`;
    }
}

// ------------------------------------------------------------
// Editar datos de un animal de la nómina
// ------------------------------------------------------------
export function openEditEntry({ entry, others, catalogs, onSaved }) {
    const lockCode = documentStatus(entry).exists;
    const modal = openModal({
        title: `Editar ${entry.codigo}`,
        size: 'modal-lg',
        body: html`
            <form id="entryEditForm" novalidate>
                <div data-form-error hidden></div>
                ${entryFields(entry, catalogs, { lockCode })}
                <p class="small text-secondary">Los profesionales y el documento de esterilización se gestionan desde la nómina.</p>
                ${formActions('Guardar cambios', 'bi-check-lg')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#entryEditForm'), {
        context: 'Edición de nómina',
        collect: (fd) => {
            const v = collectEntry(fd);
            if (lockCode) v.codigo = entry.codigo;
            return v;
        },
        validate: (v) => validateEntry(v, others),
        submit: async (v) => {
            modal.setBusy(true);
            try { await updateEntry(entry.id_animal_esterilizacion, v); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Datos de la nómina actualizados.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Profesionales de una esterilización:
//   - corregir la función (UPDATE permitido por RLS);
//   - quitar una asociación ingresada por error (RPC
//     quitar_profesional_esterilizacion: solo la relación, nunca el
//     profesional; no permite dejar al animal sin profesionales);
//   - agregar otros profesionales.
// ------------------------------------------------------------
export function openEntryProfessionals({ entry, professionals, onSaved }) {
    let changed = false;
    const links = entry.profesionales ?? [];
    const existingIds = links.map((r) => r.id_profesional);
    const modal = openModal({
        title: `Profesionales de ${entry.codigo}`,
        size: 'modal-lg',
        onHidden: () => { if (changed) onSaved?.(); },
        body: html`
            ${links.length ? html`
            <section class="mb-3" aria-labelledby="linksTitle">
                <h3 class="h6 fw-bold" id="linksTitle">Asociados actualmente</h3>
                <p class="small text-secondary mb-2">Puedes corregir la función o quitar una asociación ingresada por error.
                    El registro del profesional y sus demás participaciones no cambian. Siempre debe quedar al menos un profesional.</p>
                <ul class="list-unstyled mb-0">${links.map((r) => html`
                    <li class="allocation-row" data-link="${r.id_esterilizacion_profesional}">
                        <div class="flex-grow-1">
                            <div class="fw-semibold">${r.profesional?.nombre ?? '—'}</div>
                            <div class="small text-secondary">${r.profesional?.profesion ?? ''}</div>
                        </div>
                        <div class="allocation-amount prof-function">
                            <label class="form-label small" for="lf${r.id_esterilizacion_profesional}">Función</label>
                            <input class="form-control" id="lf${r.id_esterilizacion_profesional}" data-link-fun list="funcionesSugeridasEdit"
                                maxlength="100" autocomplete="off" value="${r.funcion}" data-original="${r.funcion}">
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-save-link disabled>
                            <i class="bi bi-check-lg" aria-hidden="true"></i> Guardar</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-remove-link ${links.length <= 1 ? 'disabled' : ''}
                            ${links.length <= 1 ? html`title="Agrega primero el profesional correcto: siempre debe quedar al menos uno."` : ''}>
                            <i class="bi bi-person-x" aria-hidden="true"></i> Quitar</button>
                        <div class="w-100 remove-confirm" data-remove-confirm hidden>
                            <span class="small">¿Quitar a <strong>${r.profesional?.nombre ?? 'este profesional'}</strong> de ${entry.codigo}? El profesional seguirá registrado.</span>
                            <button type="button" class="btn btn-sm btn-danger" data-remove-yes>Sí, quitar</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-remove-no>Cancelar</button>
                        </div>
                        <div class="invalid-feedback d-block w-100" data-row-error></div>
                    </li>`)}</ul>
                <datalist id="funcionesSugeridasEdit">${FUNCIONES_SUGERIDAS.map((f) => html`<option value="${f}"></option>`)}</datalist>
            </section>` : ''}
            <form id="addProfForm" novalidate>
                <div data-form-error hidden></div>
                ${professionalPickerHtml({ required: true })}
                ${formActions('Agregar profesional(es)', 'bi-person-plus')}
            </form>`,
    });

    // --- Corrección de función (una asociación a la vez) ---
    modal.body.querySelectorAll('[data-link]').forEach((row) => {
        const input = row.querySelector('[data-link-fun]');
        const button = row.querySelector('[data-save-link]');
        const errorBox = row.querySelector('[data-row-error]');
        input.addEventListener('input', () => { button.disabled = input.value.trim() === input.dataset.original; });
        button.addEventListener('click', async () => {
            const funcion = input.value.trim();   // capturado antes de bloquear
            const error = validateFunction(funcion);
            errorBox.textContent = error ?? '';
            if (error) return;
            const restore = setButtonBusy(button, 'Guardando…');
            modal.setBusy(true);
            try {
                await updateLinkFunction(Number(row.dataset.link), funcion);
                changed = true;
                input.dataset.original = funcion;
                restore();
                button.disabled = true;
                toast('Función actualizada.', 'success');
            } catch (err) {
                restore();
                errorBox.textContent = await reportError(err, 'Corregir función');
            } finally {
                modal.setBusy(false);
            }
        });
    });

    // --- Quitar asociación (confirmación en línea; sin modales anidados) ---
    modal.body.querySelectorAll('[data-link]').forEach((row) => {
        const removeBtn = row.querySelector('[data-remove-link]');
        const confirmBox = row.querySelector('[data-remove-confirm]');
        const errorBox = row.querySelector('[data-row-error]');
        removeBtn.addEventListener('click', () => { confirmBox.hidden = false; row.querySelector('[data-remove-yes]').focus(); });
        row.querySelector('[data-remove-no]').addEventListener('click', () => { confirmBox.hidden = true; removeBtn.focus(); });
        row.querySelector('[data-remove-yes]').addEventListener('click', async (e) => {
            const restore = setButtonBusy(e.currentTarget, 'Quitando…');
            modal.setBusy(true);
            try {
                await removeProfessionalLink(Number(row.dataset.link));
                changed = true;
                modal.setBusy(false);
                modal.close();
                toast('Asociación quitada. El profesional sigue registrado.', 'success');
            } catch (err) {
                restore();
                modal.setBusy(false);
                errorBox.textContent = await reportError(err, 'Quitar asociación');
            }
        });
    });

    // --- Agregar nuevas asociaciones ---
    const form = modal.body.querySelector('#addProfForm');
    const picker = professionalPicker(form, { professionals, excludeIds: existingIds });
    bindForm(form, {
        context: 'Agregar profesional',
        collect: () => ({ rows: picker.readRows().filter((r) => r.idProfesional || r.funcion) }),
        validate: ({ rows }) => {
            const check = validateProfessionalRows(rows, { required: true, existingIds });
            picker.showRowErrors(check);
            return hasRowErrors(check) ? { _form: check.general ?? 'Revisa los profesionales indicados.' } : null;
        },
        submit: async ({ rows }) => {
            modal.setBusy(true);
            const results = [];
            try {
                // Reintento seguro: se omiten las asociaciones que ya existan en la BD.
                const current = (await listEntryLinks(entry.id_animal_esterilizacion)).map((l) => l.id_profesional);
                for (const r of pendingLinks(rows, current)) {
                    if (r.alreadyLinked) { results.push({ ok: true, r, skipped: true }); continue; }
                    try {
                        await linkProfessional(entry.id_animal_esterilizacion, r.idProfesional, r.funcion);
                        changed = true;
                        results.push({ ok: true, r });
                    } catch (err) {
                        results.push({ ok: false, r, message: await reportError(err, 'Relación con profesional') });
                    }
                }
            } finally {
                modal.setBusy(false);
            }
            return results;
        },
        onSuccess: async (results) => {
            const failed = results.filter((x) => !x.ok);
            if (failed.length === 0) {
                changed = true;
                modal.close();
                toast('Profesional(es) asociado(s).', 'success');
                return;
            }
            const name = (id) => professionals.find((p) => p.id_profesional === id)?.nombre ?? 'Profesional';
            render(modal.body, html`
                <ul class="list-unstyled">${results.map((x) => html`<li class="post-step">${stepIcon(x.ok ? 'ok' : 'error')}
                    <span>${name(x.r.idProfesional)} (${x.r.funcion})</span>
                    ${x.ok ? '' : html`<div class="small text-secondary ms-4 w-100">${x.message}</div>`}</li>`)}</ul>
                <div class="alert alert-warning py-2" role="alert">Algunas relaciones no se registraron. Las marcadas como completadas ya quedaron guardadas.</div>
                <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-close>Cerrar</button></div>`);
        },
    });
}

// ------------------------------------------------------------
// Adjuntar documento (solo cuando no existe; sin reemplazo en MVP).
// La unicidad y el tipo se verifican también en el servidor.
// ------------------------------------------------------------
export function openAttachDocument({ entry, idCategoriaDoc, onSaved }) {
    const modal = openModal({
        title: `Adjuntar documento — ${entry.codigo}`,
        body: html`
            <form id="attachDocForm" novalidate>
                <div data-form-error hidden></div>
                ${documentFieldsHtml({ prefix: 'a' })}
                <div class="upload-progress mt-3" id="docProgress" hidden role="status">
                    <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
                    Subiendo a Google Drive… No cierres esta ventana.
                </div>
                ${formActions('Adjuntar documento', 'bi-cloud-arrow-up')}
            </form>`,
    });
    const form = modal.body.querySelector('#attachDocForm');
    const progress = form.querySelector('#docProgress');
    bindForm(form, {
        context: 'Adjuntar documento de esterilización',
        busyLabel: 'Subiendo…',
        collect: (fd) => ({ documento: fd.get('documento'), fechaDocumento: emptyToNull(fd.get('doc_fecha')) }),
        validate: ({ documento }) => {
            const error = validateDocumentFile(documento);
            return error ? { documento: error } : null;
        },
        submit: async ({ documento, fechaDocumento }) => {
            modal.setBusy(true);
            progress.hidden = false;
            try {
                const prepared = await prepareDocument(documento);
                // Aviso anticipado (el servidor también lo impide).
                if ((await countEntryFiles(entry.id_animal_esterilizacion)) > 0) {
                    throw new AppError('Esta esterilización ya tiene un documento registrado. Cierra esta ventana para ver la nómina actualizada y usa "Abrir documento".');
                }
                return await uploadFile('esterilizacion', entry.id_animal_esterilizacion, {
                    archivo: prepared.file, idCategoria: idCategoriaDoc, fechaDocumento, descripcion: null,
                });
            } finally {
                modal.setBusy(false);
                progress.hidden = true;
            }
        },
        onSuccess: async () => {
            modal.close();
            toast('Documento de esterilización guardado en Google Drive.', 'success');
            await onSaved?.();
        },
        onError: async (err, message) => {
            // Si otro intento lo registró, se actualiza la nómina para mostrar "Abrir documento".
            const box = form.querySelector('[data-form-error]');
            box.hidden = false;
            render(box, html`<div class="alert alert-danger" role="alert">${message}</div>`);
            if (/ya tiene un documento/i.test(message)) await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Profesional (crear / editar) — registro reutilizable
// ------------------------------------------------------------
export function openProfessionalForm({ professional = null, onSaved }) {
    const v = professional ?? {};
    const modal = openModal({
        title: professional ? 'Editar profesional' : 'Nuevo profesional',
        body: html`
            <form id="profForm" novalidate>
                <div data-form-error hidden></div>
                <p class="form-hint"><span class="text-danger">*</span> Campo obligatorio.</p>
                <div class="row g-3">
                    <div class="col-md-6"><label class="form-label" for="pfNombre">Nombre ${req}</label>
                        <input class="form-control" id="pfNombre" name="nombre" maxlength="150" required value="${v.nombre ?? ''}"></div>
                    <div class="col-md-6"><label class="form-label" for="pfProfesion">Profesión ${req}</label>
                        <input class="form-control" id="pfProfesion" name="profesion" maxlength="100" required value="${v.profesion ?? ''}" placeholder="Ej.: Médico veterinario"></div>
                    <div class="col-md-6"><label class="form-label" for="pfTelefono">Teléfono</label>
                        <input class="form-control" id="pfTelefono" name="telefono" maxlength="30" inputmode="tel" value="${v.telefono ?? ''}"></div>
                    <div class="col-md-6"><label class="form-label" for="pfEmail">Correo</label>
                        <input class="form-control" id="pfEmail" name="email" type="email" maxlength="254" value="${v.email ?? ''}"></div>
                    <div class="col-12"><label class="form-label" for="pfObs">Observaciones</label>
                        <textarea class="form-control" id="pfObs" name="observaciones" rows="2">${v.observaciones ?? ''}</textarea></div>
                </div>
                ${formActions(professional ? 'Guardar cambios' : 'Crear profesional', 'bi-check-lg')}
            </form>`,
    });
    bindForm(modal.body.querySelector('#profForm'), {
        context: 'Profesional',
        collect: (fd) => collectProfessional((n) => fd.get(n)),
        validate: validateProfessional,
        submit: async (values) => {
            modal.setBusy(true);
            try {
                if (professional) {
                    await updateProfessional(professional.id_profesional, values);
                } else {
                    // Evita duplicar el registro global (p. ej. al reintentar tras perder la respuesta).
                    const similar = findSimilarProfessional(await listProfessionals(), values);
                    if (similar) throw new AppError(`Ya existe el profesional "${similar.nombre}" (${similar.profesion}). Puedes asociarlo desde la nómina.`);
                    await createProfessional(values);
                }
            } finally {
                modal.setBusy(false);
            }
        },
        onSuccess: async () => {
            modal.close();
            toast(professional ? 'Profesional actualizado.' : 'Profesional creado. Podrás asociarlo al agregar animales a la nómina.', 'success');
            await onSaved?.();
        },
    });
}

// ------------------------------------------------------------
// Detalle (solo lectura) de un animal de la nómina
// ------------------------------------------------------------
export function openEntryDetail({ entry }) {
    const doc = documentStatus(entry);
    const item = (label, value) => html`<div class="info-block"><dt>${label}</dt><dd>${displayText(value)}</dd></div>`;
    const modal = openModal({
        title: `Nómina — ${entry.codigo}`,
        size: 'modal-lg',
        body: html`
            <dl class="info-grid">
                ${item('Código', entry.codigo)}
                ${item('Microchip', entry.microchip)}
                ${item('Registro Nacional', entry.estado_registro_nacional)}
                ${item('Especie', entry.especie?.nombre)}
                ${item('Sexo', entry.sexo)}
                ${item('Rango etario', entry.rango?.nombre)}
                ${item('Fecha de nacimiento', entry.fecha_nacimiento ? formatDate(entry.fecha_nacimiento) : null)}
                ${item('Sector de origen', entry.sector_origen)}
                ${item('Fecha de esterilización', entry.fecha_esterilizacion ? formatDate(entry.fecha_esterilizacion) : null)}
                ${item('Lugar de esterilización', entry.lugar_esterilizacion)}
            </dl>
            <dl class="info-text mb-3">
                ${item('Características', entry.caracteristicas)}
                ${item('Observaciones', entry.observaciones)}
            </dl>
            <h3 class="h6 fw-bold">Profesionales</h3>
            ${(entry.profesionales ?? []).length
                ? html`<ul class="mb-3">${entry.profesionales.map((r) => html`<li>${r.profesional?.nombre ?? '—'} — ${r.funcion}
                    <span class="text-secondary small">(${r.profesional?.profesion ?? ''})</span></li>`)}</ul>`
                : html`<p class="small text-secondary">Sin profesionales asociados.</p>`}
            <h3 class="h6 fw-bold">Documento de esterilización</h3>
            ${doc.exists
                ? html`<p class="mb-0"><button type="button" class="btn btn-sm btn-outline-primary" data-open-doc="${doc.latest.id_archivo}">
                    <i class="bi ${documentIcon(doc.latest.mime_type)}" aria-hidden="true"></i> Abrir documento</button>
                    <span class="small text-secondary ms-2">Cargado: ${formatDateTime(doc.latest.fecha_carga)}</span></p>`
                : html`<p class="small text-warning-emphasis mb-0"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Documento pendiente.</p>`}
            <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-close>Cerrar</button></div>`,
    });
    modal.body.querySelector('[data-open-doc]')?.addEventListener('click', (e) => openFile(e.currentTarget, Number(e.currentTarget.dataset.openDoc)));
}

