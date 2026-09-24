// ============================================================
// Configuración (Prompt Maestro §23): #/configuracion/:seccion
//   cuenta     → Mi cuenta (nombre, correo de Auth, contraseña, salir)
//   usuarios   → Usuarias: invitar, activar, desactivar (RPC / EF)
//   catalogos  → Catálogos con metadatos explícitos (sin DELETE)
// La sección seleccionada queda marcada (§40, PA-NAV).
// No se incluye "Sistema": no hay opciones técnicas necesarias.
// ============================================================

import { createCatalogRow, loadCatalog, updateCatalogRow } from '../../api/catalogs.js';
import { activateUser, changeOwnPassword, deactivateUser, inviteUser, listUsers, updateOwnName } from '../../api/users.js';
import { activeBadge } from '../../core/badges.js';
import { AppError, reportError } from '../../core/errors.js';
import { bindForm } from '../../core/forms.js';
import { displayText, emptyToNull, formatDateTime, isValidEmail } from '../../core/format.js';
import { emptyState, errorState, html, loadingState, openModal, pageHeader, render, setButtonBusy, toast } from '../../core/ui.js';
import {
    CATALOG_UI, collectCatalogRow, findCatalogUI, isProtected, labelField, userActions,
    validateCatalogRow, validatePasswordChange, writableColumns,
} from './catalog-config.js';

const SECTIONS = [
    { slug: 'cuenta', label: 'Mi cuenta', icon: 'bi-person-circle', render: renderAccount },
    { slug: 'usuarios', label: 'Usuarias', icon: 'bi-people', render: renderUsers },
    { slug: 'catalogos', label: 'Catálogos', icon: 'bi-list-ul', render: renderCatalogs },
];

const req = html`<span class="text-danger" aria-hidden="true">*</span>`;

export default {
    title: 'Configuración',

    async render(ctx) {
        const { outlet, params, navigate } = ctx;
        const section = SECTIONS.find((s) => s.slug === (params.section ?? 'cuenta'));
        if (!section) {
            navigate('/configuracion', {}, { replace: true });
            return;
        }
        render(outlet, html`
            ${pageHeader({ title: 'Configuración', subtitle: 'Cuenta, usuarias autorizadas y catálogos del sistema' })}
            <nav class="section-tabs mb-3" aria-label="Secciones de configuración">
                <ul class="nav nav-underline">
                    ${SECTIONS.map((s) => html`<li class="nav-item"><a class="nav-link ${s === section ? 'active' : ''}" href="#/configuracion/${s.slug}"
                        ${s === section ? html`aria-current="page"` : ''}><i class="bi ${s.icon}" aria-hidden="true"></i> ${s.label}</a></li>`)}
                </ul>
            </nav>
            <div id="settingsBody">${loadingState()}</div>`);
        const body = outlet.querySelector('#settingsBody');
        const reload = () => navigate(`/configuracion/${section.slug}`, ctx.query ? Object.fromEntries(ctx.query) : {}, { replace: true });
        try {
            await section.render(body, { ...ctx, reload });
        } catch (err) {
            render(body, errorState({ text: await reportError(err, `Configuración ${section.label}`), retryId: 'retrySettings' }));
            body.querySelector('#retrySettings')?.addEventListener('click', reload);
        }
    },
};

