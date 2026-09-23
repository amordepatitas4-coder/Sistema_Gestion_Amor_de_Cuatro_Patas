// Pruebas de js/views/sterilization/logic.js y js/core/export.js
// (PA-PRO-01, PA-NOM-*, PA-PRF-*, PA-PDF-01/02, exportación de nómina).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/views/sterilization/logic.js';
import { csvCell, csvFileName, toCSV } from '../js/core/export.js';

const fd = (obj) => ({ get: (k) => (k in obj ? obj[k] : null) });

test('Proyecto: nombre y estado obligatorios; sin meta ni URL Drive (PA-PRO-01)', () => {
    const v = S.collectProject(fd({ id_estado_proyecto: '1', nombre: '  Proyecto Esterilización QA ', fecha_inicio: '2026-09-01', fecha_fin: '' }));
    assert.equal(v.nombre, 'Proyecto Esterilización QA');
    assert.equal(v.fecha_fin, null);
    assert.ok(!('id_carpeta_drive' in v));
    assert.deepEqual(S.validateProject(v), {});
    assert.ok(S.validateProject({ ...v, nombre: null }).nombre);
    assert.ok(S.validateProject({ ...v, id_estado_proyecto: null }).id_estado_proyecto);
});

test('Proyecto: fecha de término no anterior al inicio (chk_proyecto_fechas)', () => {
    const base = { id_estado_proyecto: 1, nombre: 'X', fecha_inicio: '2026-09-10', fecha_fin: '2026-09-09' };
    assert.match(S.validateProject(base).fecha_fin, /anterior/);
    assert.deepEqual(S.validateProject({ ...base, fecha_fin: '2026-09-10' }), {});
});

test('Período del proyecto', () => {
    const f = (d) => d;
    assert.equal(S.projectPeriod({ fecha_inicio: 'a', fecha_fin: 'b' }, f), 'a – b');
    assert.equal(S.projectPeriod({}, f), 'Sin período definido');
});

test('Código sugerido EST-00N editable (§18.2)', () => {
    assert.equal(S.suggestNextCode([]), 'EST-001');
    assert.equal(S.suggestNextCode(['EST-001', 'EST-009', 'OTRO-50']), 'EST-010');
    assert.equal(S.suggestNextCode(['est-120']), 'EST-121');
});

test('Nómina: código duplicado en el mismo proyecto se rechaza (PA-NOM-02)', () => {
    const others = [{ codigo: 'EST-001', microchip: null }];
    const v = { codigo: 'est-001', id_especie: 1, sexo: 'Hembra' };
    assert.match(S.validateEntry(v, others).codigo, /ya se utiliza/);
    // Otro proyecto: la validación solo compara con la nómina del proyecto (PA-NOM-03).
    assert.deepEqual(S.validateEntry(v, []), {});
});

test('Nómina: microchip 15 dígitos y único dentro del proyecto (PA-NOM-04/05/06)', () => {
    const v = S.collectEntry(fd({ codigo: 'EST-002', id_especie: '1', sexo: 'Macho', microchip: '000 000 000 000 202' }));
    assert.equal(v.microchip, '000000000000202');
    assert.deepEqual(S.validateEntry(v, []), {});
    assert.match(S.validateEntry(v, [{ codigo: 'EST-001', microchip: '000000000000202' }]).microchip, /ya está registrado/);
    assert.match(S.validateEntry({ ...v, microchip: '12345' }, []).microchip, /15 dígitos/);
});

test('Nómina: código y microchip son conceptos distintos (PA-NOM-07)', () => {
    const v = S.collectEntry(fd({ codigo: '000000000000202', id_especie: '1', sexo: 'Macho', microchip: '' }));
    assert.equal(v.microchip, null);
    assert.equal(v.codigo, '000000000000202');
});

test('Nómina: nacimiento no posterior a la esterilización; sexo y Registro Nacional válidos', () => {
    const base = { codigo: 'A', id_especie: 1, sexo: 'Hembra' };
    assert.ok(S.validateEntry({ ...base, fecha_nacimiento: '2026-09-10', fecha_esterilizacion: '2026-09-01' }).fecha_nacimiento);
    assert.ok(S.validateEntry({ ...base, sexo: 'Otro' }).sexo);
    assert.ok(S.validateEntry({ ...base, estado_registro_nacional: 'Pendiente' }).estado_registro_nacional);
    assert.deepEqual(S.validateEntry({ ...base, estado_registro_nacional: 'No verificado' }), {});
});

test('Profesionales: al menos uno, función obligatoria y sin repetir (PA-PRF-02/03)', () => {
    assert.ok(S.validateProfessionalRows([]).general);
    assert.ok(!S.hasRowErrors(S.validateProfessionalRows([], { required: false })));
    const two = [{ idProfesional: 1, funcion: 'Cirujano(a)' }, { idProfesional: 2, funcion: 'Anestesista' }];
    assert.ok(!S.hasRowErrors(S.validateProfessionalRows(two)));
    const dup = S.validateProfessionalRows([{ idProfesional: 1, funcion: 'A' }, { idProfesional: 1, funcion: 'B' }]);
    assert.match(dup.rows[1], /ya está asociado/);
    assert.match(S.validateProfessionalRows([{ idProfesional: 1, funcion: null }]).rows[0], /función/);
    assert.match(S.validateProfessionalRows([{ idProfesional: 3, funcion: 'A' }], { existingIds: [3] }).rows[0], /ya está asociado/);
});

