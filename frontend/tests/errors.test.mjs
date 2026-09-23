// Pruebas de js/core/errors.js: traducción de errores técnicos a mensajes seguros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, MESSAGES, describeError } from '../js/core/errors.js';

test('Credenciales incorrectas y red', async () => {
    assert.equal(await describeError({ __isAuthError: true, name: 'AuthApiError', code: 'invalid_credentials', status: 400 }), MESSAGES.invalidCredentials);
    assert.equal(await describeError(new TypeError('Failed to fetch')), MESSAGES.network);
});

test('PostgREST: negocio (P0001), UNIQUE, CHECK y permisos', async () => {
    assert.equal(await describeError({ code: 'P0001', message: 'El animal ya posee una adopción activa.' }), 'El animal ya posee una adopción activa.');
    assert.equal(await describeError({ code: '23505', message: 'duplicate key value violates unique constraint "uq_animal_microchip"' }), 'Ya existe un animal registrado con ese microchip.');
    assert.equal(await describeError({ code: '23505', message: 'duplicate key value violates unique constraint "uq_adoptante_rut"' }), 'Ya existe un adoptante registrado con ese RUT.');
    assert.equal(await describeError({ code: '23514', message: 'new row violates check constraint "chk_atencion_proximo_control"' }), 'El próximo control no puede ser anterior a la fecha de la atención.');
    assert.equal(await describeError({ code: '42501', message: 'permission denied' }), MESSAGES.permission);
});

test('Edge Functions: se lee el cuerpo { error } de la respuesta', async () => {
    const err = { name: 'FunctionsHttpError', context: new Response(JSON.stringify({ error: 'El archivo supera el límite de 10 MB.' }), { status: 400 }) };
    assert.equal(await describeError(err), 'El archivo supera el límite de 10 MB.');
});

test('Errores propios y desconocidos', async () => {
    assert.equal(await describeError(new AppError('Mensaje propio')), 'Mensaje propio');
    assert.equal(await describeError({ weird: true }), MESSAGES.generic);
});
