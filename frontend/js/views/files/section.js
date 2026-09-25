// ============================================================
// Sección de archivos reutilizable (Google Drive vía Edge Functions).
//
// Se usa en la ficha del animal (contexto 'animal'), en el detalle
// de una adopción ('adopcion') y de un gasto ('gasto'). Cada contexto
// lista SOLO sus propias asociaciones (animal_archivo, adopcion_archivo,
// gasto_archivo), manteniendo separados los documentos.
//
// - Subir: subir-archivo-drive (multipart). El archivo y los datos se
//   capturan antes de bloquear el botón (REG-06, REG-07).
// - Abrir: obtener-link-archivo → data.archivo.url (visor de Drive).
//   No se muestran id_externo ni rutas internas.
// ============================================================

import { loadCatalog, selectable } from '../../api/catalogs.js';
import { getFileLink, listFiles, uploadFile } from '../../api/files.js';
import { reportError } from '../../core/errors.js';
import { bindForm } from '../../core/forms.js';
import { emptyToNull, formatDate, formatDateTime } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, openModal, options, render, setButtonBusy, toast } from '../../core/ui.js';
import { MAX_FILE_BYTES, SUGGESTED_CATEGORY, formatBytes, validateUpload } from './logic.js';

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

const ICONS = {
    'application/pdf': 'bi-file-earmark-pdf',
    'image/': 'bi-file-earmark-image',
    'video/': 'bi-file-earmark-play',
    'text/': 'bi-file-earmark-text',
};
const fileIcon = (mime = '') => Object.entries(ICONS).find(([k]) => String(mime).startsWith(k))?.[1] ?? 'bi-file-earmark';

/**
 * options:
 *   context, idContext
 *   title, emptyText
 *   uploadBlocked: texto si no se puede subir (p. ej. falta carpeta Drive) o null
 */
