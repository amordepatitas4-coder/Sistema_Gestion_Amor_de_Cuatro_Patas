// ============================================================
// Helpers de interfaz: plantillas seguras, estados de pantalla,
// botones ocupados, toasts y modales (Bootstrap 5).
// ============================================================

// ------------------------------------------------------------
// Plantillas HTML con escape automático.
//
// html`<p>${valor}</p>` escapa cualquier valor interpolado.
// Para insertar HTML ya construido usar raw() o anidar html``.
// ------------------------------------------------------------

class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function renderValue(value) {
    if (value === null || value === undefined || value === false) return '';
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    return escapeHtml(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
    return new SafeHtml(out);
}

/** Marca un texto como HTML confiable (usar solo con contenido propio). */
export const raw = (value) => new SafeHtml(String(value ?? ''));

/**
 * Opciones de <select>. items: [{ value, label }] o strings.
 * placeholder: texto de la opción vacía (null = sin opción vacía).
 */
export function options(items, selected = '', { placeholder = 'Selecciona…' } = {}) {
    const sel = selected === null || selected === undefined ? '' : String(selected);
    const rows = items.map((item) => (typeof item === 'object' ? item : { value: item, label: item }));
    return html`${placeholder !== null ? html`<option value="">${placeholder}</option>` : ''}${rows.map((r) =>
        html`<option value="${r.value}" ${String(r.value) === sel ? raw('selected') : ''}>${r.label}</option>`)}`;
}

/** Reemplaza el contenido de un elemento. */
export function render(element, content) {
    element.innerHTML = renderValue(content);
    return element;
}

// ------------------------------------------------------------
// Encabezado de página: título, subtítulo y acciones principales.
// actions: contenido html`` (botones) alineado a la derecha.
// ------------------------------------------------------------

export function pageHeader({ title, subtitle = '', actions = '' }) {
    return html`
        <header class="page-header">
            <div>
                <h1 class="page-title" tabindex="-1">${title}</h1>
                ${subtitle ? html`<p class="page-subtitle">${subtitle}</p>` : ''}
            </div>
            ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
        </header>`;
}

// ------------------------------------------------------------
// Estados de pantalla: carga, vacío (sin datos / sin resultados)
// y error. Diferenciados visualmente según el Prompt Maestro §24.
// ------------------------------------------------------------

export function loadingState(text = 'Cargando información…') {
    return html`
        <div class="state-block state-loading" role="status" aria-live="polite">
            <span class="spinner-border text-primary" aria-hidden="true"></span>
            <p class="state-text">${text}</p>
        </div>`;
}

/**
 * Estado vacío con icono, título, texto y acción opcional.
 * action: { label, icon, href } o { label, icon, id } para enlazar después.
 */
export function emptyState({ icon = 'bi-inbox', title, text = '', action = null, variant = 'empty' } = {}) {
    return html`
        <div class="state-block state-${variant}">
            <span class="state-icon" aria-hidden="true"><i class="bi ${icon}"></i></span>
            <h2 class="state-title">${title}</h2>
            ${text ? html`<p class="state-text">${text}</p>` : ''}
            ${action ? actionButton(action) : ''}
        </div>`;
}

export function errorState({ title = 'No fue posible cargar la información', text = '', retryId = null } = {}) {
    return html`
        <div class="state-block state-error" role="alert">
            <span class="state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
            <h2 class="state-title">${title}</h2>
            ${text ? html`<p class="state-text">${text}</p>` : ''}
            ${retryId ? html`<button type="button" class="btn btn-outline-primary" id="${retryId}">
                <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Reintentar</button>` : ''}
        </div>`;
}

function actionButton({ label, icon = 'bi-plus-lg', href = null, id = null }) {
    const content = html`<i class="bi ${icon}" aria-hidden="true"></i> ${label}`;
    return href
        ? html`<a class="btn btn-primary" href="${href}">${content}</a>`
        : html`<button type="button" class="btn btn-primary" id="${id}">${content}</button>`;
}

// ------------------------------------------------------------
// Botones en estado ocupado.
//
// Solo se deshabilita el BOTÓN; nunca los inputs (los controles
// disabled no forman parte de FormData).
// ------------------------------------------------------------

export function setButtonBusy(button, label = 'Procesando…') {
    if (!button) return () => {};
    const previous = { html: button.innerHTML, disabled: button.disabled };
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = renderValue(html`<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span>${label}</span>`);
    return () => {
        button.innerHTML = previous.html;
        button.disabled = previous.disabled;
        button.removeAttribute('aria-busy');
    };
}

// ------------------------------------------------------------
// Toasts (mensajes breves no bloqueantes).
// ------------------------------------------------------------

const TOAST_TYPES = {
    success: { icon: 'bi-check-circle-fill', cls: 'toast-success' },
    error: { icon: 'bi-exclamation-octagon-fill', cls: 'toast-error' },
    warning: { icon: 'bi-exclamation-triangle-fill', cls: 'toast-warning' },
    info: { icon: 'bi-info-circle-fill', cls: 'toast-info' },
};

export function toast(message, type = 'info', { delay = 5000 } = {}) {
    const area = document.getElementById('toastArea');
    if (!area) return;
    const cfg = TOAST_TYPES[type] ?? TOAST_TYPES.info;
    const wrapper = document.createElement('div');
    render(wrapper, html`
        <div class="toast app-toast ${cfg.cls}" role="${type === 'error' ? 'alert' : 'status'}"
             aria-live="${type === 'error' ? 'assertive' : 'polite'}" aria-atomic="true">
            <div class="d-flex align-items-start gap-2 p-3">
                <i class="bi ${cfg.icon} toast-icon" aria-hidden="true"></i>
                <div class="flex-grow-1">${message}</div>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
        </div>`);
    const element = wrapper.firstElementChild;
    area.appendChild(element);
    element.addEventListener('hidden.bs.toast', () => element.remove());
    window.bootstrap.Toast.getOrCreateInstance(element, { delay, autohide: type !== 'error' }).show();
}

// ------------------------------------------------------------
// Modal genérico.
//
// No se anidan modales: abrir uno nuevo cierra el anterior.
// Mientras la operación está en curso (setBusy(true)) el modal
// no puede cerrarse con Escape, clic exterior ni botón cerrar.
// ------------------------------------------------------------

let activeModal = null;

export function openModal({ title, body, size = '', onHidden = null }) {
    // Elemento que abrió el modal: recibe el foco al cerrar (accesibilidad de teclado).
    const opener = activeModal?.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (activeModal) activeModal.close(true);

    const host = document.getElementById('modalHost');
    const titleId = `modalTitle${Date.now()}`;
    render(host, html`
        <div class="modal fade" tabindex="-1" aria-labelledby="${titleId}" aria-modal="true" role="dialog">
            <div class="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down ${size}">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title fs-5" id="${titleId}">${title}</h2>
                        <button type="button" class="btn-close" data-modal-close aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body">${body}</div>
                </div>
            </div>
        </div>`);

    const element = host.firstElementChild;
    const instance = new window.bootstrap.Modal(element, { backdrop: true, keyboard: true });
    let busy = false;
    // Bootstrap ignora hide() mientras el modal aún se está mostrando:
    // un cierre pedido en ese intervalo se aplica al terminar de mostrarse.
    let shown = false;
    let pendingClose = false;

    const api = {
        element,
        opener,
        body: element.querySelector('.modal-body'),
        setBusy(value) {
            busy = Boolean(value);
            element.querySelectorAll('[data-modal-close]').forEach((b) => { b.disabled = busy; });
        },
        close(force = false) {
            if (busy && !force) return;
            busy = false;
            if (!shown && !force) { pendingClose = true; return; }
            instance.hide();
        },
    };

    // Impide cerrar por Escape o clic exterior mientras está ocupado.
    element.addEventListener('hide.bs.modal', (event) => { if (busy) event.preventDefault(); });
    element.addEventListener('click', (event) => {
        if (event.target.closest('[data-modal-close]')) api.close();
    });
    // Foco inicial razonable (§25): primer campo editable. Solo con puntero
    // preciso (mouse/teclado) para no abrir el teclado en celulares.
    element.addEventListener('shown.bs.modal', () => {
        shown = true;
        if (pendingClose) { instance.hide(); return; }
        if (!window.matchMedia?.('(pointer: fine)').matches) return;
        element.querySelector('.modal-body input:not([type=hidden]):not([readonly]):not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])')
            ?.focus({ preventScroll: true });
    });
    element.addEventListener('hidden.bs.modal', () => {
        instance.dispose();
        element.remove();
        if (activeModal === api) activeModal = null;
        onHidden?.();
        // Si el modal no fue reemplazado por otro, devolver el foco al disparador
        // o, si ya no existe (la vista se refrescó), al título de la página.
        if (!activeModal) {
            queueMicrotask(() => {
                if (activeModal || (document.activeElement && document.activeElement !== document.body)) return;
                const target = opener?.isConnected ? opener : document.querySelector('main h1[tabindex="-1"]');
                target?.focus({ preventScroll: true });
            });
        }
    });

    activeModal = api;
    instance.show();
    return api;
}

// ------------------------------------------------------------
// Filtros plegables en celular (Etapa 12).
//
// Las columnas marcadas con .filter-extra se ocultan en pantallas
// pequeñas hasta pulsar "Más filtros"; en escritorio siempre se ven.
// Si alguno de esos filtros está aplicado, se muestran desplegados.
// No cambia qué filtros existen ni cómo se aplican.
// ------------------------------------------------------------
export function collapsibleFilters(form) {
    const extras = [...form.querySelectorAll('.filter-extra')];
    if (!extras.length) return;
    const activeCount = () => extras.filter((col) =>
        [...col.querySelectorAll('input, select')].some((el) => String(el.value ?? '').trim() !== '')).length;
    const wrapper = document.createElement('div');
    wrapper.className = 'col-12 filters-toggle-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-outline-primary w-100';
    const id = `${form.id || 'filtros'}-extra`;
    extras.forEach((col, i) => { if (!col.id) col.id = `${id}-${i}`; });
    button.setAttribute('aria-controls', extras.map((c) => c.id).join(' '));
    wrapper.appendChild(button);
    form.insertBefore(wrapper, extras[0]);

    const update = (open) => {
        form.classList.toggle('filters-collapsed', !open);
        button.setAttribute('aria-expanded', String(open));
        const n = activeCount();
        render(button, html`<i class="bi ${open ? 'bi-chevron-up' : 'bi-sliders'}" aria-hidden="true"></i>
            ${open ? 'Ocultar filtros' : 'Más filtros'}${n ? ` (${n} aplicado${n === 1 ? '' : 's'})` : ''}`);
    };
    let open = activeCount() > 0;
    update(open);
    button.addEventListener('click', () => { open = !open; update(open); });
    form.addEventListener('change', () => update(open));
}

// ------------------------------------------------------------
// Tablas apiladas en celular (Etapa 12).
//
// Copia el texto de cada encabezado a data-label en sus celdas; en
// pantallas pequeñas el CSS muestra cada fila como tarjeta con
// "Etiqueta: valor", sin desplazamiento horizontal. No altera datos.
// ------------------------------------------------------------
export function labelTableCells(root) {
    root.querySelectorAll('table').forEach((table) => {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        if (!heads.length) return;
        table.querySelectorAll('tbody tr').forEach((tr) => {
            [...tr.children].forEach((cell, i) => {
                if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[i] ?? '');
            });
        });
    });
}

/** Mantiene etiquetadas las tablas que se rendericen dentro de root. */
export function observeTables(root) {
    let scheduled = false;
    const run = () => { scheduled = false; labelTableCells(root); };
    const observer = new MutationObserver(() => {
        if (!scheduled) { scheduled = true; queueMicrotask(run); }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
}
