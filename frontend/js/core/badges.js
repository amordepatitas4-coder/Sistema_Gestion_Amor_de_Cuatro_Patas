// ============================================================
// Badges de estado consistentes en toda la aplicación (§40, PA-UX-05).
//
// El estado formal proviene de ESTADO.nombre_estado. El indicador
// "💚 Disponible para adopción" para animales En hogar temporal es
// SOLO visual: no se guarda ni reemplaza el estado formal (§7.4).
// ============================================================

import { html } from './ui.js';

// Estilo por nombre de estado; un estado nuevo del catálogo usa el estilo genérico.
const STATE_STYLES = {
    'Rescatado': { cls: 'badge-state-rescatado', icon: 'bi-life-preserver' },
    'En tratamiento': { cls: 'badge-state-tratamiento', icon: 'bi-bandaid' },
    'En hogar temporal': { cls: 'badge-state-hogar', icon: 'bi-house-heart' },
    'Disponible para adopción': { cls: 'badge-state-disponible', icon: 'bi-stars' },
    'Adoptado': { cls: 'badge-state-adoptado', icon: 'bi-house-check' },
};

export function stateBadge(nombreEstado) {
    const style = STATE_STYLES[nombreEstado] ?? { cls: 'badge-state-otro', icon: 'bi-circle' };
    return html`<span class="badge badge-state ${style.cls}">
        <i class="bi ${style.icon}" aria-hidden="true"></i> ${nombreEstado || 'Sin estado'}</span>`;
}

/** Indicador visual complementario; no es un estado. */
export function availabilityIndicator(nombreEstado) {
    if (nombreEstado !== 'En hogar temporal') return '';
    return html`<span class="badge badge-availability"
        title="Indicador visual. El estado formal del animal es En hogar temporal.">💚 Disponible para adopción</span>`;
}

const ADOPTION_STYLES = {
    'Activa': { cls: 'badge-soft-success', icon: 'bi-house-check' },
    'Devuelto': { cls: 'badge-soft-warning', icon: 'bi-arrow-return-left' },
    'Finalizada': { cls: 'badge-soft-muted', icon: 'bi-check2-all' },
};

/** Estado de una adopción (ESTADO_ADOPCION.nombre). */
export function adoptionBadge(nombre) {
    const style = ADOPTION_STYLES[nombre] ?? { cls: 'badge-soft-muted', icon: 'bi-circle' };
    return html`<span class="badge ${style.cls}"><i class="bi ${style.icon}" aria-hidden="true"></i> ${nombre || '—'}</span>`;
}

export function activeBadge(activo) {
    return activo
        ? html`<span class="badge badge-soft-success"><i class="bi bi-check-circle" aria-hidden="true"></i> Activo</span>`
        : html`<span class="badge badge-soft-muted"><i class="bi bi-pause-circle" aria-hidden="true"></i> Inactivo</span>`;
}

const PROJECT_STYLES = {
    'Postulado': { cls: 'badge-soft-info', icon: 'bi-send' },
    'Aprobado': { cls: 'badge-soft-success', icon: 'bi-patch-check' },
    'En ejecución': { cls: 'badge-soft-warning', icon: 'bi-play-circle' },
    'Finalizado': { cls: 'badge-soft-muted', icon: 'bi-check2-all' },
    'Cancelado': { cls: 'badge-soft-muted', icon: 'bi-x-circle' },
};

/** Estado de un proyecto de esterilización (ESTADO_PROYECTO.nombre). */
export function projectBadge(nombre) {
    const style = PROJECT_STYLES[nombre] ?? { cls: 'badge-soft-muted', icon: 'bi-circle' };
    return html`<span class="badge ${style.cls}"><i class="bi ${style.icon}" aria-hidden="true"></i> ${nombre || '—'}</span>`;
}
