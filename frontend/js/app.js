// ============================================================
// Punto de entrada de la aplicación.
//
// Coordina tres piezas:
//   - session (Supabase Auth + usuaria activa);
//   - router (hash);
//   - vistas (login fuera del layout; módulos dentro del shell).
//
// Regla de acceso: ninguna ruta interna se renderiza si la sesión
// no está en estado 'active'.
// ============================================================

import { clearCatalogCache } from './api/catalogs.js';
import { reportError } from './core/errors.js';
import { createRouter, isAuthCallback, parseAuthCallback } from './core/router.js';
import { createSession } from './core/session.js';
import { errorState, loadingState, observeTables, render, setButtonBusy, toast } from './core/ui.js';
import { HOME_PATH, LOGIN_PATH, NAV_ITEMS, ROUTES } from './routes.js';
import { configProblem, supabase } from './supabase.js';
import { notFoundView, renderConfigProblem, renderSplash, renderVerifyError } from './views/screens.js';
import { mountShell } from './views/shell.js';

const APP_NAME = 'Amor de Cuatro Patas';
// Destino al volver desde un enlace de recuperación de contraseña.
const RECOVERY_PATH = '/configuracion/cuenta?recuperacion=1';
const root = document.getElementById('app');

if (configProblem) {
    renderConfigProblem(root, configProblem);
} else {
    startApp();
}