test('Profesional: nombre y profesión obligatorios; correo válido', () => {
    const v = S.collectProfessional((k) => ({ nombre: ' Veterinario Prueba QA ', profesion: 'Médico veterinario', email: 'QA@Example.com' })[k] ?? '');
    assert.equal(v.email, 'qa@example.com');
    assert.deepEqual(S.validateProfessional(v), {});
    assert.ok(S.validateProfessional({ ...v, email: 'malo' }).email);
    assert.ok(S.validateProfessional({ ...v, profesion: null }).profesion);
});

test('Profesionales del proyecto derivados de la nómina, sin FK directa (PA-PRF-05)', () => {
    const vet = { id_profesional: 1, nombre: 'Veterinario Prueba QA', profesion: 'Médico veterinario' };
    const asis = { id_profesional: 2, nombre: 'Asistente QA', profesion: 'TENS' };
    const entries = [
        { codigo: 'EST-001', profesionales: [{ id_profesional: 1, funcion: 'Cirujano(a)', profesional: vet }, { id_profesional: 2, funcion: 'Asistente', profesional: asis }] },
        { codigo: 'EST-002', profesionales: [{ id_profesional: 1, funcion: 'Anestesista', profesional: vet }] },
        { codigo: 'EST-003', profesionales: [] },
    ];
    const list = S.deriveProjectProfessionals(entries);
    assert.equal(list.length, 2);
    assert.equal(list[0].id_profesional, 1);
    assert.equal(list[0].esterilizaciones, 2);
    assert.deepEqual(list[0].funciones, ['Anestesista', 'Cirujano(a)']);
    assert.deepEqual(list[0].codigos, ['EST-001', 'EST-002']);
});

test('Documento: Adjuntar si no existe, Abrir si existe; sin Reemplazar (PA-PDF-05/06)', () => {
    assert.deepEqual(S.pdfStatus({ archivos: [] }), { exists: false, latest: null, count: 0, action: 'attach' });
    const st = S.pdfStatus({ archivos: [
        { archivo: { id_archivo: 1, fecha_carga: '2026-09-20T10:00:00Z' } },
        { archivo: { id_archivo: 2, fecha_carga: '2026-09-21T10:00:00Z' } },
    ] });
    assert.equal(st.action, 'open');
    assert.equal(st.latest.id_archivo, 2);
    assert.equal(st.count, 2);
});

test('PDF: se exige PDF y se rechaza otro tipo (PA-PDF-01/02, REG-06)', async () => {
    const pdf = new File(['%PDF-1.4 contenido'], 'ficha.pdf', { type: 'application/pdf' });
    assert.equal(S.validatePdfFile(pdf), null);
    assert.equal(await S.hasPdfSignature(pdf), true);
    assert.match(S.validatePdfFile(new File(['x'], 'foto.jpg', { type: 'image/jpeg' })), /PDF/);
    assert.match(S.validatePdfFile(null), /Selecciona/);
    const fake = new File(['no es pdf'], 'falso.pdf', { type: 'application/pdf' });
    assert.equal(S.validatePdfFile(fake), null);
    assert.equal(await S.hasPdfSignature(fake), false);
    const big = new File([new Uint8Array(S.PDF_MAX_BYTES + 1)], 'grande.pdf', { type: 'application/pdf' });
    assert.match(S.validatePdfFile(big), /10 MB/);
});

test('Búsqueda en nómina por código, microchip y profesional', () => {
    const entries = [
        { codigo: 'EST-001', microchip: '000000000000202', profesionales: [{ profesional: { nombre: 'Veterinario Prueba QA' } }] },
        { codigo: 'EST-002', microchip: null, sector_origen: 'Población Las Ñipas', profesionales: [] },
    ];
    assert.equal(S.filterEntries(entries, 'est-002').length, 1);
    assert.equal(S.filterEntries(entries, '202').length, 1);
    assert.equal(S.filterEntries(entries, 'veterinario').length, 1);
    assert.equal(S.filterEntries(entries, 'nipas').length, 1);
    assert.equal(S.filterEntries(entries, '').length, 2);
});

test('CSV: separador ;, BOM, texto seguro y microchip como texto', () => {
    assert.equal(csvCell('a;b'), '"a;b"');
    assert.equal(csvCell('dice "hola"'), '"dice ""hola"""');
    assert.equal(csvCell('x"y;'), '"x""y;"');
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(csvCell('+56 9 1234'), "'+56 9 1234");
    assert.equal(csvCell('000000000000101', { text: true }), '="000000000000101"');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(12500), '12500');
    const csv = toCSV(S.NOMINA_EXPORT_COLUMNS, [{ codigo: 'EST-001', sexo: 'Hembra', microchip: '000000000000202', archivos: [], profesionales: [] }]);
    assert.ok(csv.startsWith('﻿Código;Especie;Sexo'));
    assert.ok(csv.includes('EST-001;;Hembra;;;="000000000000202";'));
    assert.ok(!/id_|externo/i.test(csv));
    assert.equal(csvFileName('Nómina Proyecto QA', '2026-09-23'), 'nomina-proyecto-qa-2026-09-23.csv');
});
