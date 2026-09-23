// ============================================================
// Sesión y autorización de la usuaria.
//
// Supabase Auth es la única fuente de identidad. Una sesión válida
// NO basta para operar: la usuaria debe tener su perfil en
// public.usuario con activo = true. RLS oculta la fila a usuarias
// inactivas, por lo que "fila no visible" equivale a "no habilitada".
//
// El email se obtiene de Auth (session.user.email); no se duplica
// en public.usuario.
//
// Estados:
//   unknown   → aún no se conoce la sesión (arranque)
//   checking  → verificando perfil activo
//   anonymous → sin sesión (con aviso opcional: 'inactive', 'signedOut', 'expired')
//   active    → sesión válida y usuaria activa
//   error     → no se pudo verificar (p. ej. sin red); la sesión se conserva
// ============================================================

import { AppError, MESSAGES } from './errors.js';

const REVERIFY_INTERVAL_MS = 5 * 60 * 1000;

export function createSession(client) {
    let state = { status: 'unknown', user: null, profile: null, notice: null, error: null };
    let verifiedAt = 0;
    let inflight = null;           // { userId, promise }
    let signingIn = false;
    const listeners = new Set();

    function setState(patch) {
        state = { ...state, ...patch };
        listeners.forEach((fn) => fn(state));
    }

    /**
     * Comprueba que la usuaria de la sesión esté activa en public.usuario.
     * Reutiliza una verificación en curso para la misma usuaria.
     */
    function verify(session, { force = false } = {}) {
        if (!session?.user) {
            setState({ status: 'anonymous', user: null, profile: null, error: null });
            return Promise.resolve(state);
        }
        const userId = session.user.id;

        if (!force && state.status === 'active' && state.user?.id === userId) {
            setState({ user: session.user });
            return Promise.resolve(state);
        }
        if (inflight && inflight.userId === userId) return inflight.promise;

        const promise = (async () => {
            if (state.status !== 'active' || state.user?.id !== userId) {
                setState({ status: 'checking', error: null });
            }
            const { data, error } = await client
                .from('usuario')
                .select('id_usuario, nombre, activo, fecha_registro')
                .eq('id_usuario', userId)
                .maybeSingle();

            if (error) {
                // Revalidación de una usuaria ya activa que falla por un
                // problema transitorio: se mantiene el acceso y se reintenta
                // en la próxima oportunidad.
                if (state.status === 'active' && state.user?.id === userId) {
                    console.warn('[Sesión] No fue posible revalidar la cuenta; se reintentará.', error);
                    return state;
                }
                // Primera verificación fallida: no se concede acceso, pero
                // tampoco se cierra la sesión por un problema transitorio.
                setState({ status: 'error', user: session.user, profile: null, error });
                return state;
            }

            if (!data || data.activo !== true) {
                await client.auth.signOut({ scope: 'local' }).catch(() => {});
                setState({ status: 'anonymous', user: null, profile: null, notice: 'inactive', error: null });
                return state;
            }

            verifiedAt = Date.now();
            setState({ status: 'active', user: session.user, profile: data, notice: null, error: null });
            return state;
        })().finally(() => { if (inflight?.promise === promise) inflight = null; });

        inflight = { userId, promise };
        return promise;
    }

    function handleAuthEvent(event, session) {
        switch (event) {
            case 'SIGNED_OUT':
                verifiedAt = 0;
                setState({
                    status: 'anonymous', user: null, profile: null, error: null,
                    notice: state.notice ?? (state.status === 'active' ? 'expired' : null),
                });
                break;
            case 'INITIAL_SESSION':
                verify(session);
                break;
            case 'SIGNED_IN':
                // Durante signIn() la verificación la conduce el propio signIn.
                if (!signingIn) verify(session);
                break;
            case 'TOKEN_REFRESHED':
                // Oportunidad periódica (≈ cada hora) para detectar desactivación.
                verify(session, { force: true });
                break;
            case 'USER_UPDATED':
                if (session) setState({ user: session.user });
                break;
            default:
                break;
        }
    }

    return {
        get state() { return state; },

        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        /** Inicia la escucha de Auth. Supabase emite INITIAL_SESSION al suscribirse. */
        start() {
            const { data } = client.auth.onAuthStateChange((event, session) => {
                // No llamar a Supabase dentro del callback (riesgo de bloqueo):
                // se difiere al siguiente ciclo.
                setTimeout(() => handleAuthEvent(event, session), 0);
            });
            return () => data?.subscription?.unsubscribe();
        },

        /**
         * Inicia sesión y verifica que la usuaria esté activa.
         * Lanza AppError con mensaje apto para la UI si no puede ingresar.
         */
        async signIn(email, password) {
            if (signingIn) throw new AppError('Ya se está procesando el inicio de sesión.', { code: 'busy' });
            signingIn = true;
            try {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
                const result = await verify(data.session, { force: true });
                if (result.status === 'anonymous' && result.notice === 'inactive') {
                    throw new AppError(MESSAGES.inactive, { code: 'inactive' });
                }
                if (result.status === 'error') throw result.error;
                return result;
            } finally {
                signingIn = false;
            }
        },

        /** Cierra la sesión local. Si falla, la sesión se mantiene y se lanza el error. */
        async signOut() {
            const { error } = await client.auth.signOut({ scope: 'local' });
            if (error) throw error;
            verifiedAt = 0;
            setState({ status: 'anonymous', user: null, profile: null, notice: 'signedOut', error: null });
        },

        /** Vuelve a verificar tras un error transitorio. */
        async retry() {
            const { data } = await client.auth.getSession();
            return verify(data.session, { force: true });
        },

        /**
         * Revalida la condición de usuaria activa si pasó el intervalo.
         * Devuelve true si puede continuar.
         */
        async ensureActive() {
            if (state.status !== 'active') return false;
            if (Date.now() - verifiedAt < REVERIFY_INTERVAL_MS) return true;
            const { data } = await client.auth.getSession();
            const result = await verify(data.session, { force: true });
            return result.status === 'active';
        },

        clearNotice() { if (state.notice) setState({ notice: null }); },
    };
}
