// Pruebas de js/core/router.js y js/routes.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/core/router.js';
import { NAV_ITEMS, ROUTES } from '../js/routes.js';

test('Parseo de hash, query y parámetros', () => {
    const r = R.parseHash('#/animales/12/salud?estado=3');
    assert.equal(r.path, '/animales/12/salud');
    assert.equal(r.query.get('estado'), '3');
    assert.equal(R.parseHash('').path, '/');
    const routes = [{ path: '/animales/:id/:tab?' }, { path: '/animales' }];
    assert.deepEqual(R.matchRoute(routes, '/animales/12/salud').params, { id: '12', tab: 'salud' });
    assert.deepEqual(R.matchRoute(routes, '/animales/12').params, { id: '12' });
    assert.equal(R.matchRoute(routes, '/otra'), null);
    assert.equal(R.buildHash('/animales', { estado: 3, q: '', x: null }), '#/animales?estado=3');
});

test('Detecta respuestas de Supabase Auth en la URL', () => {
    assert.ok(R.isAuthCallback('#access_token=abc&type=invite'));
    assert.ok(R.isAuthCallback('#error=access_denied&error_description=expired'));
    assert.ok(!R.isAuthCallback('#/informes?type=gastos'));
    assert.ok(!R.isAuthCallback('#/panel'));
});

test('Menú: 9 módulos en el orden del Prompt Maestro §5.2', () => {
    assert.deepEqual(NAV_ITEMS.map((n) => n.label), ['Panel principal', 'Animales', 'Hogares temporales', 'Adopciones', 'Gastos', 'Proyectos de esterilización', 'Documentos', 'Informes', 'Configuración']);
    for (const item of NAV_ITEMS) assert.ok(R.matchRoute(ROUTES, item.path), item.path);
    assert.ok(R.matchRoute(ROUTES, '/login').route.public);
    assert.equal(ROUTES.filter((r) => r.public).length, 1);
});

test('Ficha con pestañas y listado no se confunden (REG-09)', () => {
    assert.equal(R.matchRoute(ROUTES, '/animales').route.path, '/animales');
    assert.deepEqual(R.matchRoute(ROUTES, '/animales/12').params, { id: '12' });
    assert.deepEqual(R.matchRoute(ROUTES, '/animales/12/historial').params, { id: '12', tab: 'historial' });
    assert.equal(R.matchRoute(ROUTES, '/hogares').route.path, '/hogares');
});

test('Rutas de Esterilización y Configuración (Etapas 8 y 11)', () => {
    assert.equal(R.matchRoute(ROUTES, '/esterilizacion').route.path, '/esterilizacion');
    assert.deepEqual(R.matchRoute(ROUTES, '/esterilizacion/2/nomina').params, { id: '2', tab: 'nomina' });
    assert.equal(R.matchRoute(ROUTES, '/esterilizacion/2/nomina').route.module.path, '/esterilizacion');
    assert.equal(R.matchRoute(ROUTES, '/configuracion').route.path, '/configuracion');
    assert.deepEqual(R.matchRoute(ROUTES, '/configuracion/catalogos').params, { section: 'catalogos' });
    assert.equal(R.matchRoute(ROUTES, '/configuracion/usuarios').route.module.path, '/configuracion');
    assert.ok(!ROUTES.some((r) => r.load && String(r.load).includes('placeholder') && ['/esterilizacion', '/documentos', '/informes', '/configuracion'].includes(r.path)));
});
