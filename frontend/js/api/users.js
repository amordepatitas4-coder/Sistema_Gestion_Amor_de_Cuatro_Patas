// ============================================================
// Acceso a datos: cuenta y usuarias (Etapa 11).
//
// - Identidad y credenciales: Supabase Auth (fuente de verdad).
//   El correo NO se duplica en public.usuario (RN / Ficha §26.3).
// - public.usuario solo tiene política SELECT: el nombre cambia solo
//   mediante actualizar_mi_nombre y activo solo mediante las RPC
//   activar_usuario / desactivar_usuario (esta última impide la
//   autodesactivación y dejar el sistema sin usuarias activas, RN-59).
// - Listado con correo: RPC listar_usuarias (SECURITY DEFINER; lee el
//   correo de auth.users en el servidor; solo usuarias activas; sin
//   acceso anon). El correo es de solo lectura.
// - Nombre propio: RPC actualizar_mi_nombre (solo la fila propia).
// - Invitación: Edge Function invitar-usuario (service role solo en
//   el servidor).
// ============================================================

import { AppError, functionMessage } from '../core/errors.js';
import { supabase } from '../supabase.js';

function raise(error) {
    if (error) throw error;
}

/** Usuarias con correo de Auth: [{ id_usuario, nombre, email, activo, fecha_registro }]. */
export async function listUsers() {
    const { data, error } = await supabase.rpc('listar_usuarias');
    raise(error);
    return data ?? [];
}

/** Actualiza el nombre de la usuaria actual (el backend normaliza espacios). */
export async function updateOwnName(nombre) {
    const { error } = await supabase.rpc('actualizar_mi_nombre', { p_nombre: nombre });
    raise(error);
}

export async function activateUser(idUsuario) {
    const { error } = await supabase.rpc('activar_usuario', { p_id_usuario: idUsuario });
    raise(error);
}

export async function deactivateUser(idUsuario) {
    const { error } = await supabase.rpc('desactivar_usuario', { p_id_usuario: idUsuario });
    raise(error);
}

/** Envía la invitación por correo; la persona invitada define su contraseña. */
export async function inviteUser({ nombre, email }) {
    const { data, error } = await supabase.functions.invoke('invitar-usuario', { body: { nombre, email } });
    raise(error);
    if (data?.error) throw new AppError(functionMessage(data.error));
    return data;
}

/** Cambia la contraseña de la sesión actual (también usado tras aceptar una invitación). */
export async function changeOwnPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    raise(error);
}