export async function renderFilesSection(container, { context, idContext, title = 'Archivos', emptyText = '', uploadBlocked = null }) {
    // Recargar solo esta sección (no toda la vista) después de subir un archivo.
    const reload = () => renderFilesSection(container, { context, idContext, title, emptyText, uploadBlocked });
    render(container, loadingState('Cargando archivos…'));
    let files;
    try {
        files = await listFiles(context, idContext);
    } catch (err) {
        render(container, errorState({ text: await reportError(err, 'Archivos'), retryId: `retryFiles-${context}` }));
        container.querySelector(`#retryFiles-${context}`)?.addEventListener('click', reload);
        return;
    }

    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h3 class="h6 fw-bold mb-0">${title}</h3>
                <p class="small text-secondary mb-0">Se almacenan en Google Drive de la Fundación y se abren en su visor (acceso privado).</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-upload ${uploadBlocked ? 'disabled' : ''}>
                <i class="bi bi-cloud-arrow-up" aria-hidden="true"></i> Subir archivo</button>
        </div>
        ${uploadBlocked ? html`<p class="small text-warning-emphasis"><i class="bi bi-info-circle" aria-hidden="true"></i> ${uploadBlocked}</p>` : ''}
        ${files.length === 0
            ? emptyState({ icon: 'bi-folder2-open', title: 'Sin archivos', text: emptyText })
            : html`<ul class="file-list">${files.map((f) => html`
                <li class="file-item">
                    <i class="bi ${fileIcon(f.mime_type)} file-icon" aria-hidden="true"></i>
                    <div class="file-info">
                        <div class="fw-semibold text-break">${f.nombre_original ?? f.nombre_archivo}</div>
                        <div class="small text-secondary">
                            ${f.categoria?.nombre ?? 'Sin categoría'}
                            · Documento: ${formatDate(f.fecha_documento)} · Cargado: ${formatDateTime(f.fecha_carga)}
                        </div>
                        ${f.descripcion ? html`<div class="small pre-line">${f.descripcion}</div>` : ''}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-open="${f.id_archivo}">
                        <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Abrir en Drive</button>
                </li>`)}</ul>`}`);

    container.querySelector('[data-upload]')?.addEventListener('click', () => openUploadForm({ context, idContext, onSaved: reload }));
    container.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openFile(btn, Number(btn.dataset.open))));
}

/** Abre un archivo en una pestaña nueva usando el enlace privado de Drive. */
export async function openFile(button, idArchivo) {
    if (button.disabled) return;
    // La pestaña se abre en el mismo clic para evitar el bloqueo de ventanas emergentes.
    const tab = window.open('about:blank', '_blank');
    const restore = setButtonBusy(button, 'Abriendo…');
    try {
        const url = await getFileLink(idArchivo);
        if (tab) {
            // Seguridad: la pestaña de Drive no puede acceder a esta aplicación mediante window.opener.
            tab.opener = null;
            tab.location.replace(url);
        } else {
            // El navegador bloqueó la ventana emergente: se ofrece un enlace directo.
            toast(html`El navegador bloqueó la ventana nueva.
                <a href="${url}" target="_blank" rel="noopener noreferrer">Abrir el archivo en Google Drive</a>`, 'warning', { delay: 20000 });
        }
    } catch (err) {
        tab?.close();
        toast(await reportError(err, 'Abrir archivo'), 'error');
    } finally {
        restore();
    }
}

/** Formulario de carga (también lo usa el módulo Documentos para el contexto Fundación). */
export async function openUploadForm({ context, idContext, onSaved }) {
    let categorias;
    try {
        categorias = selectable(await loadCatalog('categoria_archivo'));
    } catch (err) {
        toast(await reportError(err, 'Categorías de archivo'), 'error');
        return;
    }
    // Se preselecciona la categoría más probable según el contexto; la usuaria puede cambiarla.
    const suggested = categorias.find((c) => c.nombre === SUGGESTED_CATEGORY[context])?.id ?? '';
    const modal = openModal({
        title: 'Subir archivo a Google Drive',
        body: html`
            <form id="uploadForm" novalidate>
                <div data-form-error hidden></div>
                <div class="mb-3">
                    <label class="form-label" for="upArchivo">Archivo ${req}</label>
                    <input class="form-control" type="file" id="upArchivo" name="archivo" required aria-describedby="upArchivoHelp">
                    <div class="form-text" id="upArchivoHelp">Máximo ${formatBytes(MAX_FILE_BYTES)}. Fotografías, videos cortos o documentos.</div>
                </div>
                <div class="row g-3">
                    <div class="col-md-7">
                        <label class="form-label" for="upCategoria">Categoría ${req}</label>
                        <select class="form-select" id="upCategoria" name="categoria" required>
                            ${options(categorias.map((c) => ({ value: c.id, label: c.nombre })), suggested)}
                        </select>
                    </div>
                    <div class="col-md-5">
                        <label class="form-label" for="upFecha">Fecha del documento</label>
                        <input class="form-control" type="date" id="upFecha" name="fecha_documento">
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="upDesc">Descripción</label>
                        <textarea class="form-control" id="upDesc" name="descripcion" rows="2"></textarea>
                    </div>
                </div>
                <div class="upload-progress mt-3" id="upProgress" hidden role="status">
                    <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
                    Subiendo a Google Drive… No cierres esta ventana.
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-cloud-arrow-up" aria-hidden="true"></i> Subir archivo</button>
                </div>
            </form>`,
    });
    const form = modal.body.querySelector('#uploadForm');
    const progress = form.querySelector('#upProgress');

    bindForm(form, {
        context: 'Subida de archivo',
        busyLabel: 'Subiendo…',
        // El File se captura aquí, antes de bloquear el botón.
        collect: (fd) => ({
            archivo: fd.get('archivo'),
            idCategoria: Number(fd.get('categoria')) || null,
            fechaDocumento: emptyToNull(fd.get('fecha_documento')),
            descripcion: emptyToNull(fd.get('descripcion')),
        }),
        validate: validateUpload,
        submit: async (v) => {
            modal.setBusy(true);
            progress.hidden = false;
            try { return await uploadFile(context, idContext, v); } finally { modal.setBusy(false); progress.hidden = true; }
        },
        onSuccess: async () => {
            modal.close();
            toast('Archivo subido a Google Drive.', 'success');
            await onSaved?.();
        },
    });
}

