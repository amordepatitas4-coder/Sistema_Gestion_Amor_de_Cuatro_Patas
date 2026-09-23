// ============================================================
// Pestañas de la ficha: Adopción, Gastos, Archivos y Difusión.
// ============================================================

import { listAdopters, listAdoptionsByAnimal } from '../../../api/adoptions.js';
import { createDriveFolder, listAnimals } from '../../../api/animals.js';
import { loadCatalog } from '../../../api/catalogs.js';
import { listExpensesByAnimal } from '../../../api/expenses.js';
import { adoptionBadge } from '../../../core/badges.js';
import { reportError } from '../../../core/errors.js';
import { formatCLP, formatDate } from '../../../core/format.js';
import { emptyState, html, render, setButtonBusy, toast } from '../../../core/ui.js';
import { openAdoptionForm, openFollowUpForm, openReturnForm } from '../../adoptions/flows.js';
import { canAdopt } from '../../adoptions/logic.js';
import { openExpenseForm } from '../../expenses/form.js';
import {
    buildDiffusionPrompt, buildDiffusionText, diffusionData, missingDiffusionFields,
} from '../../files/logic.js';
import { renderFilesSection } from '../../files/section.js';

// ------------------------------------------------------------
// Adopción (Etapa 5)
// ------------------------------------------------------------
export async function renderAdoptionTab(container, { animal, catalogs, navigate, reloadAll }) {
    const adoptions = await listAdoptionsByAnimal(animal.id_animal);
    const active = adoptions.find((a) => !a.fecha_finalizacion) ?? null;
    const puedeAdoptar = canAdopt(animal.estado?.nombre_estado, Boolean(active));

    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Adopción</h2>
                <p class="small text-secondary mb-0">Las adopciones anteriores y sus seguimientos se conservan en el historial.</p>
            </div>
            <div class="d-flex flex-wrap gap-2">
                ${active ? html`
                    <button type="button" class="btn btn-primary" id="btnFollowTab"><i class="bi bi-chat-heart" aria-hidden="true"></i> Registrar seguimiento</button>
                    <button type="button" class="btn btn-outline-danger" id="btnReturnTab"><i class="bi bi-arrow-return-left" aria-hidden="true"></i> Registrar devolución</button>`
                : puedeAdoptar ? html`
                    <button type="button" class="btn btn-primary" id="btnAdoptTab"><i class="bi bi-house-check" aria-hidden="true"></i> Registrar adopción</button>` : ''}
            </div>
        </div>
        ${!active && !puedeAdoptar ? html`<div class="alert alert-warning" role="alert">
            El estado del animal es Adoptado, pero no tiene una adopción activa registrada. Revisa su historial.</div>` : ''}
        ${adoptions.length === 0
            ? emptyState({ icon: 'bi-house-check', title: 'Sin adopciones registradas', text: 'Cuando el animal sea adoptado, el proceso quedará registrado aquí.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Adoptante</th><th scope="col">Estado</th>
                    <th scope="col">Finalización</th><th scope="col"><span class="visually-hidden">Acción</span></th></tr></thead>
                <tbody>${adoptions.map((a) => html`<tr>
                    <td class="text-nowrap">${formatDate(a.fecha_adopcion)}</td>
                    <td>${a.adoptante?.nombre ?? '—'}</td>
                    <td>${adoptionBadge(a.estado?.nombre)}</td>
                    <td class="text-nowrap">${a.fecha_finalizacion ? formatDate(a.fecha_finalizacion) : '—'}</td>
                    <td class="text-end"><a class="btn btn-sm btn-outline-primary text-nowrap" href="#/adopciones/${a.id_adopcion}">Ver detalle</a></td>
                </tr>`)}</tbody></table></div>`}`);

    container.querySelector('#btnAdoptTab')?.addEventListener('click', async (e) => {
        const restore = setButtonBusy(e.currentTarget, 'Cargando…');
        try {
            const adopters = await listAdopters();
            restore();
            openAdoptionForm({ animal, adopters, onSaved: (id) => navigate(`/adopciones/${id}`) });
        } catch (err) {
            restore();
            toast(await reportError(err, 'Adoptantes'), 'error');
        }
    });
    container.querySelector('#btnFollowTab')?.addEventListener('click', () => openFollowUpForm({ adoption: active, onSaved: reloadAll }));
    container.querySelector('#btnReturnTab')?.addEventListener('click', () => openReturnForm({ adoption: active, estados: catalogs.estado, onSaved: reloadAll }));
}

// ------------------------------------------------------------
// Gastos (Etapa 6)
// ------------------------------------------------------------
export async function renderExpensesTab(container, { animal, navigate, reloadTab }) {
    const rows = await listExpensesByAnimal(animal.id_animal);
    const total = rows.reduce((sum, r) => sum + Number(r.monto_asignado || 0), 0);
    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Gastos asignados</h2>
                <p class="small text-secondary mb-0">Montos asignados a este animal; el resto de cada gasto queda como gasto general.</p>
            </div>
            <button type="button" class="btn btn-primary" id="btnExpenseTab"><i class="bi bi-plus-lg" aria-hidden="true"></i> Registrar gasto</button>
        </div>
        ${rows.length === 0
            ? emptyState({ icon: 'bi-cash-coin', title: 'Sin gastos asignados', text: 'Registra un gasto y asígnalo total o parcialmente a este animal.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Categoría</th><th scope="col">Descripción</th>
                    <th scope="col" class="text-end">Asignado</th><th scope="col" class="text-end">Total del gasto</th></tr></thead>
                <tbody>${rows.map((r) => html`<tr>
                    <td class="text-nowrap">${formatDate(r.gasto?.fecha)}</td>
                    <td>${r.gasto?.categoria?.nombre ?? '—'}</td>
                    <td><a href="#/gastos/${r.gasto?.id_gasto}">${r.gasto?.descripcion ?? '—'}</a></td>
                    <td class="text-end">${formatCLP(r.monto_asignado)}</td>
                    <td class="text-end text-secondary">${formatCLP(r.gasto?.monto)}</td>
                </tr>`)}</tbody>
                <tfoot><tr><th scope="row" colspan="3">Total asignado al animal</th><td class="text-end fw-bold">${formatCLP(total)}</td><td></td></tr></tfoot>
            </table></div>`}`);

    container.querySelector('#btnExpenseTab').addEventListener('click', async (e) => {
        const restore = setButtonBusy(e.currentTarget, 'Cargando…');
        try {
            const [categorias, animals] = await Promise.all([loadCatalog('categoria_gasto'), listAnimals()]);
            restore();
            openExpenseForm({ categorias, animals, presetAnimalId: animal.id_animal, navigate, onDone: reloadTab });
        } catch (err) {
            restore();
            toast(await reportError(err, 'Gastos'), 'error');
        }
    });
}

// ------------------------------------------------------------
// Archivos (Etapa 7): carpeta Drive del animal + archivos propios
// ------------------------------------------------------------
export async function renderFilesTab(container, { animal, reloadAll }) {
    const hasFolder = Boolean(animal.id_carpeta_drive);
    render(container, html`
        <h2 class="visually-hidden">Archivos</h2>
        ${hasFolder
            ? html`<div class="alert alert-success d-flex gap-2 align-items-center py-2" role="status">
                <i class="bi bi-folder-check" aria-hidden="true"></i><div>La carpeta del animal en Google Drive está creada.</div></div>`
            : html`<div class="alert alert-warning d-flex flex-wrap gap-2 align-items-center justify-content-between" role="alert">
                <div><i class="bi bi-folder-x" aria-hidden="true"></i> La carpeta del animal en Google Drive aún no se ha creado.</div>
                <button type="button" class="btn btn-sm btn-warning" id="retryFolder"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Crear carpeta ahora</button>
            </div>`}
        <div id="animalFiles"></div>
        <p class="small text-secondary mt-3 mb-0"><i class="bi bi-info-circle" aria-hidden="true"></i>
            Los documentos de cada adopción se gestionan en el detalle de la adopción.</p>`);

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

    await renderFilesSection(container.querySelector('#animalFiles'), {
        context: 'animal',
        idContext: animal.id_animal,
        title: 'Archivos del animal',
        emptyText: 'Fotografías adicionales, videos o documentos sanitarios del animal.',
        uploadBlocked: hasFolder ? null : 'Para subir archivos primero debe crearse la carpeta del animal en Google Drive.',
    });
}

// ------------------------------------------------------------
// Difusión (Etapa 7): texto base y prompt editables, sin IA.
// ------------------------------------------------------------
export async function renderDiffusionTab(container, { animal }) {
    const data = diffusionData(animal);
    const missing = missingDiffusionFields(data);

    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Difusión</h2>
                <p class="small text-secondary mb-0">Texto y prompt generados con información autorizada de la ficha.
                    Revísalos y edítalos antes de usarlos. El sistema no publica ni llama a servicios de IA.</p>
            </div>
            <button type="button" class="btn btn-outline-primary" id="btnRegen"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Regenerar desde la ficha</button>
        </div>
        ${missing.length ? html`<div class="alert alert-info d-flex flex-wrap gap-2 align-items-center justify-content-between py-2" role="note">
            <div><i class="bi bi-lightbulb" aria-hidden="true"></i> Para un mejor texto, completa en la ficha: ${missing.join(', ')}.</div>
            <a class="btn btn-sm btn-outline-primary" href="#/animales/${animal.id_animal}/resumen">Ir al resumen</a>
        </div>` : ''}
        <div class="row g-3">
            <div class="col-12 col-xl-6">
                <label class="form-label" for="difTexto">Texto base para publicación</label>
                <textarea class="form-control diffusion-text" id="difTexto" rows="14">${buildDiffusionText(data)}</textarea>
                <div class="d-flex justify-content-end mt-2">
                    <button type="button" class="btn btn-primary" data-copy="difTexto"><i class="bi bi-clipboard" aria-hidden="true"></i> Copiar texto</button>
                </div>
            </div>
            <div class="col-12 col-xl-6">
                <label class="form-label" for="difPrompt">Prompt estructurado (para herramienta externa)</label>
                <textarea class="form-control diffusion-text" id="difPrompt" rows="14">${buildDiffusionPrompt(data)}</textarea>
                <div class="d-flex justify-content-end mt-2">
                    <button type="button" class="btn btn-outline-primary" data-copy="difPrompt"><i class="bi bi-clipboard" aria-hidden="true"></i> Copiar prompt</button>
                </div>
            </div>
        </div>
        <p class="small text-secondary mt-3 mb-0"><i class="bi bi-shield-check" aria-hidden="true"></i>
            No se incluyen RUT, direcciones, teléfonos ni datos de adoptantes u hogares temporales.
            Completa el contacto oficial de la Fundación antes de publicar.</p>`);

    container.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
        const text = container.querySelector(`#${btn.dataset.copy}`).value;
        try {
            await navigator.clipboard.writeText(text);
            toast(btn.dataset.copy === 'difTexto' ? 'Texto copiado.' : 'Prompt copiado.', 'success');
        } catch {
            container.querySelector(`#${btn.dataset.copy}`).select();
            toast('No fue posible copiar automáticamente. El texto quedó seleccionado: usa Ctrl+C.', 'warning');
        }
    }));
    container.querySelector('#btnRegen').addEventListener('click', () => {
        container.querySelector('#difTexto').value = buildDiffusionText(data);
        container.querySelector('#difPrompt').value = buildDiffusionPrompt(data);
        toast('Texto y prompt regenerados desde la ficha.', 'info');
    });
}
