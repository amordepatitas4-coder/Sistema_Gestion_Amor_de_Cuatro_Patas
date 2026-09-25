// ============================================================
// Envío seguro de formularios.
//
// Implementa el patrón obligatorio:
//   1. prevenir submit normal;
//   2. capturar FormData y archivos;
//   3. validar;
//   4. conservar los datos en variables;
//   5. marcar el formulario como ocupado;
//   6. bloquear SOLO los botones de envío;
//   7. ejecutar la operación;
//   8. procesar el resultado;
//   9. restaurar el estado (o dejar que onSuccess cierre/navegue).
//
// Nunca se deshabilitan inputs antes de construir FormData.
// ============================================================

import { reportError } from './errors.js';
import { html, render, setButtonBusy } from './ui.js';

/**
 * Asocia un formulario a una operación asíncrona.
 *
 * options:
 *   collect(formData, form)  → objeto con los datos (por defecto Object.fromEntries).
 *   validate(data, form)     → { campo: 'mensaje', _form: 'mensaje general' } o null.
 *   submit(data)             → Promise con el resultado de la operación.
 *   onSuccess(result, data)  → opcional.
 *   onError(err, message)    → opcional; por defecto muestra el mensaje en el formulario.
 *   busyLabel                → texto del botón mientras procesa ("Guardando…").
 *   context                  → nombre de la operación para la consola.
 *
 * Devuelve una función que desvincula el formulario.
 */
export function bindForm(form, {
    collect = (fd) => Object.fromEntries(fd.entries()),
    validate = null,
    submit,
    onSuccess = null,
    onError = null,
    busyLabel = 'Guardando…',
    context = 'Formulario',
}) {
    let busy = false;

    async function handleSubmit(event) {
        event.preventDefault();
        // Evita el doble envío (doble clic o Enter repetido) mientras la operación sigue en curso.
        if (busy) return;

        clearFormErrors(form);

        // 2–4: capturar y validar ANTES de bloquear cualquier control.
        const formData = new FormData(form);
        const data = collect(formData, form);
        const errors = validate ? validate(data, form) : null;
        if (errors && Object.keys(errors).length > 0) {
            showFormErrors(form, errors);
            return;
        }

        // 5–6: marcar ocupado y bloquear solo botones de envío.
        busy = true;
        form.setAttribute('aria-busy', 'true');
        const submitter = event.submitter ?? form.querySelector('[type="submit"]');
        const restoreSubmitter = setButtonBusy(submitter, busyLabel);
        const others = [...form.querySelectorAll('button[type="submit"]')].filter((b) => b !== submitter && !b.disabled);
        others.forEach((b) => { b.disabled = true; });

        try {
            // 7–8
            const result = await submit(data);
            restore();
            await onSuccess?.(result, data);
        } catch (err) {
            restore();
            const message = await reportError(err, context);
            if (onError) onError(err, message);
            else showFormErrors(form, { _form: message });
        }

        // 9
        function restore() {
            busy = false;
            form.removeAttribute('aria-busy');
            restoreSubmitter();
            others.forEach((b) => { b.disabled = false; });
        }
    }

    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
}

// ------------------------------------------------------------
// Errores junto al campo y error general del formulario.
//
// El error general se muestra en un elemento [data-form-error]
// dentro del formulario (se crea si no existe).
// ------------------------------------------------------------

export function showFormErrors(form, errors) {
    let firstInvalid = null;

    Object.entries(errors).forEach(([name, message]) => {
        if (name === '_form') return;
        const field = form.elements.namedItem(name);
        const input = field instanceof RadioNodeList ? field[0] : field;
        if (!input) return;
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        feedback.dataset.fieldError = '';
        feedback.id = `${input.id || name}-error`;
        feedback.textContent = message;
        input.dataset.describedbyBefore = input.getAttribute('aria-describedby') ?? '';
        input.setAttribute('aria-describedby', `${input.dataset.describedbyBefore} ${feedback.id}`.trim());
        (input.closest('.input-group') ?? input).insertAdjacentElement('afterend', feedback);
        firstInvalid ??= input;
    });

    if (errors._form) {
        let box = form.querySelector('[data-form-error]');
        if (!box) {
            box = document.createElement('div');
            box.dataset.formError = '';
            form.prepend(box);
        }
        render(box, html`
            <div class="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                <i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i>
                <div>${errors._form}</div>
            </div>`);
        box.hidden = false;
    }

    firstInvalid?.focus();
}

export function clearFormErrors(form) {
    form.querySelectorAll('[data-field-error]').forEach((el) => el.remove());
    form.querySelectorAll('.is-invalid').forEach((el) => {
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
        const before = el.dataset.describedbyBefore;
        if (before) el.setAttribute('aria-describedby', before);
        else el.removeAttribute('aria-describedby');
        delete el.dataset.describedbyBefore;
    });
    const box = form.querySelector('[data-form-error]');
    if (box) { box.innerHTML = ''; box.hidden = true; }
}

/** Muestra un aviso informativo (no error) en la zona general del formulario. */
export function showFormNotice(form, message, type = 'info') {
    let box = form.querySelector('[data-form-error]');
    if (!box) {
        box = document.createElement('div');
        box.dataset.formError = '';
        form.prepend(box);
    }
    const icon = type === 'success' ? 'bi-check-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill';
    render(box, html`
        <div class="alert alert-${type} d-flex gap-2 align-items-start" role="status">
            <i class="bi ${icon}" aria-hidden="true"></i>
            <div>${message}</div>
        </div>`);
    box.hidden = false;
}
