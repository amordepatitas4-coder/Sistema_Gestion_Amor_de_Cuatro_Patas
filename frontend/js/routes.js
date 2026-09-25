// ============================================================
// Mapa de navegación y rutas de la aplicación.
//
// Cada módulo del menú tiene su loader en IMPLEMENTED; un módulo sin
// loader usaría la vista provisional (placeholder.js). Las subrutas
// con parámetros, como '/animales/:id/:tab?', se declaran en ROUTES.
//
// Contrato de una vista (módulo ES):
//   export default {
//     title: 'Texto de la pestaña',
//     async render(ctx) { ... return cleanupOpcional; }
//   }
// ctx = { outlet, params, query, route, session, navigate, setHeader }
// ============================================================

const placeholder = () => import('./views/placeholder.js');

/** Módulos del menú principal, en el orden definido por el Prompt Maestro §5.2. */
export const NAV_ITEMS = [
    { path: '/panel', label: 'Panel principal', icon: 'bi-grid-1x2', stage: 2 },
    { path: '/animales', label: 'Animales', icon: 'bi-heart', stage: 3 },
    { path: '/hogares', label: 'Hogares temporales', icon: 'bi-house-heart', stage: 4 },
    { path: '/adopciones', label: 'Adopciones', icon: 'bi-house-check', stage: 5 },
    { path: '/gastos', label: 'Gastos', icon: 'bi-cash-coin', stage: 6 },
    { path: '/esterilizacion', label: 'Proyectos de esterilización', icon: 'bi-clipboard2-pulse', stage: 8 },
    { path: '/documentos', label: 'Documentos', icon: 'bi-folder2-open', stage: 9 },
    { path: '/informes', label: 'Informes', icon: 'bi-bar-chart-line', stage: 10 },
    { path: '/configuracion', label: 'Configuración', icon: 'bi-gear', stage: 11 },
];

export const HOME_PATH = '/panel';
export const LOGIN_PATH = '/login';

// Carga diferida: cada módulo se descarga solo cuando la usuaria entra a él.
const IMPLEMENTED = {
    '/panel': () => import('./views/panel.js'),
    '/animales': () => import('./views/animals/list.js'),
    '/hogares': () => import('./views/homes/list.js'),
    '/adopciones': () => import('./views/adoptions/list.js'),
    '/gastos': () => import('./views/expenses/list.js'),
    '/esterilizacion': () => import('./views/sterilization/list.js'),
    '/documentos': () => import('./views/documents/list.js'),
    '/informes': () => import('./views/reports/list.js'),
    '/configuracion': () => import('./views/settings/index.js'),
};

const nav = (path) => NAV_ITEMS.find((item) => item.path === path);

export const ROUTES = [
    { path: LOGIN_PATH, public: true, load: () => import('./views/login.js') },
    // Subrutas: el orden importa (las rutas fijas antes que las con parámetros).
    { path: '/animales/:id/:tab?', load: () => import('./views/animals/detail.js'), module: nav('/animales') },
    { path: '/adopciones/adoptantes', load: () => import('./views/adoptions/list.js'), module: nav('/adopciones') },
    { path: '/adopciones/:id', load: () => import('./views/adoptions/detail.js'), module: nav('/adopciones') },
    { path: '/gastos/:id', load: () => import('./views/expenses/detail.js'), module: nav('/gastos') },
    { path: '/configuracion/:section', load: () => import('./views/settings/index.js'), module: nav('/configuracion') },
    { path: '/esterilizacion/:id/:tab?', load: () => import('./views/sterilization/detail.js'), module: nav('/esterilizacion') },
    ...NAV_ITEMS.map((item) => ({ path: item.path, load: IMPLEMENTED[item.path] ?? placeholder, module: item })),
];
