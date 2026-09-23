// Pruebas de js/views/expenses/logic.js (RN-57, REG-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/views/expenses/logic.js';

test('parseAmount acepta formatos habituales de CLP', () => {
    assert.equal(G.parseAmount('50000'), 50000);
    assert.equal(G.parseAmount('50.000'), 50000);
    assert.equal(G.parseAmount('$ 50.000'), 50000);
    assert.equal(G.parseAmount('0'), null);
    assert.equal(G.parseAmount('12,5'), null);
    assert.equal(G.parseAmount(''), null);
});

test('Resumen total / asignado / no asignado', () => {
    assert.deepEqual(G.summarize(10000, [4000, 6000]), { total: 10000, asignado: 10000, restante: 0, excede: false });
    assert.deepEqual(G.summarize(10000, [3000]), { total: 10000, asignado: 3000, restante: 7000, excede: false });
    assert.equal(G.summarize(10000, [10001]).excede, true);
});

test('Asignación igual al total es válida (PA-GAS-02, REG-05)', () => {
    const e = G.validateAllocations(10000, [{ idAnimal: 1, monto: 10000 }]);
    assert.ok(!G.hasAllocationErrors(e));
});

test('Parcial y compartido válidos; exceso rechazado (PA-GAS-03/04/05)', () => {
    assert.ok(!G.hasAllocationErrors(G.validateAllocations(10000, [{ idAnimal: 1, monto: 3000 }])));
    assert.ok(!G.hasAllocationErrors(G.validateAllocations(10000, [{ idAnimal: 1, monto: 4000 }, { idAnimal: 2, monto: 6000 }])));
    const over = G.validateAllocations(10000, [{ idAnimal: 1, monto: 10001 }]);
    assert.match(over.general, /supera/);
    assert.ok(G.validateAllocations(10000, [{ idAnimal: 1, monto: 5000 }], 6000).general); // con lo ya asignado
});

test('Filas: animal repetido, monto faltante, animal faltante (PA-GAS-07)', () => {
    const e = G.validateAllocations(10000, [
        { idAnimal: 1, monto: 1000 }, { idAnimal: 1, monto: 1000 }, { idAnimal: 2, monto: null }, { idAnimal: null, monto: 500 },
    ]);
    assert.ok(e.rows[1]); assert.ok(e.rows[2]); assert.ok(e.rows[3]); assert.equal(e.rows[0], undefined);
});

test('Gasto: campos obligatorios y monto mínimo al editar', () => {
    const d = new FormData();
    [['fecha', '2026-09-23'], ['categoria', '1'], ['descripcion', 'Gasto Prueba QA'], ['monto', '10.000']].forEach(([k, v]) => d.append(k, v));
    const v = G.collectExpense(d);
    assert.equal(v.monto, 10000);
    assert.deepEqual(G.validateExpense(v), {});
    assert.ok(G.validateExpense(v, { minimoAsignado: 12000 }).monto);
    assert.ok(G.validateExpense({ ...v, descripcion: null }).descripcion);
    assert.ok(G.validateExpense({ ...v, monto: null, montoTexto: 'abc' }).monto);
});
