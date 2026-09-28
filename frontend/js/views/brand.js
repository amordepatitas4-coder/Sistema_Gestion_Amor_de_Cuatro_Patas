// ============================================================
// Identidad de la Fundación.
//
// El logo oficial está en assets/logo.webp. Como ya incluye el
// nombre de la Fundación, junto a él solo se muestra el nombre
// del sistema. Si LOGO_SRC fuera null se mostraría un distintivo
// con icono y el nombre en texto.
// ============================================================

import { html } from '../core/ui.js';

export const BRAND = {
    name: 'Amor de Cuatro Patas',
    system: 'Sistema de Gestión',
    LOGO_SRC: 'assets/logo.webp',
};

export function brandMark({ variant = 'light' } = {}) {
    if (BRAND.LOGO_SRC) {
        // El logo va sobre una placa blanca para conservar sus colores sobre el menú burdeo.
        return html`
            <span class="brand brand-${variant} brand-has-logo">
                <span class="brand-plate">
                    <img class="brand-logo" src="${BRAND.LOGO_SRC}" alt="Fundación ${BRAND.name}">
                </span>
                <span class="brand-system">${BRAND.system}</span>
            </span>`;
    }
    return html`
        <span class="brand brand-${variant}">
            <span class="brand-symbol" aria-hidden="true"><i class="bi bi-heart-fill"></i></span>
            <span class="brand-text">
                <span class="brand-name">${BRAND.name}</span>
                <span class="brand-system">${BRAND.system}</span>
            </span>
        </span>`;
}
