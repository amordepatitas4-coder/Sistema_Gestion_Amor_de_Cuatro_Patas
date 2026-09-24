// Pruebas de js/core/session.js con cliente Supabase simulado (sin red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/core/session.js';
import { mockClient, tick } from './helpers/mock-supabase.mjs';

const authError = { __isAuthError: true, name: 'AuthApiError', code: 'invalid_credentials', status: 400 };

test('Usuaria activa inicia sesión → active (PA-AUT-01)', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    const st = await s.signIn('qa@example.invalid', 'x');
    assert.equal(st.status, 'active'); assert.equal(st.profile.nombre, 'Usuaria QA');
});

test('Usuaria inactiva → cierra sesión y error inactive (PA-AUT-05)', async () => {
    const c = mockClient({ profile: { id_usuario: 'u1', nombre: 'QA', activo: false } }); const s = createSession(c);
    await assert.rejects(s.signIn('a@b.cl', 'x'), (e) => e.code === 'inactive');
    assert.equal(s.state.status, 'anonymous'); assert.equal(s.state.notice, 'inactive'); assert.equal(c.calls.signOut, 1);
});

test('Fila oculta por RLS (null) se trata como no habilitada', async () => {
    const c = mockClient({ profile: null }); const s = createSession(c);
    await assert.rejects(s.signIn('a@b.cl', 'x'), (e) => e.code === 'inactive');
    assert.equal(s.state.status, 'anonymous');
});

test('Credenciales incorrectas no cambian el estado (PA-AUT-02)', async () => {
    const c = mockClient({ signInError: authError }); const s = createSession(c);
    await assert.rejects(s.signIn('a@b.cl', 'x'));
    assert.equal(s.state.status, 'unknown'); assert.equal(c.calls.select, 0);
});

test('Segundo inicio de sesión simultáneo rechazado (PA-AUT-03)', async () => {
    const c = mockClient(); const s = createSession(c);
    const first = s.signIn('a@b.cl', 'x');
    await assert.rejects(s.signIn('a@b.cl', 'x'), (e) => e.code === 'busy');
    await first; assert.equal(c.calls.signIn, 1);
});

test('Restauración + SIGNED_IN duplicado = una sola verificación', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    c.emit('INITIAL_SESSION'); c.emit('SIGNED_IN'); await tick(60);
    assert.equal(s.state.status, 'active'); assert.equal(c.calls.select, 1);
});

test('Sin sesión guardada → anonymous', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    c.emit('INITIAL_SESSION', null); await tick();
    assert.equal(s.state.status, 'anonymous');
});

test('Fallo de red en la primera verificación → error, sesión conservada', async () => {
    const c = mockClient({ profileError: new TypeError('Failed to fetch') }); const s = createSession(c); s.start();
    c.emit('INITIAL_SESSION'); await tick(60);
    assert.equal(s.state.status, 'error'); assert.equal(c.calls.signOut, 0);
});

test('Logout → anonymous con aviso signedOut (PA-AUT-04)', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    await s.signIn('a@b.cl', 'x'); await s.signOut(); c.emit('SIGNED_OUT', null); await tick();
    assert.equal(s.state.status, 'anonymous'); assert.equal(s.state.notice, 'signedOut');
});

test('Logout fallido mantiene la sesión y lanza error', async () => {
    const c = mockClient({ signOutError: new TypeError('Failed to fetch') }); const s = createSession(c);
    await s.signIn('a@b.cl', 'x');
    await assert.rejects(s.signOut()); assert.equal(s.state.status, 'active');
});

test('Expiración (SIGNED_OUT sin logout) → aviso expired', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    await s.signIn('a@b.cl', 'x'); c.emit('SIGNED_OUT', null); await tick();
    assert.equal(s.state.notice, 'expired');
});

test('Desactivación posterior detectada al renovar token', async () => {
    const c = mockClient(); const s = createSession(c); s.start();
    await s.signIn('a@b.cl', 'x'); c.profile.activo = false;
    c.emit('TOKEN_REFRESHED'); await tick(60);
    assert.equal(s.state.status, 'anonymous'); assert.equal(s.state.notice, 'inactive');
});

test('Revalidación con fallo de red no expulsa a una usuaria activa', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const c = mockClient(); const s = createSession(c); s.start();
    await s.signIn('a@b.cl', 'x'); c.profileError = new TypeError('Failed to fetch');
    c.emit('TOKEN_REFRESHED'); await tick(60);
    assert.equal(s.state.status, 'active');
});

test('Recuperación: solicita el correo nativo de Supabase con la URL de retorno; sin envíos simultáneos', async () => {
    const c = mockClient();
    const s = createSession(c);
    const p1 = s.requestPasswordReset('qa@example.invalid', 'https://sitio.pages.dev/');
    const p2 = s.requestPasswordReset('qa@example.invalid', 'https://sitio.pages.dev/');
    assert.equal(p1, p2);
    await p1;
    assert.deepEqual(c.calls.reset, [{ email: 'qa@example.invalid', options: { redirectTo: 'https://sitio.pages.dev/' } }]);
    await s.requestPasswordReset('qa@example.invalid', 'https://sitio.pages.dev/');
    assert.equal(c.calls.reset.length, 2);
});

test('Recuperación: un error de Supabase (p. ej. límite de envíos) se propaga', async () => {
    const c = mockClient({ resetError: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit' } });
    const s = createSession(c);
    await assert.rejects(() => s.requestPasswordReset('qa@example.invalid', 'https://x/'), (e) => e.code === 'over_email_send_rate_limit');
});

test('Evento PASSWORD_RECOVERY → sesión activa y aviso de recuperación una sola vez', async () => {
    const c = mockClient();
    const s = createSession(c);
    s.start();
    c.emit('PASSWORD_RECOVERY');
    await tick(60);
    assert.equal(s.state.status, 'active');
    assert.equal(s.consumePasswordRecovery(), true);
    assert.equal(s.consumePasswordRecovery(), false);
});

test('Recuperación de una cuenta inactiva: no queda marca pendiente para otra sesión', async () => {
    const c = mockClient({ profile: null });
    const s = createSession(c);
    s.start();
    c.emit('PASSWORD_RECOVERY');
    await tick(60);
    assert.equal(s.state.status, 'anonymous');
    assert.equal(s.consumePasswordRecovery(), false);
    c.profile = { id_usuario: 'u1', nombre: 'Usuaria QA', activo: true };
    c.emit('SIGNED_IN');
    await tick(60);
    assert.equal(s.state.status, 'active');
    assert.equal(s.consumePasswordRecovery(), false);
});