// ------------------------------------------------------------
// Mi cuenta
// ------------------------------------------------------------
async function renderAccount(body, { session, query, navigate }) {
    const { profile, user } = session.state;
    const fromInvite = query?.get('bienvenida') === '1';
    const fromRecovery = query?.get('recuperacion') === '1';
    render(body, html`
        ${fromInvite ? html`<div class="alert alert-info d-flex gap-2" role="status"><i class="bi bi-envelope-open-heart" aria-hidden="true"></i>
            <div>Bienvenida al sistema. Define ahora tu contraseña para ingresar las próximas veces con tu correo.</div></div>` : ''}
        ${fromRecovery ? html`<div class="alert alert-warning d-flex gap-2" role="status"><i class="bi bi-key" aria-hidden="true"></i>
            <div><strong>Recuperación de contraseña.</strong> Ingresaste con el enlace enviado a tu correo. Define ahora tu nueva contraseña;
                la anterior dejará de funcionar.</div></div>` : ''}
        <div class="row g-3">
            <section class="col-lg-5">
                <div class="card-panel h-100">
                    <h2 class="block-title"><i class="bi bi-person-circle" aria-hidden="true"></i> Datos de la cuenta</h2>
                    <dl class="info-grid mb-3">
                        <div class="info-block"><dt>Nombre</dt><dd data-own-name>${displayText(profile?.nombre)}</dd></div>
                        <div class="info-block"><dt>Correo (Supabase Auth)</dt><dd>${displayText(user?.email)}</dd></div>
                        <div class="info-block"><dt>Estado</dt><dd>${activeBadge(profile?.activo)}</dd></div>
                        <div class="info-block"><dt>Registrada el</dt><dd>${formatDateTime(profile?.fecha_registro)}</dd></div>
                    </dl>
                    <p class="small text-secondary">El correo proviene de la autenticación, no se duplica en el perfil interno y no se modifica
                        desde el sistema: si necesitas otro correo, se invita una cuenta nueva y luego se desactiva la anterior.</p>
                    <form id="nameForm" class="mb-3" novalidate>
                        <div data-form-error hidden></div>
                        <label class="form-label" for="ownName">Nombre ${req}</label>
                        <div class="d-flex gap-2">
                            <input class="form-control" id="ownName" name="nombre" maxlength="150" required autocomplete="name" value="${profile?.nombre ?? ''}">
                            <button type="submit" class="btn btn-outline-primary text-nowrap"><i class="bi bi-check-lg" aria-hidden="true"></i> Guardar nombre</button>
                        </div>
                    </form>
                    <button type="button" class="btn btn-outline-danger" id="btnLogoutAccount"><i class="bi bi-box-arrow-right" aria-hidden="true"></i> Cerrar sesión</button>
                </div>
            </section>
            <section class="col-lg-7">
                <div class="card-panel h-100">
                    <h2 class="block-title"><i class="bi bi-key" aria-hidden="true"></i> Cambiar contraseña</h2>
                    <form id="passwordForm" novalidate autocomplete="off">
                        <div data-form-error hidden></div>
                        <input type="text" name="username" value="${user?.email ?? ''}" autocomplete="username" hidden>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label" for="pwNew">Nueva contraseña ${req}</label>
                                <input class="form-control" type="password" id="pwNew" name="password" autocomplete="new-password" required aria-describedby="pwHelp">
                                <div class="form-text" id="pwHelp">Mínimo 8 caracteres.</div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="pwConfirm">Repetir contraseña ${req}</label>
                                <input class="form-control" type="password" id="pwConfirm" name="confirm" autocomplete="new-password" required>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> Guardar contraseña</button>
                        </div>
                    </form>
                </div>
            </section>
        </div>`);

    body.querySelector('#btnLogoutAccount').addEventListener('click', async (e) => {
        const restore = setButtonBusy(e.currentTarget, 'Cerrando sesión…');
        try {
            await session.signOut();
        } catch (err) {
            restore();
            toast(await reportError(err, 'Cierre de sesión'), 'error');
        }
    });

    const nameForm = body.querySelector('#nameForm');
    bindForm(nameForm, {
        context: 'Actualizar nombre',
        collect: (fd) => ({ nombre: String(fd.get('nombre') ?? '').replace(/\s+/g, ' ').trim() }),
        validate: ({ nombre }) => {
            if (nombre.length < 2) return { nombre: 'El nombre debe tener al menos 2 caracteres.' };
            if (nombre.length > 150) return { nombre: 'Máximo 150 caracteres.' };
            return null;
        },
        submit: ({ nombre }) => updateOwnName(nombre),
        onSuccess: (_, { nombre }) => {
            session.setProfileName(nombre);
            body.querySelectorAll('[data-own-name]').forEach((el) => { el.textContent = nombre; });
            nameForm.nombre.value = nombre;
            toast('Nombre actualizado.', 'success');
        },
    });

    const form = body.querySelector('#passwordForm');
    // Tras el render, app.js lleva el foco al título; en recuperación se prefiere el campo de contraseña.
    if (fromRecovery) setTimeout(() => form.querySelector('#pwNew')?.focus(), 0);
    bindForm(form, {
        context: 'Cambio de contraseña',
        collect: (fd) => ({ password: String(fd.get('password') ?? ''), confirm: String(fd.get('confirm') ?? '') }),
        validate: validatePasswordChange,
        submit: async ({ password }) => {
            try {
                await changeOwnPassword(password);
            } catch (err) {
                if (err?.code === 'same_password') throw new AppError('La nueva contraseña debe ser distinta de la actual.', { cause: err });
                if (err?.code === 'weak_password') throw new AppError('La contraseña es demasiado débil. Usa una más larga o combina letras y números.', { cause: err });
                if (err?.code === 'reauthentication_needed') throw new AppError('Por seguridad, cierra sesión, vuelve a ingresar e intenta nuevamente.', { cause: err });
                throw err;
            }
        },
        onSuccess: () => {
            form.reset();
            toast('Contraseña actualizada. Úsala la próxima vez que ingreses.', 'success');
            if (fromRecovery) navigate('/configuracion/cuenta', {}, { replace: true });
        },
    });
}

