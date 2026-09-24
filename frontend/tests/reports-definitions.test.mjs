// Pruebas de js/views/reports/definitions.js (PA-INF-04..09, REG-08 lógico).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/views/reports/definitions.js';
import { toCSV } from '../js/core/export.js';

const q = (obj) => new URLSearchParams(obj);

test('Seis informes con filtros propios; ninguno usa la clave reservada "tipo"', () => {
    assert.deepEqual(R.REPORTS.map((r) => r.key), ['animales', 'adopciones', 'atenciones', 'hogares', 'gastos', 'esterilizaciones']);
    R.REPORTS.forEach((r) => r.filters.forEach((f) => assert.ok(!R.RESERVED_KEYS.includes(f.key), `${r.key}.${f.key}`)));
});

test('Filtros contextuales: Gastos no muestra campos de esterilización (PA-INF-04)', () => {
    const gastos = R.findReport('gastos').filters.map((f) => f.key);
    assert.deepEqual(gastos, ['desde', 'hasta', 'categoria', 'animal']);
    const ester = R.findReport('esterilizaciones').filters.map((f) => f.key);
    assert.ok(ester.includes('proyecto') && ester.includes('profesional') && !ester.includes('categoria'));
});

test('Solo se leen de la URL las claves del informe seleccionado', () => {
    const f = R.readReportFilters(R.findReport('gastos'), q({ tipo: 'gastos', desde: '2026-09-01', proyecto: '2' }));
    assert.deepEqual(f, { desde: '2026-09-01', hasta: '', categoria: '', animal: '' });
});

test('Rango de fechas válido (PA-INF-05)', () => {
    assert.deepEqual(R.validateReportFilters({ desde: '2026-09-01', hasta: '2026-09-30' }), {});
    assert.match(R.validateReportFilters({ desde: '2026-09-30', hasta: '2026-09-01' }).hasta, /anterior/);
    assert.ok(R.validateReportFilters({ desde: '2026-02-31' }).desde);
});

test('Gastos: filtro por animal y totales calculados solo desde las filas', () => {
    const rep = R.findReport('gastos');
    const rows = [
        { monto: 10000, asignaciones: [{ id_animal: 6, monto_asignado: 10000 }] },
        { monto: 10000, asignaciones: [{ id_animal: 6, monto_asignado: 4000 }, { id_animal: 7, monto_asignado: 6000 }] },
        { monto: 5000, asignaciones: [] },
    ];
    const filtered = rep.clientFilter(rows, { animal: '6' });
    assert.equal(filtered.length, 2);
    const s = Object.fromEntries(rep.summary(filtered, { animal: '6' }).map((x) => [x.label, x.value]));
    assert.equal(s['Monto total'], 20000);
    assert.equal(s['Asignado a animales'], 20000);
    assert.equal(s['No asignado (general)'], 0);
    assert.equal(s['Asignado al animal filtrado'], 14000);
    const all = Object.fromEntries(rep.summary(rows, {}).map((x) => [x.label, x.value]));
    assert.equal(all['No asignado (general)'], 5000);
});

test('Esterilizaciones: filtro por profesional (N:M) y resumen', () => {
    const rep = R.findReport('esterilizaciones');
    const rows = [
        { id_proyecto: 2, sexo: 'Hembra', profesionales: [{ id_profesional: 2 }, { id_profesional: 3 }], archivos: [{ id_archivo: 5 }] },
        { id_proyecto: 2, sexo: 'Macho', profesionales: [{ id_profesional: 2 }], archivos: [] },
        { id_proyecto: 3, sexo: 'Hembra', profesionales: [{ id_profesional: 2 }], archivos: [{ id_archivo: 9 }] },
    ];
    assert.equal(rep.clientFilter(rows, { profesional: '3' }).length, 1);
    const s = Object.fromEntries(rep.summary(rows, {}).map((x) => [x.label, x.value]));
    assert.equal(s.Esterilizaciones, 3);
    assert.equal(s.Hembra, 2);
    assert.equal(s['Con documento'], 2);
    assert.equal(s.Proyectos, 2);
});

test('Hogares: días de permanencia desde fechas reales', () => {
    assert.equal(R.stayDays('2026-09-01', '2026-09-11'), 10);
    assert.equal(R.stayDays('2026-09-20', null, '2026-09-23'), 3);
    assert.equal(R.stayDays(null, null), null);
});

test('Descripción de filtros aplicados y exportación sin columnas técnicas (PA-INF-09)', () => {
    const rep = R.findReport('animales');
    assert.equal(R.describeFilters(rep, { desde: '', especie: '' }), 'Sin filtros (todos los registros)');
    assert.equal(R.describeFilters(rep, { especie: '1', sexo: 'Hembra' }, { especie: 'Canino' }), 'Especie: Canino · Sexo: Hembra');
    const csv = toCSV(rep.columns, [{ id_animal: 6, nombre: 'Luna Prueba QA', sexo: 'Hembra', microchip: '000000000000101', fecha_rescate: '2026-09-01' }]);
    const [header, line] = csv.replace('﻿', '').split('\r\n');
    assert.ok(!/id_|path|carpeta|externo/i.test(header));
    assert.ok(line.startsWith('Luna Prueba QA;;Hembra;;;="000000000000101";;2026-09-01;'));
});
