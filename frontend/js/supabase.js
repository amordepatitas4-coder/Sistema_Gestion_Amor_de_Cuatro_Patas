// ============================================================
// Cliente Supabase del navegador.
//
// Lee la configuración pública desde js/config.js (ignorado por Git;
// ver js/config.example.js). Solo se admiten valores destinados al
// cliente: URL del proyecto y clave anon/publishable.
//
// Por seguridad, si la clave corresponde a service_role o a una
// clave secreta, el cliente NO se crea.
// Nunca registrar en consola la URL ni la clave.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';

let config = {};
try {
    // Importación dinámica: si config.js no existe, la app muestra un aviso en vez de fallar al cargar.
    config = await import('./config.js');
} catch {
    config = {};
}

const url = typeof config.SUPABASE_URL === 'string' ? config.SUPABASE_URL.trim() : '';
const key = typeof config.SUPABASE_ANON_KEY === 'string' ? config.SUPABASE_ANON_KEY.trim() : '';

// Lee el rol dentro del JWT (sin validarlo) solo para rechazar claves de servidor por error.
function jwtRole(token) {
    try {
        const payload = token.split('.')[1];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json).role ?? null;
    } catch {
        return null;
    }
}

function checkConfig() {
    if (!url || !key || url.includes('TU-PROYECTO') || key.includes('TU_CLAVE')) {
        return 'missing';
    }
    if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
        return 'invalid';
    }
    if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
        return 'forbidden-key';
    }
    return null;
}

/** null si la configuración es válida; si no, 'missing' | 'invalid' | 'forbidden-key'. */
export const configProblem = checkConfig();

export const supabase = configProblem
    ? null
    : createClient(url, key, {
        auth: {
            // La sesión se guarda en el navegador y el token se renueva solo; detectSessionInUrl procesa los enlaces de invitación y recuperación.
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });
