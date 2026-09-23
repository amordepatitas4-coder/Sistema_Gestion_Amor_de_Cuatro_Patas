// ============================================================
// Identidad de la Fundación.
//
// Espacio reemplazable para el logo oficial: cuando la Fundación
// entregue el archivo PNG/SVG, copiarlo en assets/ y asignar su
// ruta a LOGO_SRC. Mientras sea null se muestra un distintivo
// con icono (no se usa la captura de referencia como logo).
// ============================================================

import { html } from '../core/ui.js';

export const BRAND = {
    name: 'Amor de Cuatro Patas',
    system: 'Sistema de Gestión',
    LOGO_SRC: null,
};

export function brandMark({ variant = 'light' } = {}) {
    const mark = BRAND.LOGO_SRC
        ? html`<img class="brand-logo" src="${BRAND.LOGO_SRC}" alt="">`
        : html`<span class="brand-symbol" aria-hidden="true"><i class="bi bi-heart-fill"></i></span>`;
    return html`
        <span class="brand brand-${variant}">
            ${mark}
            <span class="brand-text">
                <span class="brand-name">${BRAND.name}</span>
                <span class="brand-system">${BRAND.system}</span>
            </span>
        </span>`;
}
