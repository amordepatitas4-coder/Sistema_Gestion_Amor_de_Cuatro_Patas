// Pruebas de js/core/format.js: RUT, fechas locales, microchip, montos.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/core/format.js';

test('RUT: normaliza formatos habituales a 12345678-5', () => {
    assert.equal(F.normalizeRut('12.345.678-5'), '12345678-5');
    assert.equal(F.normalizeRut('123456785'), '12345678-5');
    assert.equal(F.normalizeRut(' 12345678 - 5 '), '12345678-5');
});

test('RUT: K mayúscula y dígito verificador', () => {
    assert.equal(F.computeRutDv('10000013'), 'K');
    assert.equal(F.normalizeRut('10.000.013-k'), '10000013-K');
    assert.equal(F.normalizeRut('11.111.111-1'), '11111111-1');
    assert.equal(F.computeRutDv('5126663'), '3');
});

test('RUT: rechaza dígito incorrecto o formato inválido', () => {
    assert.equal(F.normalizeRut('12.345.678-9'), null);
    assert.equal(F.normalizeRut('abc'), null);
    assert.equal(F.normalizeRut(''), null);
    assert.equal(F.normalizeRut('123456789012-3'), null);
});

test('Fechas DATE se interpretan en hora local (no UTC)', () => {
    assert.equal(F.parseISODate('2026-09-23').getDate(), 23);
    assert.equal(F.toISODate(new Date(2026, 8, 23, 23, 59)), '2026-09-23');
    assert.equal(F.parseISODate('2026-02-30'), null);
    assert.equal(F.formatDate(null), '—');
    assert.deepEqual(F.monthRangeISO(new Date(2026, 1, 10)), { from: '2026-02-01', to: '2026-02-28' });
});

test('Microchip, textos, enteros, correo y CLP', () => {
    assert.ok(F.isValidMicrochip('123456789012345'));
    assert.ok(!F.isValidMicrochip('12345678901234'));
    assert.ok(!F.isValidMicrochip('12345678901234a'));
    assert.equal(F.emptyToNull('  '), null);
    assert.equal(F.emptyToNull(' a '), 'a');
    assert.equal(F.parsePositiveInt('50000'), 50000);
    assert.equal(F.parsePositiveInt('0'), null);
    assert.equal(F.parsePositiveInt('1.5'), null);
    assert.ok(F.isValidEmail('qa@example.com'));
    assert.ok(!F.isValidEmail('qa@'));
    assert.match(F.formatCLP(50000), /50\.000/);
});