// ------------------------------------------------------------
// Usuarias
// ------------------------------------------------------------
async function renderUsers(body, { session, reload }) {
    const users = await listUsers();
    const currentId = session.state.user?.id;
    const activeCount = users.filter((u) => u.activo).length;

    render(body, html`
        <section class="card-panel">
            <div class="tab-toolbar">
                <div>
                    <h2 class="tab-title">Usuarias autorizadas</h2>
                    <p class="small text-secondary mb-0">Las cuentas se crean solo por invitación. Siempre debe quedar al menos una usuaria activa.</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btnInvite"><i class="bi bi-envelope-plus" aria-hidden="true"></i> Invitar usuaria</button>
            </div>
            ${users.length === 0
                ? emptyState({ icon: 'bi-people', title: 'No hay usuarias registradas' })
                : html`<div class="table-responsive"><table class="table align-middle mb-0">
                    <thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Estado</th>
                        <th scope="col">Registrada</th><th scope="col"><span class="visually-hidden">Acciones</span></th></tr></thead>
                    <tbody>${users.map((u) => {
                        const self = String(u.id_usuario) === String(currentId);
                        const a = userActions(u, { currentId, activeCount });
                        return html`<tr>
                            <td class="fw-semibold">${u.nombre} ${self ? html`<span class="badge badge-soft-info ms-1">Tú</span>` : ''}</td>
                            <td class="small text-break">${displayText(u.email)}</td>
                            <td>${activeBadge(u.activo)}</td>
                            <td class="small text-nowrap">${formatDateTime(u.fecha_registro)}</td>
                            <td class="text-end text-nowrap">
                                ${a.canActivate ? html`<button type="button" class="btn btn-sm btn-outline-success" data-activate="${u.id_usuario}">
                                    <i class="bi bi-person-check" aria-hidden="true"></i> Activar</button>` : ''}
                                ${u.activo ? html`<button type="button" class="btn btn-sm btn-outline-danger" data-deactivate="${u.id_usuario}"
                                    ${a.canDeactivate ? '' : 'disabled'} ${a.reason ? html`title="${a.reason}"` : ''}>
                                    <i class="bi bi-person-dash" aria-hidden="true"></i> Desactivar</button>
                                    ${a.reason ? html`<div class="small text-secondary">${a.reason}</div>` : ''}` : ''}
                            </td>
                        </tr>`;
                    })}</tbody></table></div>
                  <p class="small text-secondary mt-2 mb-0">El correo proviene de Supabase Auth y es de solo lectura. Para usar otro correo se invita una cuenta nueva y se desactiva la anterior.</p>`}
        </section>`);

    body.querySelector('#btnInvite').addEventListener('click', () => openInviteForm({ onSent: reload }));
    body.querySelectorAll('[data-activate]').forEach((btn) => btn.addEventListener('click', async () => {
        const restore = setButtonBusy(btn, 'Activando…');
        try {
            await activateUser(btn.dataset.activate);
            toast('Usuaria activada.', 'success');
            await reload();
        } catch (err) {
            restore();
            toast(await reportError(err, 'Activar usuaria'), 'error');
        }
    }));
    body.querySelectorAll('[data-deactivate]').forEach((btn) => btn.addEventListener('click', () => {
        const user = users.find((u) => u.id_usuario === btn.dataset.deactivate);
        openDeactivateConfirm({ user, onDone: reload });
    }));
}

