// Pruebas de tools/write-config.mjs (despliegue: config.js solo con configuración pública).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../tools/write-config.mjs';

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

test('Genera config.js con URL y clave anon/publishable', () => {
    const out = buildConfig({ SUPABASE_URL: 'https://abcdefg.supabase.co/', SUPABASE_ANON_KEY: jwt('anon') });
    assert.match(out, /export const SUPABASE_URL = 'https:\/\/abcdefg\.supabase\.co';/);
    assert.match(out, /export const SUPABASE_ANON_KEY = 'x\./);
    assert.ok(buildConfig({ SUPABASE_URL: 'https://abcdefg.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_123' }));
});

test('Rechaza claves secretas (service_role / sb_secret_) y datos faltantes o inválidos', () => {
    assert.throws(() => buildConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: jwt('service_role') }), /secreta/);
    assert.throws(() => buildConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_abc' }), /secreta/);
    assert.throws(() => buildConfig({}), /Faltan/);
    assert.throws(() => buildConfig({ SUPABASE_URL: 'http://a.supabase.co', SUPABASE_ANON_KEY: 'k' }), /https/);
    assert.throws(() => buildConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: "k';alert(1)//" }), /no válidos/);
});
