// Pruebas de js/views/adoptions/logic.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/views/adoptions/logic.js';

function formData(obj) {
    const d = new FormData();
    Object.entries(obj).forEach(([k, v]) => d.append(k, v));
    return d;
}

test('medio_contacto: valores exactos del CHECK del backend (REG-10, PA-SEG-01..03)', () => {
    assert.deepEqual(A.MEDIOS_CONTACTO.map((m) => m.value), ['WhatsApp', 'Telefono', 'Correo', 'Visita', 'Otro']);
    assert.equal(A.medioLabel('Telefono'), 'Teléfono');
    assert.ok(!A.MEDIOS_CONTACTO.some((m) => m.value === 'Email' || m.value === 'Teléfono'));
});

test('Adoptante: RUT se normaliza a 12345678-9 al capturar', () => {
    const v = A.collectAdopter(formData({ nombre: ' Adoptante Prueba QA ', rut: '12.345.678-5', email: '' }));
    assert.equal(v.nombre, 'Adoptante Prueba QA');
    assert.equal(v.rut, '12345678-5');
    assert.ok(v.rutValido);
    assert.equal(v.email, null);
});

test('Adoptante: RUT inválido y duplicado con otro formato (PA-ADO-01/02)', () => {
    const invalid = A.collectAdopter(formData({ nombre: 'QA', rut: '12.345.678-9' }));
    assert.ok(A.validateAdopter(invalid).rut);
    const v = A.collectAdopter(formData({ nombre: 'QA', rut: '12345678-5' }));
    const existing = [{ id_adoptante: 1, nombre: 'Otro', rut: '12.345.678-5' }];
    assert.match(A.validateAdopter(v, existing).rut, /Ya existe/);
    assert.deepEqual(A.validateAdopter(v, existing, 1), {}); // editando el mismo adoptante
    assert.ok(A.validateAdopter({ ...v, email: 'x@' }).email);
});

test('Adopción: elegibilidad y validación de fecha contra hogar activo', () => {
    assert.ok(A.canAdopt('Disponible para adopción', false));
    assert.ok(A.canAdopt('En hogar temporal', false));
    assert.ok(!A.canAdopt('Adoptado', false));
    assert.ok(!A.canAdopt('Rescatado', true));
    const ok = { idAnimal: 1, idAdoptante: 2, fecha: '2026-09-23' };
    assert.deepEqual(A.validateAdoption(ok), {});
    assert.ok(A.validateAdoption(ok, { fechaIngresoHogar: '2026-09-24' }).fecha);
    assert.ok(A.validateAdoption({ ...ok, idAdoptante: null }).adoptante);
});

test('Seguimiento: fecha no anterior a la adopción y medio válido (PA-SEG-04)', () => {
    assert.deepEqual(A.validateFollowUp({ fecha: '2026-09-23', medio: 'Telefono' }, '2026-09-23'), {});
    assert.ok(A.validateFollowUp({ fecha: '2026-09-22', medio: 'Telefono' }, '2026-09-23').fecha);
    assert.ok(A.validateFollowUp({ fecha: '2026-09-23', medio: 'Email' }, '2026-09-23').medio);
});

test('Devolución: excluye Adoptado y En hogar temporal; fecha válida (PA-DEV-01)', () => {
    const estados = [
        { id: 1, nombre: 'Rescatado', activo: true },
        { id: 3, nombre: 'En hogar temporal', activo: true },
        { id: 4, nombre: 'Disponible para adopción', activo: true },
        { id: 5, nombre: 'Adoptado', activo: true },
    ];
    assert.deepEqual(A.returnStateOptions(estados).map((e) => e.nombre), ['Rescatado', 'Disponible para adopción']);
    assert.ok(A.validateReturn({ fecha: '2026-09-01', idNuevoEstado: 4 }, '2026-09-23').fecha);
    assert.ok(A.validateReturn({ fecha: '2026-09-23' }, '2026-09-23').estado);
});