function openDeactivateConfirm({ user, onDone }) {
    const modal = openModal({
        title: 'Desactivar usuaria',
        body: html`
            <p>¿Desactivar a <strong>${user.nombre}</strong>? No podrá ingresar al sistema hasta que otra usuaria la vuelva a activar.
                Su información y el historial se conservan.</p>
            <form id="deactivateForm" novalidate>
                <div data-form-error hidden></div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-danger"><i class="bi bi-person-dash" aria-hidden="true"></i> Desactivar</button>
                </div>
            </form>`,
    });
    bindForm(modal.body.querySelector('#deactivateForm'), {
        context: 'Desactivar usuaria',
        busyLabel: 'Desactivando…',
        collect: () => ({}),
        submit: async () => {
            modal.setBusy(true);
            try { await deactivateUser(user.id_usuario); } finally { modal.setBusy(false); }
        },
        onSuccess: async () => {
            modal.close();
            toast('Usuaria desactivada.', 'success');
            await onDone?.();
        },
    });
}

function openInviteForm({ onSent }) {
    const modal = openModal({
        title: 'Invitar usuaria',
        body: html`
            <p class="small text-secondary">Se enviará un correo de invitación. La persona invitada define su propia contraseña
                al aceptar (Configuración → Mi cuenta). Tendrá el mismo nivel de acceso que las demás usuarias.</p>
            <form id="inviteForm" novalidate>
                <div data-form-error hidden></div>
                <div class="mb-3">
                    <label class="form-label" for="invNombre">Nombre ${req}</label>
                    <input class="form-control" id="invNombre" name="nombre" maxlength="150" required autocomplete="off">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="invEmail">Correo electrónico ${req}</label>
                    <input class="form-control" type="email" id="invEmail" name="email" maxlength="254" required autocomplete="off">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-envelope-plus" aria-hidden="true"></i> Enviar invitación</button>
                </div>
            </form>`,
    });
    bindForm(modal.body.querySelector('#inviteForm'), {
        context: 'Invitar usuaria',
        busyLabel: 'Enviando…',
        collect: (fd) => ({
            nombre: emptyToNull(String(fd.get('nombre') ?? '').replace(/\s+/g, ' ')),
            email: emptyToNull(fd.get('email'))?.toLowerCase() ?? null,
        }),
        validate: (v) => {
            const e = {};
            if (!v.nombre || v.nombre.length < 2) e.nombre = 'Ingresa el nombre (mínimo 2 caracteres).';
            else if (v.nombre.length > 150) e.nombre = 'Máximo 150 caracteres.';
            if (!v.email) e.email = 'Ingresa el correo electrónico.';
            else if (!isValidEmail(v.email)) e.email = 'El correo no tiene un formato válido.';
            return e;
        },
        submit: async (v) => {
            modal.setBusy(true);
            try { return await inviteUser(v); } finally { modal.setBusy(false); }
        },
        onSuccess: async (_, v) => {
            modal.close();
            toast(`Invitación enviada a ${v.email}.`, 'success', { delay: 8000 });
            await onSent?.();
        },
    });
}

