// ============================================================
// Configuración EXPLÍCITA de cada catálogo (PA-CAT-01..05). No se asume que todos tengan "nombre +
// descripcion": cada uno declara sus columnas reales, largos y
// reglas. Lógica pura (sin DOM ni Supabase).
//
// Protección de valores con significado de proceso:
//   - ESTADO: las RPC usan los nombres Rescatado, En hogar temporal
//     y Adoptado, y la interfaz usa el catálogo completo como flujo.
//     No se agregan estados ni se cambian nombres/actividad.
//   - ESTADO_ADOPCION: registrar_adopcion / registrar_devolucion usan
//     Activa y Devuelto; Finalizada se muestra como cierre.
//   - CATEGORIA_ARCHIVO: "Documento de esterilización" identifica las
//     fichas PDF de la nómina.
// En esos casos solo se permite editar la descripción.
// ============================================================

import { emptyToNull } from '../../core/format.js';
import { ESTADOS } from '../../core/domain.js';

const text = (name, label, max, required = false) => ({ name, label, type: 'text', max, required });
const descripcion = { name: 'descripcion', label: 'Descripción', type: 'textarea' };

export const CATALOG_UI = [
    {
        name: 'especie', label: 'Especies', icon: 'bi-heart',
        fields: [text('nombre', 'Nombre', 50, true), descripcion],
    },
    {
        name: 'rango_etario', label: 'Rangos etarios', icon: 'bi-hourglass-split',
        fields: [
            text('nombre', 'Nombre', 50, true),
            { name: 'edad_min_meses', label: 'Edad mínima (meses)', type: 'int', required: true },
            { name: 'edad_max_meses', label: 'Edad máxima (meses)', type: 'int', help: 'Vacío = sin límite superior.' },
            descripcion,
        ],
    },
    {
        name: 'tipo_atencion_sanitaria', label: 'Tipos de atención sanitaria', icon: 'bi-clipboard2-pulse',
        fields: [text('nombre', 'Nombre', 100, true), descripcion],
    },
    {
        name: 'categoria_gasto', label: 'Categorías de gasto', icon: 'bi-cash-coin',
        fields: [text('nombre', 'Nombre', 100, true), descripcion],
    },
    {
        name: 'categoria_archivo', label: 'Categorías de archivo', icon: 'bi-folder2',
        fields: [text('nombre', 'Nombre', 100, true), descripcion],
        protectedNames: ['Documento de esterilización'],
    },
    {
        name: 'estado_proyecto', label: 'Estados de proyecto', icon: 'bi-clipboard2-check',
        fields: [text('nombre', 'Nombre', 50, true), descripcion],
    },
    {
        name: 'estado', label: 'Estados del animal', icon: 'bi-signpost-split',
        fields: [text('nombre_estado', 'Nombre', 50, true), descripcion],
        allowAdd: false,
        protectedNames: Object.values(ESTADOS),
        note: 'Los estados del animal tienen significado de proceso en el sistema: solo puede editarse su descripción.',
    },
    {
        name: 'estado_adopcion', label: 'Estados de adopción', icon: 'bi-house-check',
        fields: [text('nombre', 'Nombre', 50, true), descripcion],
        allowAdd: false,
        protectedNames: ['Activa', 'Finalizada', 'Devuelto'],
        note: 'Los estados de adopción son utilizados por los procesos de adopción y devolución: solo puede editarse su descripción.',
    },
];

export const findCatalogUI = (name) => CATALOG_UI.find((c) => c.name === name) ?? null;

/** Campo visible (nombre) del catálogo. */
export const labelField = (cfg) => cfg.fields[0].name;

/** ¿La fila tiene nombre/actividad protegidos? */
export function isProtected(cfg, row) {
    return Boolean(row) && (cfg.protectedNames ?? []).includes(row[labelField(cfg)]);
}

/** Columnas que pueden escribirse para esa fila (o para una fila nueva). */
// Coincide con los permisos del backend: en estado y estado_adopcion solo "descripcion" tiene GRANT UPDATE.
export function writableColumns(cfg, row = null) {
    if (isProtected(cfg, row)) return ['descripcion'];
    return [...cfg.fields.map((f) => f.name), 'activo'];
}

function parseIntField(value) {
    const t = String(value ?? '').trim();
    if (t === '') return null;
    // NaN marca un valor no numérico, para distinguirlo de un campo vacío (null).
    return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export function collectCatalogRow(cfg, get) {
    const out = {};
    cfg.fields.forEach((f) => {
        out[f.name] = f.type === 'int' ? parseIntField(get(f.name)) : emptyToNull(get(f.name));
    });
    return out;
}

/** Validación alineada con NOT NULL, largos y CHECK (chk_rango_edad_min, chk_rango_edades). */
export function validateCatalogRow(cfg, v, { existing = [], currentId = null } = {}) {
    const e = {};
    cfg.fields.forEach((f) => {
        const value = v[f.name];
        if (f.type === 'int') {
            if (Number.isNaN(value)) e[f.name] = 'Ingresa un número entero sin decimales.';
            else if (f.required && value === null) e[f.name] = 'Campo obligatorio.';
            return;
        }
        if (f.required && !value) e[f.name] = 'Campo obligatorio.';
        else if (f.max && value && value.length > f.max) e[f.name] = `Máximo ${f.max} caracteres.`;
    });
    const nameKey = labelField(cfg);
    const fold = (t) => String(t ?? '').trim().toLowerCase();
    if (!e[nameKey] && v[nameKey] && existing.some((r) => String(r.id) !== String(currentId) && fold(r[nameKey]) === fold(v[nameKey]))) {
        e[nameKey] = 'Ya existe un registro con ese nombre.';
    }
    if (cfg.name === 'rango_etario' && !e.edad_min_meses && !e.edad_max_meses
        && v.edad_max_meses !== null && v.edad_min_meses !== null && v.edad_max_meses <= v.edad_min_meses) {
        e.edad_max_meses = 'La edad máxima debe ser mayor que la edad mínima.';
    }
    return e;
}

// ------------------------------------------------------------
// Usuarias y cuenta
// ------------------------------------------------------------

// Mínimo propio de la interfaz; el tope de 72 corresponde al límite de bcrypt que usa Supabase Auth.
export const PASSWORD_MIN = 8;

export function validatePasswordChange({ password, confirm }) {
    const e = {};
    if (!password) e.password = 'Ingresa la nueva contraseña.';
    else if (password.length < PASSWORD_MIN) e.password = `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    else if (password.length > 72) e.password = 'La contraseña no puede superar 72 caracteres.';
    if (!e.password && password !== confirm) e.confirm = 'Las contraseñas no coinciden.';
    return e;
}

/** Reglas de interfaz para las acciones sobre una usuaria (el backend las vuelve a validar). */
// Estas reglas solo guían la interfaz; desactivar_usuario las aplica de nuevo en el servidor (RN-59).
export function userActions(user, { currentId, activeCount }) {
    const self = String(user.id_usuario) === String(currentId);
    if (!user.activo) return { canActivate: true, canDeactivate: false, reason: null };
    if (self) return { canActivate: false, canDeactivate: false, reason: 'No puedes desactivar tu propia cuenta.' };
    if (activeCount <= 1) return { canActivate: false, canDeactivate: false, reason: 'Debe quedar al menos una usuaria activa.' };
    return { canActivate: false, canDeactivate: true, reason: null };
}
