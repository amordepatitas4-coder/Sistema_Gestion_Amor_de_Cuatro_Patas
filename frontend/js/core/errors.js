// ============================================================
// Traducción de errores técnicos a mensajes comprensibles.
//
// Cubre errores de:
//   - red (fetch);
//   - Supabase Auth;
//   - PostgREST / PostgreSQL (códigos SQLSTATE y PGRST);
//   - Edge Functions (se lee el cuerpo { error } de la respuesta).
//
// El objeto técnico se conserva en consola; la interfaz recibe
// solo un mensaje seguro.
// ============================================================

export const MESSAGES = {
    network: 'No fue posible conectar con el servicio. Revisa tu conexión e intenta nuevamente.',
    generic: 'Ocurrió un error inesperado. Intenta nuevamente.',
    session: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
    permission: 'No tienes permiso para realizar esta operación. Si el problema persiste, vuelve a iniciar sesión.',
    invalidCredentials: 'Correo o contraseña incorrectos.',
    rateLimit: 'Demasiados intentos en poco tiempo. Espera unos minutos e intenta nuevamente.',
    inactive: 'Tu cuenta no está habilitada para usar el sistema. Comunícate con una administradora de la Fundación.',
    service: 'El servicio no pudo completar la operación. Intenta nuevamente en unos minutos; si se repite, avisa a la administradora del sistema.',
    drive: 'Google Drive no respondió correctamente. Intenta nuevamente en unos minutos; si se repite, avisa a la administradora del sistema.',
};

/** Error propio de la aplicación con mensaje ya apto para la usuaria. */
export class AppError extends Error {
    constructor(message, { code = 'app', cause = null } = {}) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.cause = cause;
    }
}

// Restricciones UNIQUE del backend v1.1.
const UNIQUE_MESSAGES = {
    uq_animal_microchip: 'Ya existe un animal registrado con ese microchip.',
    uq_adoptante_rut: 'Ya existe un adoptante registrado con ese RUT.',
    uq_animal_esterilizacion_codigo: 'Ese código ya se utiliza en este proyecto.',
    uq_animal_esterilizacion_proyecto_microchip: 'Ese microchip ya está registrado en la nómina de este proyecto.',
    uq_esterilizacion_profesional: 'Ese profesional ya está asociado a esta esterilización.',
    uq_esterilizacion_archivo_documento: 'Esta esterilización ya tiene un documento registrado.',
    uq_animal_gasto: 'El gasto ya tiene una asignación para ese animal.',
    uq_archivo_id_externo: 'El archivo ya se encuentra registrado.',
    uq_especie_nombre: 'Ya existe una especie con ese nombre.',
    uq_estado_nombre: 'Ya existe un estado con ese nombre.',
    uq_rango_etario_nombre: 'Ya existe un rango etario con ese nombre.',
    uq_tipo_atencion_sanitaria_nombre: 'Ya existe un tipo de atención con ese nombre.',
    uq_estado_adopcion_nombre: 'Ya existe un estado de adopción con ese nombre.',
    uq_categoria_gasto_nombre: 'Ya existe una categoría de gasto con ese nombre.',
    uq_estado_proyecto_nombre: 'Ya existe un estado de proyecto con ese nombre.',
    uq_categoria_archivo_nombre: 'Ya existe una categoría de archivo con ese nombre.',
    uq_permanencia_animal_activa: 'El animal ya tiene un hogar temporal activo.',
    uq_adopcion_animal_activa: 'El animal ya tiene una adopción activa.',
};

// Restricciones CHECK del backend v1.1.
const CHECK_MESSAGES = {
    chk_animal_microchip: 'El microchip debe tener exactamente 15 dígitos.',
    chk_animal_esterilizacion_microchip: 'El microchip debe tener exactamente 15 dígitos.',
    chk_animal_fechas: 'La fecha de nacimiento no puede ser posterior a la fecha de rescate.',
    chk_animal_esterilizacion_fechas: 'La fecha de nacimiento no puede ser posterior a la fecha de esterilización.',
    chk_atencion_proximo_control: 'El próximo control no puede ser anterior a la fecha de la atención.',
    chk_proyecto_fechas: 'La fecha de término no puede ser anterior a la fecha de inicio.',
    chk_gasto_monto: 'El monto del gasto debe ser mayor que cero.',
    chk_animal_gasto_monto: 'El monto asignado debe ser mayor que cero.',
    chk_seguimiento_medio: 'El medio de contacto seleccionado no es válido.',
    chk_rango_edades: 'La edad máxima debe ser mayor que la edad mínima.',
    chk_rango_edad_min: 'La edad mínima no puede ser negativa.',
};

