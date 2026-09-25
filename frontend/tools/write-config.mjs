// ============================================================
// Genera js/config.js en el servicio de despliegue a partir de
// variables de entorno (despliegue de prueba).
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_ANON_KEY=<clave anon o publishable> \
//   node tools/write-config.mjs
//
// - js/config.js sigue fuera de Git: se crea solo en el servidor
//   de despliegue (build) con la configuración PÚBLICA del cliente.
// - Rechaza claves service_role / sb_secret_ (mismo criterio que
//   js/supabase.js): nunca deben llegar al navegador.
// - No sobrescribe un config.js local existente salvo --force o si
//   se ejecuta en un servicio de despliegue (CF_PAGES / NETLIFY / CI).
// - No imprime la URL ni la clave.
// ============================================================

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function jwtRole(token) {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role ?? null;
    } catch {
        return null;
    }
}

/** Valida la configuración y devuelve el contenido de config.js (lanza Error si no es válida). */
export function buildConfig(env) {
    const url = String(env.SUPABASE_URL ?? '').trim();
    const key = String(env.SUPABASE_ANON_KEY ?? '').trim();
    if (!url || !key) throw new Error('Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw new Error('SUPABASE_URL debe ser https://<proyecto>.supabase.co');
    if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
        throw new Error('La clave indicada es secreta (service_role / sb_secret_). Usa la clave anon o publishable.');
    }
    // Evita que un valor con comillas o saltos de línea rompa (o inyecte código en) el archivo generado.
    if (/['"\\\n\r]/.test(url + key)) throw new Error('La configuración contiene caracteres no válidos.');
    return `// Generado en el despliegue por tools/write-config.mjs. No versionar.\n`
        + `export const SUPABASE_URL = '${url.replace(/\/$/, '')}';\n`
        + `export const SUPABASE_ANON_KEY = '${key}';\n`;
}

// Solo escribe el archivo al ejecutarse como comando; los tests importan buildConfig sin efectos secundarios.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'config.js');
    const onHost = Boolean(process.env.CF_PAGES || process.env.NETLIFY || process.env.CI);
    if (existsSync(target) && !onHost && !process.argv.includes('--force')) {
        console.error('js/config.js ya existe; no se sobrescribe (usa --force si corresponde).');
        process.exit(1);
    }
    try {
        writeFileSync(target, buildConfig(process.env), 'utf8');
        console.log('js/config.js generado (configuración pública del cliente).');
    } catch (err) {
        console.error(`No se generó js/config.js: ${err.message}`);
        process.exit(1);
    }
}
