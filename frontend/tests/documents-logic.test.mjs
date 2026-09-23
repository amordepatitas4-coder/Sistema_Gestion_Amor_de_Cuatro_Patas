// Pruebas de js/views/documents/logic.js (PA-DOC-03, PA-DOC-04, PA-DOC-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/views/documents/logic.js';

const luna = { id_animal: 6, nombre: 'Luna Prueba QA' };
const files = [
    { id_archivo: 1, id_categoria_archivo: 2, nombre_original: 'sanitario.pdf', fecha_documento: '2026-09-05', fecha_carga: '2026-09-23T10:00:00Z',
        categoria: { nombre: 'Documento sanitario' }, animal_archivo: [{ animal: luna }] },
    { id_archivo: 2, id_categoria_archivo: 1, nombre_original: 'contrato.pdf', fecha_documento: null, fecha_carga: '2026-09-23T12:00:00',
        categoria: { nombre: 'Contrato de adopción' }, adopcion_archivo: [{ adopcion: { id_adopcion: 6, animal: luna } }] },
    { id_archivo: 3, id_categoria_archivo: 5, nombre_original: 'ficha.pdf', fecha_documento: '2026-09-23', fecha_carga: '2026-09-23T12:00:00Z',
        categoria: { nombre: 'Documento de esterilización' },
        esterilizacion_archivo: [{ esterilizacion: { id_animal_esterilizacion: 4, codigo: 'EST-001', id_proyecto: 2, proyecto: { id_proyecto: 2, nombre: 'Proyecto Esterilización QA' } } }] },
    { id_archivo: 4, id_categoria_archivo: 4, nombre_original: 'bases.pdf', fecha_documento: null, fecha_carga: '2026-09-20T12:00:00',
        categoria: { nombre: 'Documento de proyecto' }, proyecto_archivo: [{ proyecto: { id_proyecto: 2, nombre: 'Proyecto Esterilización QA' } }] },
    // fundacion_archivo es 1:1 (UNIQUE id_archivo): PostgREST lo entrega como objeto.
    { id_archivo: 5, id_categoria_archivo: 6, nombre_original: 'acta.pdf', fecha_documento: '2026-09-23', fecha_carga: '2026-09-23T12:00:00Z',
        categoria: { nombre: 'Documento administrativo' }, fundacion_archivo: { id_fundacion_archivo: 1 } },
    { id_archivo: 6, id_categoria_archivo: 3, nombre_original: 'boleta.pdf', fecha_documento: null, fecha_carga: '2026-09-23T12:00:00Z',
        categoria: { nombre: 'Comprobante de gasto' }, gasto_archivo: [{ gasto: { id_gasto: 5, descripcion: 'Gasto exacto Prueba QA' } }] },
];

test('Contexto de cada archivo, con enlace a su registro', () => {
    assert.deepEqual(D.fileContexts(files[0]).map((c) => [c.tipo, c.href]), [['animal', '#/animales/6/archivos']]);
    assert.equal(D.fileContexts(files[1])[0].label, 'Adopción de Luna Prueba QA');
    assert.equal(D.fileContexts(files[2])[0].href, '#/esterilizacion/2/nomina');
    assert.equal(D.fileContexts(files[3])[0].href, '#/esterilizacion/2/documentacion');
    assert.deepEqual(D.fileContexts(files[4]).map((c) => c.tipo), ['fundacion']);
    assert.equal(D.fileContexts(files[5])[0].href, '#/gastos/5');
});

test('Asociación 1:1 como objeto o arreglo se normaliza', () => {
    assert.deepEqual(D.asList(null), []);
    assert.deepEqual(D.asList({ a: 1 }), [{ a: 1 }]);
    assert.deepEqual(D.asList([1, 2]), [1, 2]);
});

test('Búsqueda por nombre, categoría y contexto (PA-DOC-03)', () => {
    assert.deepEqual(D.filterDocuments(files, { q: 'contrato' }).map((f) => f.id_archivo), [2]);
    assert.deepEqual(D.filterDocuments(files, { q: 'sanitario' }).map((f) => f.id_archivo), [1]);
    assert.deepEqual(D.filterDocuments(files, { q: 'est-001' }).map((f) => f.id_archivo), [3]);
});

test('Filtros de contexto, animal, proyecto y categoría (PA-DOC-04)', () => {
    assert.deepEqual(D.filterDocuments(files, { contexto: 'fundacion' }).map((f) => f.id_archivo), [5]);
    assert.deepEqual(D.filterDocuments(files, { animal: '6' }).map((f) => f.id_archivo), [1, 2]);
    assert.deepEqual(D.filterDocuments(files, { proyecto: '2' }).map((f) => f.id_archivo), [3, 4]);
    assert.deepEqual(D.filterDocuments(files, { proyecto: '2', categoria: '4' }).map((f) => f.id_archivo), [4]);
    assert.equal(D.filterDocuments(files, {}).length, files.length);
});

test('Rango de fechas: fecha del documento o fecha local de carga', () => {
    assert.equal(D.effectiveDate(files[0]), '2026-09-05');
    assert.equal(D.effectiveDate(files[3]), '2026-09-20');
    assert.deepEqual(D.filterDocuments(files, { desde: '2026-09-01', hasta: '2026-09-10' }).map((f) => f.id_archivo), [1]);
    assert.equal(D.filterDocuments(files, { desde: '2026-10-01' }).length, 0);
});

test('Opciones de filtro solo con animales y proyectos que tienen documentos', () => {
    const o = D.filterOptions(files);
    assert.deepEqual(o.animals, [{ value: 6, label: 'Luna Prueba QA' }]);
    assert.deepEqual(o.projects, [{ value: 2, label: 'Proyecto Esterilización QA' }]);
});
