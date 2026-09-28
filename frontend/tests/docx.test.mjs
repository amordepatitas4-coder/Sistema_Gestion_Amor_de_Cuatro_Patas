// Pruebas de js/core/docx.js y de la lectura del cuestionario de adopción.
// El .docx se arma en memoria con la misma estructura del cuestionario
// real (tabla "Etiqueta: valor") y datos QA ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { docxTables, readDocxXml } from '../js/core/docx.js';
import { parseAdoptionForm } from '../js/views/adoptions/logic.js';

/** ZIP mínimo: cabeceras locales, directorio central y registro final. */
function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, content, store = false } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const raw = Buffer.from(content, 'utf8');
        const data = store ? raw : deflateRawSync(raw);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(store ? 0 : 8, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(store ? 0 : 8, 10);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBuf, data);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + data.length;
    }
    const dir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);
    const buf = Buffer.concat([...locals, dir, end]);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

const cell = (...runs) => `<w:tc><w:tcPr><w:tcW w:w="4000"/></w:tcPr><w:p>${runs.join('')}</w:p></w:tc>`;
const run = (text) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const row = (...cells) => `<w:tr>${cells.join('')}</w:tr>`;

// Estructura del cuestionario: datos del adoptante, preguntas y contactos.
const QUESTIONNAIRE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>CUESTIONARIO DE ADOPCIÓN</w:t></w:r></w:p>
<w:tbl><w:tblPr/>
${row(cell(run('Nombre: '), run('Luna'), run(' Prueba QA')))}
${row(cell('<w:bookmarkStart w:id="0" w:name="_x"/><w:bookmarkEnd w:id="0"/>', run('Rut: 12.345.678-5')))}
${row(cell(run('Dirección: Calle QA 123,'), '<w:r><w:tab/></w:r>', run('Comuna &amp; Ciudad')))}
${row(cell(run('Teléfono: +56 9 0000 0000')), cell(run('Correo: Luna.QA@Ejemplo.cl')))}
${row(cell(run('Edad: 34 años')), cell(run('Ocupación: Independiente')))}
</w:tbl>
<w:tbl>${row(cell(run('1.- ¿Están todos los integrantes de la familia de acuerdo en adoptar?')))}</w:tbl>
<w:tbl>${row(cell(run('Nombre: Contacto QA')), cell(run('Fono: 111')))}</w:tbl>
</w:body></w:document>`;

test('docx: lee word/document.xml comprimido (deflate) y guardado sin comprimir', async () => {
    const other = { name: '[Content_Types].xml', content: '<Types/>' };
    const xml = await readDocxXml(zip([other, { name: 'word/document.xml', content: QUESTIONNAIRE }]));
    assert.ok(xml.includes('CUESTIONARIO DE ADOPCIÓN'));
    const stored = await readDocxXml(zip([{ name: 'word/document.xml', content: QUESTIONNAIRE, store: true }]));
    assert.equal(stored, xml);
});

test('docx: rechaza archivos que no son .docx', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 documento de prueba con relleno suficiente').buffer;
    await assert.rejects(readDocxXml(pdf), /no es un documento Word/);
    await assert.rejects(readDocxXml(zip([{ name: 'otro.xml', content: '<x/>' }])), /no es un documento Word/);
});

test('docx: tablas → filas → celdas, con entidades, tabulaciones y textos partidos en varios fragmentos', () => {
    const tables = docxTables(QUESTIONNAIRE);
    assert.equal(tables.length, 3);
    assert.deepEqual(tables[0][0], ['Nombre: Luna Prueba QA']);
    assert.deepEqual(tables[0][2], ['Dirección: Calle QA 123, Comuna & Ciudad']);
    assert.deepEqual(tables[0][3], ['Teléfono: +56 9 0000 0000', 'Correo: Luna.QA@Ejemplo.cl']);
    assert.deepEqual(tables[2][0], ['Nombre: Contacto QA', 'Fono: 111']);
});

test('Cuestionario: extrae los datos del adoptante y no los de la tabla de contactos', async () => {
    const xml = await readDocxXml(zip([{ name: 'word/document.xml', content: QUESTIONNAIRE }]));
    const r = parseAdoptionForm(docxTables(xml));
    assert.deepEqual(r.data, {
        nombre: 'Luna Prueba QA',
        rut: '12345678-5', // normalizado
        direccion: 'Calle QA 123, Comuna & Ciudad',
        telefono: '+56 9 0000 0000',
        email: 'luna.qa@ejemplo.cl',
        edad: 34, // "34 años" → 34
        ocupacion: 'Independiente',
    });
    assert.deepEqual(r.missing, []);
});

test('Cuestionario en blanco: tabla reconocida sin datos', () => {
    const blank = [[['Nombre:'], ['Rut: '], ['Dirección:'], ['Teléfono:', 'Correo:'], ['Edad:', 'Ocupación:']]];
    const r = parseAdoptionForm(blank);
    assert.deepEqual(r.found, []);
    assert.equal(r.missing.length, 7);
});

test('Cuestionario: etiqueta y valor en celdas contiguas, mayúsculas y sin tildes', () => {
    const r = parseAdoptionForm([[['NOMBRE', 'Sol Prueba QA'], ['RUT', '11.111.111-1'], ['Telefono', '222'], ['E-mail', 'sol@qa.cl']]]);
    assert.equal(r.data.nombre, 'Sol Prueba QA');
    assert.equal(r.data.rut, '11111111-1');
    assert.equal(r.data.telefono, '222');
    assert.equal(r.data.email, 'sol@qa.cl');
    assert.deepEqual(r.missing, ['direccion', 'edad', 'ocupacion']);
});

test('Cuestionario: RUT inválido se conserva tal cual para que la validación lo marque', () => {
    const r = parseAdoptionForm([[['Nombre: QA'], ['Rut: 12.345.678-9']]]);
    assert.equal(r.data.rut, '12.345.678-9');
});

test('Documento sin la tabla del adoptante → null', () => {
    assert.equal(parseAdoptionForm([]), null);
    assert.equal(parseAdoptionForm([[['1.- ¿Por qué desea adoptar?']], [['Nombre: Contacto']]]), null);
});
