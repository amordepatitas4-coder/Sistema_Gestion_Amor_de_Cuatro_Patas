// Pruebas de js/views/settings/catalog-config.js (PA-CAT-01..05, PA-CON-01/04/05).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/views/settings/catalog-config.js';
import { readFileSync } from 'node:fs';

// Columnas reales de cada tabla leídas de supabase/schema.sql (backend v1.1).
const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
function tableColumns(table) {
    const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
    if (start < 0) throw new Error(`Tabla no encontrada: ${table}`);
    const body = schema.slice(start, schema.indexOf('\n);', start));
    return [...body.matchAll(/^\s+"([a-z_ñ]+)"/gm)].map((x) => x[1]);
}

test('Los 8 catálogos tienen configuración explícita con columnas reales del esquema (PA-CAT-01)', () => {
    assert.equal(C.CATALOG_UI.length, 8);
    C.CATALOG_UI.forEach((cfg) => {
        const cols = tableColumns(cfg.name);
        assert.ok(cols.includes('activo'), `${cfg.name}.activo`);
        cfg.fields.forEach((f) => assert.ok(cols.includes(f.name), `${cfg.name}.${f.name}`));
    });
});

test('ESTADO usa nombre_estado; tipo de atención tiene PK id_tipo_atencion (PA-CAT-02/03)', () => {
    assert.equal(C.labelField(C.findCatalogUI('estado')), 'nombre_estado');
    assert.ok(!tableColumns('estado').includes('nombre'));
    assert.ok(tableColumns('tipo_atencion_sanitaria').includes('id_tipo_atencion'));
});

test('Rango etario contempla edades mínimas y máximas (PA-CAT-04)', () => {
    const cfg = C.findCatalogUI('rango_etario');
    const get = (o) => (k) => o[k] ?? '';
    const v = C.collectCatalogRow(cfg, get({ nombre: 'Rango Prueba QA', edad_min_meses: '12', edad_max_meses: '' }));
    assert.deepEqual(v, { nombre: 'Rango Prueba QA', edad_min_meses: 12, edad_max_meses: null, descripcion: null });
    assert.deepEqual(C.validateCatalogRow(cfg, v), {});
    assert.match(C.validateCatalogRow(cfg, { ...v, edad_max_meses: 12 }).edad_max_meses, /mayor/);
    assert.ok(C.validateCatalogRow(cfg, { ...v, edad_min_meses: null }).edad_min_meses);
    assert.ok(C.validateCatalogRow(cfg, C.collectCatalogRow(cfg, get({ nombre: 'X', edad_min_meses: '-1' }))).edad_min_meses);
});

test('Nombre obligatorio, largo máximo y duplicado sin distinguir mayúsculas', () => {
    const cfg = C.findCatalogUI('especie');
    const existing = [{ id: 1, nombre: 'Canino' }, { id: 2, nombre: 'Felino' }];
    assert.ok(C.validateCatalogRow(cfg, { nombre: null }).nombre);
    assert.ok(C.validateCatalogRow(cfg, { nombre: 'x'.repeat(51) }).nombre);
    assert.match(C.validateCatalogRow(cfg, { nombre: 'canino' }, { existing }).nombre, /Ya existe/);
    assert.deepEqual(C.validateCatalogRow(cfg, { nombre: 'Canino', descripcion: 'x' }, { existing, currentId: 1 }), {});
});

test('Valores con significado de proceso: solo descripción editable y sin desactivar (PA-CAT-05)', () => {
    const estado = C.findCatalogUI('estado');
    assert.equal(estado.allowAdd, false);
    assert.ok(C.isProtected(estado, { nombre_estado: 'Adoptado' }));
    assert.deepEqual(C.writableColumns(estado, { nombre_estado: 'Rescatado' }), ['descripcion']);
    const arch = C.findCatalogUI('categoria_archivo');
    assert.ok(C.isProtected(arch, { nombre: 'Documento de esterilización' }));
    assert.deepEqual(C.writableColumns(arch, { nombre: 'Otro' }), ['nombre', 'descripcion', 'activo']);
    assert.deepEqual(C.writableColumns(C.findCatalogUI('especie'), null), ['nombre', 'descripcion', 'activo']);
});

test('Contraseña: mínimo 8 caracteres y confirmación', () => {
    assert.ok(C.validatePasswordChange({ password: 'corta', confirm: 'corta' }).password);
    assert.ok(C.validatePasswordChange({ password: 'suficiente1', confirm: 'otra' }).confirm);
    assert.deepEqual(C.validatePasswordChange({ password: 'suficiente1', confirm: 'suficiente1' }), {});
});

test('Acciones de usuaria: sin autodesactivación ni dejar el sistema sin activas (PA-CON-04/05)', () => {
    const me = { id_usuario: 'a', activo: true };
    const other = { id_usuario: 'b', activo: true };
    assert.equal(C.userActions(me, { currentId: 'a', activeCount: 2 }).canDeactivate, false);
    assert.equal(C.userActions(other, { currentId: 'a', activeCount: 2 }).canDeactivate, true);
    assert.equal(C.userActions(other, { currentId: 'a', activeCount: 1 }).canDeactivate, false);
    assert.equal(C.userActions({ id_usuario: 'c', activo: false }, { currentId: 'a', activeCount: 2 }).canActivate, true);
});
