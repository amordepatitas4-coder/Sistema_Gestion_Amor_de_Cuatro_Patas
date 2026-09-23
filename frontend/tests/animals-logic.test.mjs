// Pruebas de js/views/animals/logic.js y js/core/images.js (lógica pura).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/views/animals/logic.js';
import { fitWithin } from '../js/core/images.js';

const estados = [
    { id: 1, nombre: 'Rescatado', activo: true },
    { id: 2, nombre: 'En tratamiento', activo: true },
    { id: 3, nombre: 'En hogar temporal', activo: true },
    { id: 4, nombre: 'Disponible para adopción', activo: true },
    { id: 5, nombre: 'Adoptado', activo: true },
    { id: 6, nombre: 'Estado inactivo', activo: false },
];
const animals = [
    { id_animal: 1, nombre: 'Luna Prueba QA', microchip: '000000000000101', id_estado_actual: 1, id_especie: 1, sexo: 'Hembra', fecha_rescate: '2026-09-10' },
    { id_animal: 2, nombre: 'Ñandú', microchip: null, id_estado_actual: 5, id_especie: 2, sexo: 'Macho', fecha_rescate: '2026-08-31' },
    { id_animal: 3, nombre: null, microchip: '152000000000777', id_estado_actual: 3, id_especie: 1, sexo: 'Desconocido', fecha_rescate: '2026-09-01' },
];
const f = (o) => ({ q: '', estado: '', especie: '', sexo: '', desde: '', hasta: '', modo: 'tarjetas', ...o });
const ids = (list) => list.map((a) => a.id_animal);

function formData(obj) {
    const d = new FormData();
    Object.entries(obj).forEach(([k, v]) => d.append(k, v));
    return d;
}

test('Filtro "activos" excluye Adoptado (REG-12 / PA-DAS-02)', () => {
    assert.deepEqual(ids(L.applyFilters(animals, f({ estado: 'activos' }), { adoptadoId: 5 })), [1, 3]);
});

test('Búsqueda por nombre sin tildes y por microchip (PA-ANI-05/06)', () => {
    assert.deepEqual(ids(L.applyFilters(animals, f({ q: 'luna' }))), [1]);
    assert.deepEqual(ids(L.applyFilters(animals, f({ q: 'nandu' }))), [2]);
    assert.deepEqual(ids(L.applyFilters(animals, f({ q: '000777' }))), [3]);
});

test('Estado, especie, sexo y rango de rescate (PA-DAS-04)', () => {
    assert.deepEqual(ids(L.applyFilters(animals, f({ estado: '3' }))), [3]);
    assert.deepEqual(ids(L.applyFilters(animals, f({ especie: '1', sexo: 'Hembra' }))), [1]);
    assert.deepEqual(ids(L.applyFilters(animals, f({ desde: '2026-09-01', hasta: '2026-09-30' }))), [1, 3]);
    assert.equal(L.applyFilters(animals, f({ q: 'zzz' })).length, 0);
});

test('Filtros: ida y vuelta con la URL', () => {
    const fl = L.readFilters(new URLSearchParams('estado=activos&modo=lista&desde=2026-09-01'));
    assert.equal(fl.modo, 'lista');
    assert.deepEqual(L.filtersToQuery(fl), { estado: 'activos', desde: '2026-09-01', modo: 'lista' });
    assert.ok(L.hasActiveFilters(fl));
    assert.ok(!L.hasActiveFilters(L.readFilters(new URLSearchParams('modo=lista'))));
});

test('collectAnimal: 14 campos, "" → null, ids numéricos (REG-03/04)', () => {
    const v = L.collectAnimal(formData({ nombre: ' Luna Prueba QA ', id_especie: '1', id_rango_etario: '', sexo: 'Hembra', tamano: '', fecha_rescate: '2026-09-23', microchip: '000 000 000 000 101' }));
    assert.equal(v.nombre, 'Luna Prueba QA'); assert.equal(v.id_especie, 1); assert.equal(v.id_rango_etario, null);
    assert.equal(v.tamaño, null); assert.equal(v.microchip, '000000000000101'); assert.equal(v.estado_registro_nacional, null);
    assert.equal(Object.keys(v).length, 14);
});

test('validateAnimal alineada con CHECK del backend (PA-REG-03/04)', () => {
    const ok = { id_especie: 1, sexo: 'Macho', fecha_rescate: '2026-09-23', microchip: '123456789012345' };
    assert.deepEqual(L.validateAnimal(ok), {});
    assert.ok(L.validateAnimal({ ...ok, microchip: '12345' }).microchip);
    assert.ok(L.validateAnimal({ ...ok, fecha_nacimiento: '2026-09-24' }).fecha_nacimiento);
    assert.ok(L.validateAnimal({ ...ok, id_especie: null }).id_especie);
    assert.ok(L.validateAnimal({ ...ok, fecha_rescate: null }).fecha_rescate);
    assert.ok(L.validateAnimal({ ...ok, sexo: 'Otro' }).sexo);
});

test('Cambio manual de estado: sin reservados, inactivos ni el actual (PA-EST-02)', () => {
    assert.deepEqual(L.manualStateOptions(estados, 1).map((e) => e.nombre), ['En tratamiento', 'Disponible para adopción']);
    assert.ok(L.manualChangeBlock('En hogar temporal', true));
    assert.ok(L.manualChangeBlock('Rescatado', true));
    assert.equal(L.manualChangeBlock('Adoptado', false).tab, 'adopcion');
    assert.equal(L.manualChangeBlock('Rescatado', false), null);
    assert.deepEqual(L.exitStateOptions(estados, 3).map((e) => e.nombre), ['Rescatado', 'En tratamiento', 'Disponible para adopción']);
});

test('Elegibilidad para ingresar a un hogar temporal', () => {
    assert.ok(L.canEnterHome('Rescatado', false));
    assert.ok(!L.canEnterHome('Rescatado', true));
    assert.ok(!L.canEnterHome('Adoptado', false));
});

test('Salud: próximo control y validación (PA-SAL-04)', () => {
    assert.equal(L.controlStatus('2026-09-20', '2026-09-23'), 'pasado');
    assert.equal(L.controlStatus('2026-09-28', '2026-09-23'), 'proximo');
    assert.equal(L.controlStatus('2026-11-01', '2026-09-23'), 'programado');
    assert.equal(L.controlStatus(null), null);
    assert.ok(L.validateAttention({ id_tipo_atencion: 1, fecha: '2026-09-23', proximo_control: '2026-09-22' }).proximo_control);
    assert.deepEqual(L.validateAttention({ id_tipo_atencion: 1, fecha: '2026-09-23', proximo_control: '2026-09-23' }), {});
    assert.ok(L.validateAttention({ fecha: '2026-09-23' }).tipo);
});

test('Nombre visible para animal sin nombre', () => {
    assert.equal(L.animalName({ id_animal: 7, nombre: '  ' }), 'Animal sin nombre (N° 7)');
    assert.equal(L.animalName({ id_animal: 7, nombre: 'Luna' }), 'Luna');
});

test('Foto principal: máximo 1400 px conservando proporción', () => {
    assert.deepEqual(fitWithin(4000, 3000, 1400), { width: 1400, height: 1050 });
    assert.deepEqual(fitWithin(800, 600, 1400), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(1000, 5000, 1400), { width: 280, height: 1400 });
});
