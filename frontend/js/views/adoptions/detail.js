// ============================================================
// Detalle de una adopción: #/adopciones/:id
// Datos del proceso, seguimientos (historial), devolución y
// documentos propios de la adopción (adopcion_archivo).
// ============================================================

import { getAdopter, getAdoption, listFollowUps } from '../../api/adoptions.js';
import { loadCatalog } from '../../api/catalogs.js';
import { adoptionBadge, stateBadge } from '../../core/badges.js';
import { reportError } from '../../core/errors.js';
import { displayText, formatDate } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, render } from '../../core/ui.js';
import { animalName } from '../animals/logic.js';
import { renderFilesSection } from '../files/section.js';
import { openFollowUpForm, openReturnForm } from './flows.js';
import { ESTADOS_ADOPCION, medioLabel } from './logic.js';

export default {
    title: 'Detalle de adopción',

    async render({ outlet, params, navigate }) {
        const id = Number(params.id);
        const reload = () => navigate(`/adopciones/${id}`, {}, { replace: true });
        render(outlet, loadingState());

        let adoption;
        let adopter;
        let followUps;
        let estados;
        try {
            // Primero la adopción (para saber si existe y quién es el adoptante); luego el resto en paralelo.
            adoption = await getAdoption(id);
            if (!adoption) {
                render(outlet, html`<section class="card-panel">${emptyState({
                    icon: 'bi-search', title: 'No se encontró la adopción',
                    action: { label: 'Volver a Adopciones', icon: 'bi-arrow-left', href: '#/adopciones' },
                })}</section>`);
                return;
            }
            [adopter, followUps, estados] = await Promise.all([
                getAdopter(adoption.id_adoptante), listFollowUps(id), loadCatalog('estado'),
            ]);
        } catch (err) {
            render(outlet, errorState({ text: await reportError(err, 'Detalle de adopción'), retryId: 'retryAdoption' }));
            outlet.querySelector('#retryAdoption')?.addEventListener('click', reload);
            return;
        }

        // Seguimiento y devolución solo se ofrecen en adopciones vigentes.
        const activa = !adoption.fecha_finalizacion && adoption.estado?.nombre === ESTADOS_ADOPCION.ACTIVA;
        const name = animalName(adoption.animal ?? { id_animal: adoption.id_animal });
        document.title = `Adopción de ${name} · Amor de Cuatro Patas`;

        render(outlet, html`
            <nav aria-label="Ruta de navegación" class="mb-2">
                <a class="back-link" href="#/adopciones"><i class="bi bi-arrow-left" aria-hidden="true"></i> Adopciones</a>
            </nav>
            <section class="card-panel mb-3">
                <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
                    <div>
                        <h1 class="page-title" tabindex="-1">Adopción de ${name}</h1>
                        <p class="mb-2 text-secondary">Adoptante: <strong>${adopter?.nombre ?? '—'}</strong></p>
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            ${adoptionBadge(adoption.estado?.nombre)}
                            <span class="small text-secondary">Estado actual del animal:</span> ${stateBadge(adoption.animal?.estado?.nombre_estado)}
                        </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <a class="btn btn-outline-primary" href="#/animales/${adoption.id_animal}/adopcion"><i class="bi bi-heart" aria-hidden="true"></i> Ver ficha del animal</a>
                        ${activa ? html`
                            <button type="button" class="btn btn-primary" id="btnFollow"><i class="bi bi-chat-heart" aria-hidden="true"></i> Registrar seguimiento</button>
                            <button type="button" class="btn btn-outline-danger" id="btnReturn"><i class="bi bi-arrow-return-left" aria-hidden="true"></i> Registrar devolución</button>` : ''}
                    </div>
                </div>
                <dl class="info-grid mt-3 mb-0">
                    <div class="info-block"><dt>Fecha de adopción</dt><dd>${formatDate(adoption.fecha_adopcion)}</dd></div>
                    <div class="info-block"><dt>Finalización</dt><dd>${adoption.fecha_finalizacion ? formatDate(adoption.fecha_finalizacion) : '—'}</dd></div>
                    <div class="info-block"><dt>Motivo de finalización</dt><dd class="pre-line">${displayText(adoption.motivo_finalizacion)}</dd></div>
                    <div class="info-block"><dt>Contacto del adoptante</dt><dd>${[adopter?.telefono, adopter?.email].filter(Boolean).join(' · ') || '—'}</dd></div>
                </dl>
                ${adoption.observaciones ? html`<p class="pre-line small mt-3 mb-0"><strong>Observaciones:</strong> ${adoption.observaciones}</p>` : ''}
            </section>

            <section class="card-panel mb-3" aria-labelledby="followTitle">
                <h2 class="block-title" id="followTitle"><i class="bi bi-chat-heart" aria-hidden="true"></i> Seguimientos</h2>
                ${followUps.length === 0
                    ? emptyState({ icon: 'bi-chat-heart', title: 'Sin seguimientos registrados', text: activa ? 'Registra el primer contacto posterior a la adopción.' : '' })
                    : html`<ol class="timeline">${followUps.map((s) => html`
                        <li class="timeline-item">
                            <div class="timeline-date">${formatDate(s.fecha)}</div>
                            <div class="timeline-card">
                                <strong>${medioLabel(s.medio_contacto)}</strong>
                                ${s.situacion_animal ? html`<p class="mb-0 mt-1 pre-line"><span class="text-secondary">Situación:</span> ${s.situacion_animal}</p>` : ''}
                                ${s.observaciones ? html`<p class="mb-0 mt-1 pre-line small text-secondary">${s.observaciones}</p>` : ''}
                            </div>
                        </li>`)}</ol>`}
            </section>

            <section class="card-panel" id="adoptionFiles"></section>`);

        outlet.querySelector('#btnFollow')?.addEventListener('click', () => openFollowUpForm({ adoption, onSaved: reload }));
        outlet.querySelector('#btnReturn')?.addEventListener('click', () => openReturnForm({ adoption, estados, onSaved: reload }));

        await renderFilesSection(outlet.querySelector('#adoptionFiles'), {
            context: 'adopcion',
            idContext: id,
            title: 'Documentos de la adopción',
            emptyText: 'Contratos u otros documentos del proceso. Se guardan en la carpeta Drive del animal.',
            // Los documentos de la adopción se guardan en la carpeta Drive del animal; sin carpeta no se permite subir.
            uploadBlocked: adoption.animal?.id_carpeta_drive ? null
                : 'El animal aún no tiene carpeta en Google Drive. Créala desde la pestaña Archivos de su ficha.',
        });
    },
};
