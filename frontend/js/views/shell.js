// ============================================================
// Layout autenticado: sidebar (fijo en escritorio, offcanvas en
// pantallas pequeñas), barra superior con la usuaria y área de
// contenido donde el router monta cada vista.
// ============================================================

import { html, render } from '../core/ui.js';
import { brandMark } from './brand.js';

/**
 * Monta el shell en root y devuelve su API.
 * options: { navItems, profile, email, onLogout(button) }
 */
export function mountShell(root, { navItems, profile, email, onLogout }) {
    render(root, html`
        <a class="skip-link" href="#main">Saltar al contenido</a>
        <div class="app-shell">
            <aside class="sidebar offcanvas-lg offcanvas-start" id="sidebar" tabindex="-1" aria-label="Menú principal">
                <div class="sidebar-head">
                    <a class="sidebar-brand" href="#/panel">${brandMark({ variant: 'light' })}</a>
                    <button type="button" class="btn-close btn-close-white d-lg-none" data-bs-dismiss="offcanvas"
                            data-bs-target="#sidebar" aria-label="Cerrar menú"></button>
                </div>
                <nav class="sidebar-nav" aria-label="Navegación principal">
                    <ul class="nav flex-column">
                        ${navItems.map((item) => html`
                            <li class="nav-item">
                                <a class="nav-link" href="#${item.path}" data-nav="${item.path}">
                                    <i class="bi ${item.icon}" aria-hidden="true"></i>
                                    <span>${item.label}</span>
                                </a>
                            </li>`)}
                    </ul>
                </nav>
                <div class="sidebar-foot">Fundación Amor de Cuatro Patas</div>
            </aside>

            <div class="app-main">
                <header class="topbar">
                    <button type="button" class="btn btn-icon d-lg-none" data-bs-toggle="offcanvas"
                            data-bs-target="#sidebar" aria-controls="sidebar" aria-label="Abrir menú">
                        <i class="bi bi-list" aria-hidden="true"></i>
                    </button>
                    <div class="topbar-context" id="topbarContext"></div>
                    <div class="dropdown ms-auto">
                        <button type="button" class="btn user-button dropdown-toggle" data-bs-toggle="dropdown"
                                aria-expanded="false" id="userMenuButton">
                            <span class="user-avatar" aria-hidden="true" data-profile-initials>${initials(profile.nombre)}</span>
                            <span class="user-name" data-profile-name>${profile.nombre}</span>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm" aria-labelledby="userMenuButton">
                            <li class="px-3 py-2">
                                <div class="fw-semibold" data-profile-name>${profile.nombre}</div>
                                <div class="small text-secondary text-break">${email}</div>
                            </li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="#/configuracion">
                                <i class="bi bi-person-gear" aria-hidden="true"></i> Mi cuenta y configuración</a></li>
                            <li><button type="button" class="dropdown-item text-danger" id="logoutButton">
                                <i class="bi bi-box-arrow-right" aria-hidden="true"></i> Cerrar sesión</button></li>
                        </ul>
                    </div>
                </header>
                <main class="app-content" id="main" tabindex="-1"></main>
            </div>
        </div>`);

    const sidebar = root.querySelector('#sidebar');
    const outlet = root.querySelector('#main');
    const context = root.querySelector('#topbarContext');
    const logoutButton = root.querySelector('#logoutButton');

    // En móvil, cerrar el menú al elegir una opción.
    sidebar.addEventListener('click', (event) => {
        if (event.target.closest('[data-nav]')) {
            window.bootstrap.Offcanvas.getInstance(sidebar)?.hide();
        }
    });

    logoutButton.addEventListener('click', () => onLogout(logoutButton));

    // Nombre editado desde Configuración → Mi cuenta.
    const onProfile = (event) => {
        if (!root.contains(logoutButton)) { window.removeEventListener('acp:profile', onProfile); return; }
        root.querySelectorAll('[data-profile-name]').forEach((el) => { el.textContent = event.detail.nombre; });
        root.querySelectorAll('[data-profile-initials]').forEach((el) => { el.textContent = initials(event.detail.nombre); });
    };
    window.addEventListener('acp:profile', onProfile);

    return {
        outlet,
        /** Marca la opción activa del menú según la ruta actual. */
        setActive(path) {
            let label = '';
            root.querySelectorAll('[data-nav]').forEach((link) => {
                const base = link.dataset.nav;
                const active = path === base || path.startsWith(`${base}/`);
                link.classList.toggle('active', active);
                if (active) {
                    link.setAttribute('aria-current', 'page');
                    label = link.textContent.trim();
                } else {
                    link.removeAttribute('aria-current');
                }
            });
            context.textContent = label;
        },
    };
}

function initials(name) {
    return String(name ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || '?';
}
