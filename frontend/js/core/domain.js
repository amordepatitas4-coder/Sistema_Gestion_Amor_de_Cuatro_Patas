// ============================================================
// Constantes de dominio del backend v1.1 (sin dependencias).
// ============================================================

/** Nombres formales de ESTADO con significado de proceso en las RPC. */
// Se comparan por nombre porque los id dependen de los datos cargados en cada instalación.
export const ESTADOS = {
    RESCATADO: 'Rescatado',
    EN_TRATAMIENTO: 'En tratamiento',
    EN_HOGAR: 'En hogar temporal',
    DISPONIBLE: 'Disponible para adopción',
    ADOPTADO: 'Adoptado',
};

/** Estados que las RPC reservan para procesos específicos (no seleccionables a mano). */
export const ESTADOS_RESERVADOS = [ESTADOS.EN_HOGAR, ESTADOS.ADOPTADO];
