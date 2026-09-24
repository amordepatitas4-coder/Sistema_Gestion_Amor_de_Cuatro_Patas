// ============================================================
// Pantalla de inicio de sesión (Supabase Auth, correo y contraseña).
// No existe registro público: las cuentas se crean por invitación.
//
// "¿Olvidaste tu contraseña?": solicita a Supabase Auth el correo de
// recuperación (resetPasswordForEmail). El mensaje de respuesta es
// siempre el mismo, exista o no la cuenta, para no revelar correos.
// El enlace vuelve a esta aplicación (authRedirectUrl) y la usuaria
// define la nueva contraseña en Configuración → Mi cuenta.
// ============================================================

import { bindForm, showFormErrors, showFormNotice } from '../core/forms.js';
import { isValidEmail } from '../core/format.js';
import { authRedirectUrl } from '../core/router.js';
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
                        <div class="text-center mt-3">
                            <button type="button" class="btn btn-link btn-sm" id="forgotPassword" aria-controls="recoveryPanel">¿Olvidaste tu contraseña?</button>
                        </div>
                    </form>

                    <section id="recoveryPanel" hidden aria-labelledby="recoveryTitle">
                        <h2 id="recoveryTitle" class="h5 fw-bold">Recuperar contraseña</h2>
                        <p class="small text-secondary">Ingresa el correo de tu cuenta. Te enviaremos un enlace para crear una nueva contraseña.</p>
                        <form id="recoveryForm" novalidate>
                            <div data-form-error hidden></div>
                            <div class="mb-3">
                                <label class="form-label" for="recoveryEmail">Correo electrónico</label>
                                <input class="form-control" id="recoveryEmail" name="email" type="email" autocomplete="username" inputmode="email" required>
                            </div>
                            <button class="btn btn-primary w-100" type="submit">
                                <i class="bi bi-envelope" aria-hidden="true"></i> <span>Enviar enlace de recuperación</span>
                            </button>
                        </form>
                        <div id="recoverySent" hidden role="status"></div>
                        <div class="text-center mt-3">
                            <button type="button" class="btn btn-link btn-sm" id="backToLogin"><i class="bi bi-arrow-left" aria-hidden="true"></i> Volver a ingresar</button>
                        </div>
                    </section>
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

        // --- Recuperación de contraseña ---
        const recoveryPanel = outlet.querySelector('#recoveryPanel');
        const recoveryForm = outlet.querySelector('#recoveryForm');
        const recoveryEmail = recoveryForm.querySelector('#recoveryEmail');
        const sentBox = outlet.querySelector('#recoverySent');
        const showRecovery = (open) => {
            form.hidden = open;
            recoveryPanel.hidden = !open;
            if (open) {
                recoveryForm.hidden = false;
                sentBox.hidden = true;
                recoveryEmail.value = email.value.trim();
                recoveryEmail.focus();
            } else {
                email.focus();
            }
        };
        outlet.querySelector('#forgotPassword').addEventListener('click', () => showRecovery(true));
        outlet.querySelector('#backToLogin').addEventListener('click', () => showRecovery(false));

        bindForm(recoveryForm, {
            context: 'Recuperación de contraseña',
            busyLabel: 'Enviando…',
            collect: (fd) => ({ email: String(fd.get('email') ?? '').trim().toLowerCase() }),
            validate: ({ email: e }) => {
                if (!e) return { email: 'Ingresa tu correo electrónico.' };
                if (!isValidEmail(e)) return { email: 'El correo electrónico no tiene un formato válido.' };
                return null;
            },
            submit: ({ email: e }) => session.requestPasswordReset(e, authRedirectUrl(window.location)),
            onSuccess: (_, { email: e }) => {
                recoveryForm.hidden = true;
                sentBox.hidden = false;
                render(sentBox, html`
                    <div class="alert alert-success d-flex gap-2" role="status">
                        <i class="bi bi-envelope-check" aria-hidden="true"></i>
                        <div>Si <strong>${e}</strong> corresponde a una cuenta del sistema, recibirás un correo con un enlace para crear
                            una nueva contraseña. Revisa también la carpeta de correo no deseado. El enlace es de un solo uso y vence pronto.</div>
                    </div>`);
            },
        });

        email.focus();
    },
};
