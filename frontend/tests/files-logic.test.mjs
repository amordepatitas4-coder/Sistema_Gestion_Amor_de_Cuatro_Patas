// Pruebas de js/views/files/logic.js: archivos y difusión.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/views/files/logic.js';

test('Validación de archivo: vacío, límite 10 MB y categoría', () => {
    assert.ok(D.validateUpload({ archivo: null, idCategoria: 1 }).archivo);
    assert.ok(D.validateUpload({ archivo: new File([''], 'x.pdf'), idCategoria: 1 }).archivo);
    const big = new File([new Uint8Array(D.MAX_FILE_BYTES + 1)], 'grande.pdf');
    assert.match(D.validateUpload({ archivo: big, idCategoria: 1 }).archivo, /10 MB/);
    const ok = new File(['contenido'], 'doc.pdf', { type: 'application/pdf' });
    assert.deepEqual(D.validateUpload({ archivo: ok, idCategoria: 1 }), {});
    assert.ok(D.validateUpload({ archivo: ok, idCategoria: null }).categoria);
});

test('Edad aproximada desde la fecha de nacimiento', () => {
    const today = new Date(2026, 8, 23);
    assert.equal(D.approximateAge('2022-03-15', today), '4 años');
    assert.equal(D.approximateAge('2026-06-10', today), '3 meses');
    assert.equal(D.approximateAge('2025-09-23', today), '1 año');
    assert.equal(D.approximateAge(null, today), null);
});

const animal = {
    id_animal: 6, nombre: 'Luna Prueba QA', sexo: 'Hembra', tamaño: 'Mediano', fecha_nacimiento: '2022-03-15',
    personalidad: 'Juguetona', historia_rescate: 'Rescatada en la vía pública', caracteristicas: 'Pelaje negro',
    microchip: '000000000000101', observaciones: 'Nota interna no publicable', lugar_rescate: 'Calle Privada 123',
    especie: { nombre: 'Canino' }, rango: { nombre: 'Adulto' },
    adoptante: { rut: '12345678-5', telefono: '+56 9 1111 1111' },
};

test('Difusión: solo datos autorizados (PA-DIF-01/04)', () => {
    const d = D.diffusionData(animal, new Date(2026, 8, 23));
    const text = D.buildDiffusionText(d);
    const prompt = D.buildDiffusionPrompt(d);
    for (const out of [text, prompt]) {
        assert.ok(out.includes('Luna Prueba QA'));
        assert.ok(out.includes('Juguetona'));
        assert.ok(!out.includes('000000000000101'), 'no incluye microchip');
        assert.ok(!out.includes('Nota interna'), 'no incluye observaciones internas');
        assert.ok(!out.includes('Calle Privada'), 'no incluye lugar de rescate');
        assert.ok(!out.includes('12345678-5') && !out.includes('1111 1111'), 'no incluye datos de adoptantes');
    }
    assert.ok(text.includes(D.CONTACT_PLACEHOLDER));
});

test('Difusión: prompt para generar un flyer con estructura e identidad fijas (PA-DIF-02)', () => {
    const prompt = D.buildDiffusionPrompt(D.diffusionData(animal));
    assert.ok(prompt.startsWith(D.PROMPT_BASE));
    assert.match(prompt, /imagen gráfica \(flyer\)/);
    assert.match(prompt, /#780205/);
    assert.match(prompt, /#FD054C/);
    assert.match(prompt, /dos fotografías/);
    assert.match(prompt, /Fundación Amor de Cuatro Patas/);
    assert.match(prompt, /no inventes datos/);
    assert.match(prompt, /- Personalidad: Juguetona/);
    // La regla interna de exclusión ya no se muestra; tampoco se pide un contacto inventado.
    assert.ok(!/adoptantes, hogares temporales/.test(prompt));
    assert.ok(!prompt.includes(D.CONTACT_PLACEHOLDER));
});

test('Difusión: el prompt omite los datos vacíos o sin información', () => {
    const vacio = D.diffusionData({ nombre: 'Flaco', sexo: 'Desconocido', estado_esterilizacion: 'Sin información', personalidad: '  ', especie: { nombre: 'Canino' } });
    const prompt = D.buildDiffusionPrompt(vacio);
    assert.match(prompt, /- Nombre: Flaco/);
    assert.ok(!/No registrado|Sin información|Sin indicar|null|undefined/.test(prompt.split('Información del animal:')[1]));
    for (const campo of ['Sexo', 'Esterilización', 'Personalidad', 'Tamaño', 'Edad aproximada', 'Etapa de vida']) {
        assert.ok(!prompt.includes(`- ${campo}:`), `omite ${campo}`);
    }
    // Sin fecha de nacimiento se usa el rango etario como etapa de vida.
    const rango = D.buildDiffusionPrompt(D.diffusionData({ nombre: 'Sol', rango: { nombre: 'Senior' } }));
    assert.match(rango, /- Etapa de vida: Senior/);
    // Datos escritos a mano como "Sin indicar" tampoco llegan al flyer.
    assert.ok(!D.buildDiffusionPrompt({ nombre: 'X', caracteristicas: 'Sin indicar' }).includes('Características'));
});

test('Difusión: esterilización (solo lo que se sabe, concordando con el sexo)', () => {
    const est = D.diffusionData({ ...animal, estado_esterilizacion: 'Esterilizado' });
    assert.ok(D.buildDiffusionText(est).includes('Esterilizada'));
    assert.match(D.buildDiffusionPrompt(est), /- Esterilización: Esterilizado/);
    const macho = D.diffusionData({ ...animal, sexo: 'Macho', estado_esterilizacion: 'Esterilizado' });
    assert.ok(D.buildDiffusionText(macho).includes('Esterilizado'));
    const no = D.diffusionData({ ...animal, estado_esterilizacion: 'No esterilizado' });
    assert.ok(!/sterilizad/.test(D.buildDiffusionText(no)), 'el texto base no destaca que no está esterilizado');
    assert.match(D.buildDiffusionPrompt(no), /- Esterilización: No esterilizado/);
    const sin = D.diffusionData({ ...animal, estado_esterilizacion: 'Sin información' });
    assert.equal(sin.esterilizacion, null);
    assert.ok(!D.buildDiffusionPrompt(sin).includes('Esterilización:'), 'sin información no se incluye');
});

test('Difusión: campos faltantes y sin nombre', () => {
    const d = D.diffusionData({ id_animal: 9, nombre: null, sexo: 'Desconocido' });
    assert.deepEqual(D.missingDiffusionFields(d), ['nombre', 'personalidad', 'historia del rescate', 'características']);
    assert.ok(D.buildDiffusionText(d).startsWith('🐾 Este peludito busca una familia'));
    assert.equal(d.sexo, null);
});
