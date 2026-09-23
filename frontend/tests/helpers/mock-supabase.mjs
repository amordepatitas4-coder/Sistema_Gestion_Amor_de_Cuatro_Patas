// Cliente Supabase simulado para pruebas de sesión (sin red ni credenciales).
// Reproduce solo lo que usa js/core/session.js.

export function mockClient({
    profile = { id_usuario: 'u1', nombre: 'Usuaria QA', activo: true },
    profileError = null,
    signInError = null,
    signOutError = null,
    delay = 5,
} = {}) {
    const calls = { select: 0, signIn: 0, signOut: 0 };
    let authCallback = null;
    const session = { user: { id: 'u1', email: 'qa@example.invalid' } };
    const wait = () => new Promise((r) => setTimeout(r, delay));

    const client = {
        calls,
        profile,
        /** Emite un evento de Supabase Auth hacia la sesión. */
        emit: (event, s = session) => authCallback?.(event, s),
        auth: {
            onAuthStateChange(cb) {
                authCallback = cb;
                return { data: { subscription: { unsubscribe() {} } } };
            },
            async signInWithPassword() {
                calls.signIn++;
                await wait();
                return signInError ? { data: {}, error: signInError } : { data: { session }, error: null };
            },
            async signOut() {
                calls.signOut++;
                await wait();
                return { error: signOutError };
            },
            async getSession() {
                return { data: { session } };
            },
        },
        from() {
            const query = {
                select: () => query,
                eq: () => query,
                async maybeSingle() {
                    calls.select++;
                    await wait();
                    return client.profileError
                        ? { data: null, error: client.profileError }
                        : { data: client.profile, error: null };
                },
            };
            return query;
        },
        profileError,
    };
    return client;
}

/** Espera a que se procesen eventos diferidos con setTimeout. */
export const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
