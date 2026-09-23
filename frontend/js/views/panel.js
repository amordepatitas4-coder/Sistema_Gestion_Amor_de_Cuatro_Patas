// ============================================================
// Panel principal — Etapa 1: solo bloque de bienvenida.
// Los KPI y bloques operativos se implementan en la Etapa 2.
// ============================================================

import { formatLongDate } from '../core/format.js';
import { emptyState, html, render } from '../core/ui.js';

function greeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
}

export default {
    title: 'Panel principal',

    async render({ outlet, session }) {
        const nombre = session.state.profile?.nombre ?? '';
        const today = formatLongDate();
        render(outlet, html`
            <header class="page-header welcome">
                <div>
                    <h1 class="page-title" tabindex="-1">${greeting()}, ${nombre}</h1>
                    <p class="page-subtitle">Resumen operativo de la Fundación</p>
                </div>
                <p class="welcome-date"><i class="bi bi-calendar3" aria-hidden="true"></i>
                    ${today.charAt(0).toUpperCase() + today.slice(1)}</p>
            </header>
            <section class="card-panel">
                ${emptyState({
                    icon: 'bi-grid-1x2',
                    title: 'Indicadores en preparación',
                    text: 'Los indicadores operativos del panel se habilitarán en la Etapa 2.',
                })}
            </section>`);
    },
};
