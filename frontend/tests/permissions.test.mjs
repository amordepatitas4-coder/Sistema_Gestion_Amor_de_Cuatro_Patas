// Regresión S-1: lo que el frontend escribe directamente debe estar
// concedido por supabase/security/2026-09-24_09_restringir_escritura_directa.sql,
// y las tablas de proceso NO deben recibir escritura directa.
// Se leen los archivos como texto (los módulos de api/ dependen del CDN de Supabase).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
// Se descartan los comentarios SQL: solo cuentan las sentencias.
const sql = read('../../supabase/security/2026-09-24_09_restringir_escritura_directa.sql').replace(/--.*$/gm, '');
const api = {
    animals: read('../js/api/animals.js'),
    sterilization: read('../js/api/sterilization.js'),
};

const norm = (c) => c.trim().replace(/"/g, '');

/** Columnas concedidas por GRANT <priv> (cols) ON TABLE public.<tabla>. */
function grantedColumns(priv, table) {
    const re = new RegExp(`GRANT ${priv} \\(([^)]*)\\)\\s*ON TABLE public\\.${table} TO authenticated`, 'g');
    return [...sql.matchAll(re)].flatMap((m) => m[1].split(',').map(norm));
}

/** Tablas con GRANT <privs> ON TABLE <lista> TO authenticated (sin columnas). */
function tablesWith(priv) {
    const re = /GRANT ([A-Z, ]+) ON TABLE([^;]*?)TO authenticated;/g;
    return [...sql.matchAll(re)].filter((m) => m[1].includes(priv))
        .flatMap((m) => m[2].split(',').map((t) => t.trim().replace(/^public\./, '')).filter(Boolean));
}

/** Arreglo exportado `export const NOMBRE = [ ... ]` de un módulo. */
function exportedArray(src, name) {
    const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`).exec(src);
    assert.ok(m, `no se encontró ${name}`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('animal: el frontend solo actualiza columnas concedidas; nunca estado, activo ni carpeta', () => {
    const granted = grantedColumns('UPDATE', 'animal');
    const editable = [...exportedArray(api.animals, 'EDITABLE_COLUMNS'), 'foto_principal_path'];
    editable.forEach((c) => assert.ok(granted.includes(c), `animal.${c} no concedida`));
    ['id_estado_actual', 'activo', 'id_carpeta_drive', 'id_animal'].forEach((c) => assert.ok(!granted.includes(c), `animal.${c} no debe concederse`));
    assert.ok(!tablesWith('INSERT').includes('animal'), 'animal solo se crea con registrar_animal');
});

test('proyecto: INSERT/UPDATE con las columnas del formulario; sin id_carpeta_drive', () => {
    const cols = exportedArray(api.sterilization, 'PROJECT_COLUMNS');
    for (const priv of ['INSERT', 'UPDATE']) {
        const granted = grantedColumns(priv, 'proyecto_esterilizacion');
        cols.forEach((c) => assert.ok(granted.includes(c), `${priv} proyecto.${c} no concedida`));
        assert.ok(!granted.includes('id_carpeta_drive'));
    }
});

test('nómina: alta con id_proyecto; edición sin cambiar de proyecto', () => {
    const cols = exportedArray(api.sterilization, 'ENTRY_COLUMNS');
    const ins = grantedColumns('INSERT', 'animal_esterilizacion');
    const upd = grantedColumns('UPDATE', 'animal_esterilizacion');
    [...cols, 'id_proyecto'].forEach((c) => assert.ok(ins.includes(c), `INSERT nómina.${c}`));
    cols.forEach((c) => assert.ok(upd.includes(c), `UPDATE nómina.${c}`));
    assert.ok(!upd.includes('id_proyecto'));
});

test('relación profesional: se crea con sus 3 datos y luego solo se corrige la función', () => {
    assert.deepEqual(grantedColumns('INSERT', 'esterilizacion_profesional').sort(), ['funcion', 'id_animal_esterilizacion', 'id_profesional']);
    assert.deepEqual(grantedColumns('UPDATE', 'esterilizacion_profesional'), ['funcion']);
});

test('tablas de proceso sin escritura directa; sin DELETE en ninguna tabla', () => {
    const writable = [...tablesWith('INSERT'), ...tablesWith('UPDATE')];
    ['historial_estado', 'permanencia_animal_hogar', 'adopcion', 'seguimiento', 'animal_gasto', 'archivo',
        'animal_archivo', 'adopcion_archivo', 'gasto_archivo', 'proyecto_archivo', 'esterilizacion_archivo',
        'fundacion_archivo', 'usuario']
        .forEach((t) => assert.ok(!writable.includes(t), `${t} no debe tener escritura directa`));
    // Control positivo: el análisis sí detecta las tablas editables.
    ['adoptante', 'gasto', 'hogar_temporal', 'profesional', 'especie'].forEach((t) => assert.ok(writable.includes(t), `${t} debería ser editable`));
    assert.ok(!/GRANT[^;]*DELETE/.test(sql), 'no se concede DELETE');
    assert.ok(!/GRANT[^;]*TRUNCATE/.test(sql), 'no se concede TRUNCATE');
    assert.ok(!/GRANT (INSERT|UPDATE)[^;]*TO anon/.test(sql), 'anon sin escritura');
});

test('estados con significado de proceso: solo descripción editable', () => {
    assert.deepEqual(grantedColumns('UPDATE', 'estado'), []); // concedido en una sola sentencia para ambos
    assert.match(sql, /GRANT UPDATE \(descripcion\) ON TABLE public\.estado, public\.estado_adopcion TO authenticated;/);
    const writable = [...tablesWith('INSERT'), ...tablesWith('UPDATE')];
    assert.ok(!writable.includes('estado') && !writable.includes('estado_adopcion'));
});
