// ============================================================
// Pestaña Hogares: hogar actual, historial de permanencias y
// acciones Ingresar / Cambiar / Finalizar (RPC del backend).
// ============================================================

import { listHomes, listStaysByAnimal } from '../../../api/homes.js';
import { ESTADOS } from '../../../core/domain.js';
import { displayText, formatDate } from '../../../core/format.js';
import { emptyState, html, render } from '../../../core/ui.js';
import { openChangeHome, openEnterHome, openFinishHome } from '../../homes/flows.js';
import { canEnterHome } from '../logic.js';

export async function renderHomesTab(container, { animal, catalogs, reloadAll }) {
    const [stays, homes] = await Promise.all([listStaysByAnimal(animal.id_animal), listHomes()]);
    // La permanencia sin fecha de salida es el hogar actual del animal.
    const current = stays.find((s) => !s.fecha_salida) ?? null;
    const estadoActual = animal.estado?.nombre_estado;
    // Caso anómalo (p. ej. datos antiguos): se avisa en vez de ocultarlo, para que la usuaria lo regularice.
    const inconsistent = current && estadoActual !== ESTADOS.EN_HOGAR;

    render(container, html`
        <div class="tab-toolbar">
            <div>
                <h2 class="tab-title">Hogares temporales</h2>
                <p class="small text-secondary mb-0">Las permanencias anteriores se conservan como historial.</p>
            </div>
            <div class="d-flex flex-wrap gap-2">
                ${current ? html`
                    ${estadoActual === ESTADOS.EN_HOGAR ? html`<button type="button" class="btn btn-outline-primary" id="btnChangeHome">
                        <i class="bi bi-arrow-left-right" aria-hidden="true"></i> Cambiar de hogar</button>` : ''}
                    <button type="button" class="btn btn-primary" id="btnFinishHome">
                        <i class="bi bi-box-arrow-right" aria-hidden="true"></i> Finalizar permanencia</button>`
                : canEnterHome(estadoActual, false) ? html`
                    <button type="button" class="btn btn-primary" id="btnEnterHome">
                        <i class="bi bi-house-heart" aria-hidden="true"></i> Ingresar a hogar</button>` : ''}
            </div>
        </div>

        ${inconsistent ? html`<div class="alert alert-warning" role="alert">
            El animal tiene una permanencia activa, pero su estado actual es <strong>${estadoActual}</strong>.
            Finaliza la permanencia para regularizar su situación.</div>` : ''}
        ${!current && estadoActual === ESTADOS.ADOPTADO ? html`<div class="alert alert-info" role="note">
            El animal está Adoptado; no puede ingresar a un hogar temporal mientras la adopción esté vigente.</div>` : ''}

        <section class="current-home ${current ? '' : 'is-empty'}" aria-label="Hogar actual">
            ${current ? html`
                <div class="d-flex align-items-center gap-3">
                    <span class="section-icon"><i class="bi bi-house-heart" aria-hidden="true"></i></span>
                    <div>
                        <div class="small text-secondary">Hogar actual</div>
                        <div class="fw-bold fs-5">${current.hogar?.nombre_responsable ?? '—'}</div>
                        <div class="small">Desde ${formatDate(current.fecha_ingreso)}</div>
                    </div>
                </div>`
            : html`<p class="mb-0 text-secondary"><i class="bi bi-house" aria-hidden="true"></i> Sin hogar temporal actualmente.</p>`}
        </section>

        <h3 class="h6 mt-4">Historial de permanencias</h3>
        ${stays.length === 0
            ? emptyState({ icon: 'bi-houses', title: 'Sin permanencias registradas', text: 'Cuando el animal ingrese a un hogar temporal, quedará registrado aquí.' })
            : html`<div class="table-responsive"><table class="table align-middle">
                <thead><tr><th scope="col">Hogar</th><th scope="col">Ingreso</th><th scope="col">Salida</th><th scope="col">Observaciones</th></tr></thead>
                <tbody>${stays.map((s) => html`<tr>
                    <td class="fw-semibold">${s.hogar?.nombre_responsable ?? '—'}
                        ${!s.fecha_salida ? html`<span class="badge badge-soft-success ms-1">Actual</span>` : ''}</td>
                    <td class="text-nowrap">${formatDate(s.fecha_ingreso)}</td>
                    <td class="text-nowrap">${s.fecha_salida ? formatDate(s.fecha_salida) : '—'}</td>
                    <td class="pre-line">${displayText(s.observaciones)}</td>
                </tr>`)}</tbody>
            </table></div>`}`);

    container.querySelector('#btnEnterHome')?.addEventListener('click', () => openEnterHome({ animal, homes, onSaved: reloadAll }));
    container.querySelector('#btnChangeHome')?.addEventListener('click', () => openChangeHome({ animal, currentStay: current, homes, onSaved: reloadAll }));
    container.querySelector('#btnFinishHome')?.addEventListener('click', () => openFinishHome({ animal, currentStay: current, estados: catalogs.estado, onSaved: reloadAll }));
}