// ------------------------------------------------------------
// Catálogos
// ------------------------------------------------------------
async function renderCatalogs(body, { query, navigate }) {
    const cfg = findCatalogUI(query?.get('catalogo') ?? '') ?? CATALOG_UI[0];
    const rows = await loadCatalog(cfg.name, { refresh: true });
    const nameKey = labelField(cfg);
    const allowAdd = cfg.allowAdd !== false;

    render(body, html`
        <div class="catalog-layout">
            <nav class="catalog-nav card-panel" aria-label="Catálogos">
                <ul class="nav nav-pills flex-column gap-1">
                    ${CATALOG_UI.map((c) => html`<li class="nav-item"><a class="nav-link ${c === cfg ? 'active' : ''}"
                        href="#/configuracion/catalogos?catalogo=${c.name}" ${c === cfg ? html`aria-current="page"` : ''}>
                        <i class="bi ${c.icon}" aria-hidden="true"></i> ${c.label}</a></li>`)}
                </ul>
            </nav>
            <section class="card-panel catalog-panel">
                <div class="tab-toolbar">
                    <div>
                        <h2 class="tab-title">${cfg.label}</h2>
                        <p class="small text-secondary mb-0">Los registros no se eliminan: se desactivan para que no aparezcan en formularios nuevos, conservando el historial.</p>
                    </div>
                    ${allowAdd ? html`<button type="button" class="btn btn-primary btn-sm" id="btnAddCatalog"><i class="bi bi-plus-lg" aria-hidden="true"></i> Agregar</button>` : ''}
                </div>
                ${cfg.note ? html`<p class="small text-warning-emphasis"><i class="bi bi-shield-lock" aria-hidden="true"></i> ${cfg.note}</p>` : ''}
                ${rows.length === 0
                    ? emptyState({ icon: cfg.icon, title: 'Sin registros' })
                    : html`<div class="table-responsive"><table class="table align-middle mb-0">
                        <thead><tr>${cfg.fields.map((f) => html`<th scope="col">${f.label}</th>`)}<th scope="col">Estado</th>
                            <th scope="col"><span class="visually-hidden">Acciones</span></th></tr></thead>
                        <tbody>${rows.map((r) => {
                            const locked = isProtected(cfg, r);
                            return html`<tr class="${r.activo ? '' : 'text-secondary'}">
                                ${cfg.fields.map((f) => html`<td class="${f.type === 'textarea' ? 'small' : ''}">${f.name === nameKey ? html`<strong>${r[f.name]}</strong>` : displayText(r[f.name] === null ? null : String(r[f.name]))}
                                    ${f.name === nameKey && locked ? html` <i class="bi bi-shield-lock text-secondary" title="Valor utilizado por los procesos del sistema" aria-label="Protegido"></i>` : ''}</td>`)}
                                <td>${activeBadge(r.activo)}</td>
                                <td class="text-end text-nowrap">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" data-edit-row="${r.id}"><i class="bi bi-pencil" aria-hidden="true"></i> Editar</button>
                                    ${locked ? '' : r.activo
                                        ? html`<button type="button" class="btn btn-sm btn-outline-danger" data-toggle-row="${r.id}" data-to="false"><i class="bi bi-pause-circle" aria-hidden="true"></i> Desactivar</button>`
                                        : html`<button type="button" class="btn btn-sm btn-outline-success" data-toggle-row="${r.id}" data-to="true"><i class="bi bi-play-circle" aria-hidden="true"></i> Activar</button>`}
                                </td>
                            </tr>`;
                        })}</tbody></table></div>`}
            </section>
        </div>`);

    const refresh = () => navigate('/configuracion/catalogos', { catalogo: cfg.name }, { replace: true });
    body.querySelector('#btnAddCatalog')?.addEventListener('click', () => openCatalogForm({ cfg, rows, onSaved: refresh }));
    body.querySelectorAll('[data-edit-row]').forEach((btn) => btn.addEventListener('click', () => {
        openCatalogForm({ cfg, rows, row: rows.find((r) => String(r.id) === btn.dataset.editRow), onSaved: refresh });
    }));
    body.querySelectorAll('[data-toggle-row]').forEach((btn) => btn.addEventListener('click', async () => {
        const row = rows.find((r) => String(r.id) === btn.dataset.toggleRow);
        const to = btn.dataset.to === 'true';
        const restore = setButtonBusy(btn, to ? 'Activando…' : 'Desactivando…');
        try {
            await updateCatalogRow(cfg.name, row.id, { activo: to }, writableColumns(cfg, row));
            toast(`"${row[nameKey]}" ${to ? 'activado' : 'desactivado'}.`, 'success');
            refresh();
        } catch (err) {
            restore();
            toast(await reportError(err, 'Catálogo'), 'error');
        }
    }));
}