function startApp() {
    const session = createSession(supabase);
    const router = createRouter({ routes: ROUTES, onResolve: handleRoute });

    let screen = null;            // 'splash' | 'login' | 'shell' | 'verify-error'
    let shell = null;
    let loginNotice = undefined;  // aviso mostrado en el login actual
    let viewCleanup = null;
    let renderToken = 0;
    let routerStarted = false;
    let pendingPath = null;       // destino solicitado antes de iniciar sesión
    let firstViewRendered = false;

    // Respuesta de Supabase Auth en la URL (invitación, recuperación o error).
    let authCallback = null;
    if (isAuthCallback(window.location.hash)) {
        const params = parseAuthCallback(window.location.hash);
        authCallback = {
            type: params.get('type'),
            error: params.get('error_description') || params.get('error'),
        };
    }

    renderSplash(root);
    screen = 'splash';
    session.subscribe(onSessionChange);
    session.start();

    // --------------------------------------------------------
    // Cambios de sesión
    // --------------------------------------------------------
    function onSessionChange(state) {
        switch (state.status) {
            case 'unknown':
            case 'checking':
                // Durante el login el formulario ya muestra su propio estado de carga.
                if (screen !== 'login' && screen !== 'shell') {
                    renderSplash(root);
                    screen = 'splash';
                }
                return;

            case 'error':
                teardownShell();
                screen = 'verify-error';
                reportError(state.error, 'Verificación de cuenta').then((message) => {
                    if (session.state.status !== 'error') return;
                    renderVerifyError(root, message, {
                        onRetry: () => { renderSplash(root); screen = 'splash'; session.retry(); },
                        onLogout: () => logout(null),
                    });
                });
                return;

            case 'anonymous':
            case 'active':
                if (state.status === 'anonymous') clearCatalogCache();
                cleanAuthCallbackFromUrl(state);
                // Evento nativo PASSWORD_RECOVERY (aunque supabase-js ya haya limpiado la URL).
                if (session.consumePasswordRecovery()) history.replaceState(null, '', `#${RECOVERY_PATH}`);
                if (!routerStarted) {
                    routerStarted = true;
                    router.start();
                } else {
                    router.resolve();
                }
                return;

            default:
                return;
        }
    }

    function cleanAuthCallbackFromUrl(state) {
        if (!isAuthCallback(window.location.hash)) return;
        // Tras aceptar una invitación o abrir un enlace de recuperación se lleva a
        // Mi cuenta para definir la contraseña.
        const type = state.status === 'active' ? authCallback?.type : null;
        const target = state.status !== 'active' ? LOGIN_PATH
            : type === 'recovery' ? RECOVERY_PATH
                : type === 'invite' ? '/configuracion/cuenta?bienvenida=1' : HOME_PATH;
        if (type === 'recovery') session.consumePasswordRecovery();
        history.replaceState(null, '', `#${target}`);
    }

    // --------------------------------------------------------
    // Resolución de rutas
    // --------------------------------------------------------
    async function handleRoute({ route, params, query, path }) {
        const { status } = session.state;
        if (status !== 'active' && status !== 'anonymous') return;

        if (path === '/') {
            router.navigate(status === 'active' ? HOME_PATH : LOGIN_PATH, {}, { replace: true });
            return;
        }

        // Rutas públicas (login)
        if (route?.public) {
            if (status === 'active') {
                router.navigate(consumePendingPath(), {}, { replace: true });
                return;
            }
            await showLogin(route);
            return;
        }

        // Rutas internas
        if (status !== 'active') {
            if (route && !['signedOut', 'inactive'].includes(session.state.notice)) {
                pendingPath = window.location.hash.replace(/^#/, '');
            }
            router.navigate(LOGIN_PATH, {}, { replace: true });
            return;
        }

        ensureShell();
        shell.setActive(path);
        await showView(route ? route : null, { params, query, path });
    }

    function consumePendingPath() {
        const target = pendingPath && pendingPath !== LOGIN_PATH ? pendingPath : HOME_PATH;
        pendingPath = null;
        return target;
    }

    async function showLogin(route) {
        const notice = authCallback?.error
            ? { type: 'warning', text: 'El enlace no es válido o ya expiró. Usa "¿Olvidaste tu contraseña?" para recibir uno nuevo, solicita una nueva invitación o ingresa con tu correo y contraseña.' }
            : session.state.notice;
        if (screen === 'login' && loginNotice === notice) return;

        teardownShell();
        screen = 'login';
        loginNotice = notice;
        authCallback = null;
        const view = (await route.load()).default;
        document.title = `${view.title} · ${APP_NAME}`;
        await view.render({ outlet: root, session, notice });
    }

    function ensureShell() {
        if (screen === 'shell' && shell) return;
        const { profile, user } = session.state;
        shell = mountShell(root, {
            navItems: NAV_ITEMS,
            profile,
            email: user?.email ?? '',
            onLogout: logout,
        });
        // Tablas legibles en celular (cada fila como tarjeta etiquetada).
        observeTables(shell.outlet);
        const modalHost = document.getElementById('modalHost');
        if (modalHost && !modalHost.dataset.tablesObserved) { observeTables(modalHost); modalHost.dataset.tablesObserved = '1'; }
        screen = 'shell';
        loginNotice = undefined;
        firstViewRendered = false;
    }

    function teardownShell() {
        runCleanup();
        shell = null;
        renderToken++;
    }

    function runCleanup() {
        if (typeof viewCleanup === 'function') {
            try { viewCleanup(); } catch (err) { console.error('[Vista] Error al limpiar', err); }
        }
        viewCleanup = null;
    }

    async function showView(route, { params, query, path }) {
        const token = ++renderToken;
        runCleanup();
        const outlet = shell.outlet;
        render(outlet, loadingState());

        // Revalida periódicamente que la usuaria siga activa.
        const allowed = await session.ensureActive();
        if (!allowed || token !== renderToken) return;

        let view = notFoundView;
        try {
            if (route) view = (await route.load()).default;
        } catch (err) {
            const message = await reportError(err, 'Carga de módulo');
            if (token === renderToken) render(outlet, errorState({ text: message }));
            return;
        }
        if (token !== renderToken) return;

        document.title = `${route?.module?.label ?? view.title} · ${APP_NAME}`;
        try {
            const cleanup = await view.render({
                outlet, params, query, path, route, session,
                navigate: router.navigate,
            });
            if (token === renderToken) viewCleanup = cleanup ?? null;
        } catch (err) {
            const message = await reportError(err, `Vista ${path}`);
            if (token === renderToken) render(outlet, errorState({ text: message }));
            return;
        }

        // Accesibilidad: al navegar, llevar el foco al título de la vista.
        if (firstViewRendered) {
            (outlet.querySelector('h1[tabindex="-1"]') ?? outlet).focus({ preventScroll: true });
            window.scrollTo({ top: 0 });
        }
        firstViewRendered = true;
    }

    // --------------------------------------------------------
    // Cierre de sesión
    // --------------------------------------------------------
    async function logout(button) {
        const restore = button ? setButtonBusy(button, 'Cerrando sesión…') : () => {};
        try {
            await session.signOut();
            // onSessionChange lleva al login con el aviso correspondiente.
        } catch (err) {
            restore();
            toast(await reportError(err, 'Cierre de sesión'), 'error');
        }
    }
}
