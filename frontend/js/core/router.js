// ============================================================
// Router basado en hash: #/ruta/:param?filtro=valor
//
// - Permite navegación profunda y botón Atrás del navegador.
// - Los filtros viajan en la query (?estado=…), por lo que un
//   filtro aplicado desde el Dashboard queda visible y enlazable.
// - Ignora los fragmentos que Supabase Auth usa para devolver
//   tokens o errores (#access_token=…, #error=…).
// ============================================================

const AUTH_FRAGMENT = /(^|&)(access_token|refresh_token|error|error_code|error_description|type)=/;

/** ¿El hash corresponde a una respuesta de Supabase Auth y no a una ruta? */
export function isAuthCallback(hash) {
    const value = String(hash ?? '').replace(/^#\/?/, '');
    return AUTH_FRAGMENT.test(value);
}

/** Lee los parámetros de una respuesta de Auth (#error_description=…). */
export function parseAuthCallback(hash) {
    return new URLSearchParams(String(hash ?? '').replace(/^#\/?/, ''));
}

/** "#/animales/12?estado=3" → { path: "/animales/12", query: URLSearchParams } */
export function parseHash(hash) {
    let value = String(hash ?? '').replace(/^#/, '');
    if (!value.startsWith('/')) value = `/${value}`;
    const [rawPath, rawQuery = ''] = value.split('?');
    const path = `/${rawPath.split('/').filter(Boolean).map(safeDecode).join('/')}`;
    return { path, query: new URLSearchParams(rawQuery) };
}

function safeDecode(segment) {
    try { return decodeURIComponent(segment); } catch { return segment; }
}

/** Compila "/animales/:id/:tab?" a un matcher. El sufijo "?" marca opcional. */
export function compilePattern(pattern) {
    const names = [];
    const parts = pattern.split('/').filter(Boolean).map((segment) => {
        const optional = segment.endsWith('?');
        const clean = optional ? segment.slice(0, -1) : segment;
        if (clean.startsWith(':')) {
            names.push(clean.slice(1));
            return optional ? '(?:/([^/]+))?' : '/([^/]+)';
        }
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return optional ? `(?:/${escaped})?` : `/${escaped}`;
    });
    const regex = new RegExp(`^${parts.join('') || '/'}/?$`);
    return { regex, names };
}

/** Busca la primera ruta que coincide. Devuelve { route, params } o null. */
export function matchRoute(routes, path) {
    for (const route of routes) {
        route._compiled ??= compilePattern(route.path);
        const match = route._compiled.regex.exec(path);
        if (match) {
            const params = {};
            route._compiled.names.forEach((name, i) => {
                if (match[i + 1] !== undefined) params[name] = safeDecode(match[i + 1]);
            });
            return { route, params };
        }
    }
    return null;
}

/** Construye un hash a partir de ruta y filtros: buildHash('/animales', { estado: 3 }). */
export function buildHash(path, query = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const qs = params.toString();
    return `#${path}${qs ? `?${qs}` : ''}`;
}

/**
 * Crea el router del navegador.
 * onResolve({ route, params, query, path }) se llama en cada cambio de ruta;
 * route es null si ninguna coincide.
 */
export function createRouter({ routes, onResolve }) {
    function resolve() {
        if (isAuthCallback(window.location.hash)) return;
        const { path, query } = parseHash(window.location.hash);
        const found = matchRoute(routes, path);
        onResolve({ route: found?.route ?? null, params: found?.params ?? {}, query, path });
    }

    return {
        start() {
            window.addEventListener('hashchange', resolve);
            resolve();
        },
        resolve,
        /** Navega a una ruta. replace=true no agrega entrada al historial. */
        navigate(path, query = {}, { replace = false } = {}) {
            const hash = buildHash(path, query);
            if (replace) {
                history.replaceState(null, '', hash);
                resolve();
            } else if (window.location.hash === hash) {
                resolve();
            } else {
                window.location.hash = hash;
            }
        },
        current() {
            return parseHash(window.location.hash);
        },
    };
}
