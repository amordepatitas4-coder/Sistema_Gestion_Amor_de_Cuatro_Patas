// ============================================================
// Mapa de navegación y rutas de la aplicación.
//
// Punto de extensión: cada etapa reemplaza el loader de su módulo
// (hoy apunta a la vista provisional) y agrega sus subrutas,
// por ejemplo '/animales/:id/:tab?' para la ficha.
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

export const ROUTES = [
    { path: LOGIN_PATH, public: true, load: () => import('./views/login.js') },
    { path: '/panel', load: () => import('./views/panel.js'), module: NAV_ITEMS[0] },
    ...NAV_ITEMS.slice(1).map((item) => ({ path: item.path, load: placeholder, module: item })),
];