function findConstraint(err, catalog) {
    const text = `${err?.message ?? ''} ${err?.details ?? ''}`;
    return Object.keys(catalog).find((name) => text.includes(name));
}

function isNetworkError(err) {
    const name = err?.name ?? '';
    const msg = String(err?.message ?? '');
    return name === 'FunctionsFetchError'
        || name === 'AuthRetryableFetchError'
        || (name === 'TypeError' && /fetch|network|load failed/i.test(msg))
        || /Failed to fetch|NetworkError|Load failed/i.test(msg);
}

function describeAuthError(err) {
    const code = err?.code ?? '';
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(err?.message ?? '')) {
        return MESSAGES.invalidCredentials;
    }
    if (err?.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return MESSAGES.rateLimit;
    if (code === 'email_address_invalid') return 'El correo electrónico no tiene un formato válido.';
    if (code === 'user_banned') return MESSAGES.inactive;
    if (code === 'email_not_confirmed') return 'El correo de la cuenta aún no ha sido confirmado.';
    if (code === 'session_not_found' || code === 'refresh_token_not_found' || err?.status === 401) {
        return MESSAGES.session;
    }
    return 'No fue posible completar la autenticación. Intenta nuevamente.';
}

function describePostgrestError(err) {
    const code = err.code;
    switch (code) {
        case 'P0001':
            // Excepciones de negocio de las RPC: ya vienen redactadas en español.
            return err.message || MESSAGES.generic;
        case '23505':
            return UNIQUE_MESSAGES[findConstraint(err, UNIQUE_MESSAGES)] ?? 'Ya existe un registro con esos datos.';
        case '23514':
            return CHECK_MESSAGES[findConstraint(err, CHECK_MESSAGES)] ?? 'Algún dato no cumple las reglas del sistema.';
        case '23503':
            return 'El registro relacionado no existe o no puede utilizarse.';
        case '23502':
            return 'Falta completar un dato obligatorio.';
        case '22P02':
        case '22007':
        case '22008':
        case '22003':
        case '22001':
            return 'Algún dato tiene un formato o largo no válido.';
        case '42501':
            return MESSAGES.permission;
        case 'PGRST301':
        case 'PGRST302':
            return MESSAGES.session;
        case 'PGRST116':
            return 'No se encontró el registro solicitado.';
        default:
            return null;
    }
}

/**
 * Mensaje de una Edge Function apto para la usuaria (Etapa 12).
 * Los mensajes de negocio ya vienen redactados en español y se conservan;
 * los detalles técnicos (códigos de Google, configuración del servidor)
 * se reemplazan por una indicación comprensible.
 */
export function functionMessage(text) {
    const msg = String(text ?? '').trim();
    if (!msg) return MESSAGES.service;
    if (/variables de entorno|^error interno|service.?role|\bundefined\b|\bnull\b|TypeError|ReferenceError/i.test(msg)) return MESSAGES.service;
    if (/Google Drive respondió \d|Google Drive rechazó el archivo: |autenticar con Google|invalid_grant|oauth/i.test(msg)) return MESSAGES.drive;
    return msg;
}

/**
 * Obtiene un mensaje seguro para la usuaria a partir de cualquier error.
 * Es asíncrona porque los errores de Edge Functions traen el detalle
 * en el cuerpo de la respuesta HTTP.
 */
export async function describeError(err) {
    if (!err) return MESSAGES.generic;
    if (err instanceof AppError) return err.message;
    if (isNetworkError(err)) return MESSAGES.network;

    // Edge Functions: FunctionsHttpError trae la Response en context.
    if (err.name === 'FunctionsHttpError' || err.name === 'FunctionsRelayError') {
        const body = await readFunctionErrorBody(err);
        return functionMessage(body?.error);
    }

    if (err.__isAuthError || String(err.name ?? '').startsWith('Auth')) {
        return describeAuthError(err);
    }

    if (typeof err.code === 'string') {
        const message = describePostgrestError(err);
        if (message) return message;
    }

    return MESSAGES.generic;
}

async function readFunctionErrorBody(err) {
    const response = err?.context;
    if (!response || typeof response.clone !== 'function') return null;
    try {
        return await response.clone().json();
    } catch {
        return null;
    }
}

/**
 * Registra el error técnico en consola y devuelve el mensaje para la UI.
 * context: texto breve que identifica la operación.
 */
export async function reportError(err, context = 'Operación') {
    console.error(`[${context}]`, err);
    return describeError(err);
}