function openCatalogForm({ cfg, rows, row = null, onSaved }) {
    const locked = isProtected(cfg, row);
    const modal = openModal({
        title: row ? `Editar — ${cfg.label}` : `Agregar — ${cfg.label}`,
        body: html`
            <form id="catalogForm" novalidate>
                <div data-form-error hidden></div>
                ${locked ? html`<p class="small text-warning-emphasis"><i class="bi bi-shield-lock" aria-hidden="true"></i>
                    Este valor es utilizado por los procesos del sistema: solo puede modificarse su descripción.</p>` : ''}
                ${cfg.fields.map((f) => {
                    const value = row?.[f.name] ?? '';
                    const ro = locked && f.name !== 'descripcion';
                    const id = `cat-${f.name}`;
                    if (f.type === 'textarea') {
                        return html`<div class="mb-3"><label class="form-label" for="${id}">${f.label}</label>
                            <textarea class="form-control" id="${id}" name="${f.name}" rows="2">${value}</textarea></div>`;
                    }
                    return html`<div class="mb-3"><label class="form-label" for="${id}">${f.label} ${f.required ? req : ''}</label>
                        <input class="form-control" id="${id}" name="${f.name}" value="${value}" ${ro ? 'readonly' : ''}
                            ${f.type === 'int' ? html`inputmode="numeric"` : ''} ${f.max ? html`maxlength="${f.max}"` : ''} autocomplete="off">
                        ${f.help ? html`<div class="form-text">${f.help}</div>` : ''}</div>`;
                })}
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-primary" data-modal-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg" aria-hidden="true"></i> ${row ? 'Guardar cambios' : 'Agregar'}</button>
                </div>
            </form>`,
    });
    bindForm(modal.body.querySelector('#catalogForm'), {
        context: `Catálogo ${cfg.label}`,
        collect: (fd) => collectCatalogRow(cfg, (n) => fd.get(n)),
        validate: (v) => validateCatalogRow(cfg, v, { existing: rows, currentId: row?.id ?? null }),
        submit: async (v) => {
            modal.setBusy(true);
            try {
                if (row) await updateCatalogRow(cfg.name, row.id, v, writableColumns(cfg, row));
                else await createCatalogRow(cfg.name, v, writableColumns(cfg, null));
            } finally {
                modal.setBusy(false);
            }
        },
        onSuccess: async () => {
            modal.close();
            toast(row ? 'Registro actualizado.' : 'Registro agregado.', 'success');
            await onSaved?.();
        },
    });
}
