// ============================================================
// Pantallas completas fuera del layout: arranque, configuración
// faltante y error al verificar la cuenta. Además, la vista de
// ruta inexistente dentro del layout.
// ============================================================

import { emptyState, errorState, html, loadingState, pageHeader, render } from '../core/ui.js';
import { brandMark } from './brand.js';

export function renderSplash(root, text = 'Verificando tu sesión…') {
    render(root, html`
        <div class="fullscreen-center">
            <div class="text-center">
                <div class="mb-3">${brandMark({ variant: 'dark' })}</div>
                ${loadingState(text)}
            </div>
        </div>`);
}

// Mensajes según el problema detectado en supabase.js; nunca muestran la URL ni la clave configuradas.
const CONFIG_TEXT = {
    missing: 'Falta la configuración pública del proyecto. Copia js/config.example.js como js/config.js y completa la URL y la clave pública (anon/publishable) de Supabase.',
    invalid: 'La URL de Supabase configurada en js/config.js no es válida.',
    'forbidden-key': 'La clave configurada en js/config.js no es una clave pública. Nunca utilices la clave service_role ni claves secretas en el navegador.',
};

export function renderConfigProblem(root, problem) {
    render(root, html`
        <div class="fullscreen-center">
            <section class="login-card">
                ${errorState({ title: 'El sistema no está configurado', text: CONFIG_TEXT[problem] ?? CONFIG_TEXT.missing })}
            </section>
        </div>`);
}

/** Error al verificar la cuenta (por ejemplo, sin conexión). */
export function renderVerifyError(root, message, { onRetry, onLogout }) {
    render(root, html`
        <div class="fullscreen-center">
            <section class="login-card">
                ${errorState({ title: 'No fue posible verificar tu cuenta', text: message, retryId: 'verifyRetry' })}
                <div class="text-center mt-2">
                    <button type="button" class="btn btn-link" id="verifyLogout">Cerrar sesión</button>
                </div>
            </section>
        </div>`);
    root.querySelector('#verifyRetry').addEventListener('click', onRetry);
    root.querySelector('#verifyLogout').addEventListener('click', onLogout);
}

export const notFoundView = {
    title: 'Página no encontrada',
    async render({ outlet }) {
        render(outlet, html`
            ${pageHeader({ title: 'Página no encontrada' })}
            <section class="card-panel">
                ${emptyState({
                    icon: 'bi-signpost-split',
                    title: 'La dirección no corresponde a ninguna sección',
                    text: 'Revisa el enlace o vuelve al panel principal.',
                    action: { label: 'Ir al panel principal', icon: 'bi-house', href: '#/panel' },
                })}
            </section>`);
    },
};
