// ============================================================
// Vista provisional para módulos aún no implementados.
// Se reemplaza en la etapa indicada por cada módulo (routes.js).
// ============================================================

import { emptyState, html, pageHeader, render } from '../core/ui.js';

export default {
    title: 'En preparación',

    async render({ outlet, route }) {
        const module = route.module;
        render(outlet, html`
            ${pageHeader({ title: module.label })}
            <section class="card-panel">
                ${emptyState({
                    icon: module.icon,
                    title: 'Módulo en preparación',
                    text: "Esta sección todavía no está disponible.",
                    action: { label: 'Volver al panel principal', icon: 'bi-arrow-left', href: '#/panel' },
                })}
            </section>`);
    },
};
