// ============================================================
// Pantalla de inicio de sesión (Supabase Auth, correo y contraseña).
// No existe registro público: las cuentas se crean por invitación.
// ============================================================

import { bindForm, showFormErrors, showFormNotice } from '../core/forms.js';
import { isValidEmail } from '../core/format.js';
import { html, render } from '../core/ui.js';
import { brandMark } from './brand.js';

const NOTICES = {
    inactive: { type: 'warning', text: 'Tu cuenta no está habilitada para usar el sistema. Comunícate con una administradora de la Fundación.' },
    signedOut: { type: 'success', text: 'Cerraste sesión correctamente.' },
    expired: { type: 'info', text: 'Tu sesión finalizó. Vuelve a ingresar para continuar.' },
};

export default {
    title: 'Ingresar',

    async render({ outlet, session, notice }) {
        render(outlet, html`
            <main class="login-shell">
                <section class="login-card" aria-labelledby="loginTitle">
                    <div class="login-brand">${brandMark({ variant: 'dark' })}</div>
                    <h1 id="loginTitle" class="login-title">Ingresar al sistema</h1>
                    <p class="login-subtitle">Acceso exclusivo para usuarias autorizadas de la Fundación.</p>

                    <form id="loginForm" novalidate>
                        <div data-form-error hidden></div>
                        <div class="mb-3">
                            <label class="form-label" for="loginEmail">Correo electrónico</label>
                            <input class="form-control" id="loginEmail" name="email" type="email"
                                   autocomplete="username" inputmode="email" required>
                        </div>
                        <div class="mb-4">
                            <label class="form-label" for="loginPassword">Contraseña</label>
                            <div class="input-group">
                                <input class="form-control" id="loginPassword" name="password" type="password"
                                       autocomplete="current-password" required>
                                <button class="btn btn-outline-secondary" type="button" id="togglePassword"
                                        aria-label="Mostrar contraseña" aria-pressed="false">
                                    <i class="bi bi-eye" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-primary w-100 btn-lg" type="submit">
                            <i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>
                            <span>Ingresar</span>
                        </button>
                    </form>
                </section>
            </main>`);

        const form = outlet.querySelector('#loginForm');
        const email = form.querySelector('#loginEmail');
        const password = form.querySelector('#loginPassword');
        const toggle = form.querySelector('#togglePassword');

        const info = NOTICES[notice] ?? (typeof notice === 'object' && notice ? notice : null);
        if (info) showFormNotice(form, info.text, info.type);

        toggle.addEventListener('click', () => {
            const show = password.type === 'password';
            password.type = show ? 'text' : 'password';
            toggle.setAttribute('aria-pressed', String(show));
            toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
            toggle.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i>`;
        });

        bindForm(form, {
            context: 'Inicio de sesión',
            busyLabel: 'Ingresando…',
            collect: (fd) => ({
                email: String(fd.get('email') ?? '').trim(),
                password: String(fd.get('password') ?? ''),
            }),
            validate: ({ email: e, password: p }) => {
                const errors = {};
                if (!e) errors.email = 'Ingresa tu correo electrónico.';
                else if (!isValidEmail(e)) errors.email = 'El correo electrónico no tiene un formato válido.';
                if (!p) errors.password = 'Ingresa tu contraseña.';
                return errors;
            },
            // Al quedar activa la sesión, app.js navega al destino.
            submit: ({ email: e, password: p }) => session.signIn(e, p),
            onError: (err, message) => {
                showFormErrors(form, { _form: message });
                password.value = '';
                password.focus();
            },
        });

        email.focus();
    },
};
