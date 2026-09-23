// ============================================================
// Badges de estado consistentes en toda la aplicación (§40, PA-UX-05).
//
// El estado formal proviene de ESTADO.nombre_estado. El indicador
// "💚 Disponible para adopción" para animales En hogar temporal es
// SOLO visual: no se guarda ni reemplaza el estado formal (§7.4).
// ============================================================

import { html } from './ui.js';

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

export function activeBadge(activo) {
    return activo
        ? html`<span class="badge badge-soft-success"><i class="bi bi-check-circle" aria-hidden="true"></i> Activo</span>`
        : html`<span class="badge badge-soft-muted"><i class="bi bi-pause-circle" aria-hidden="true"></i> Inactivo</span>`;
}
