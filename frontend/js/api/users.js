// ============================================================
// Acceso a datos: cuenta y usuarias (Etapa 11).
//
// - Identidad y credenciales: Supabase Auth (fuente de verdad).
//   El correo NO se duplica en public.usuario (RN / Ficha §26.3).
// - public.usuario solo tiene política SELECT: el nombre no es
//   editable desde el cliente y activo solo cambia mediante las RPC
//   activar_usuario / desactivar_usuario (esta última impide la
//   autodesactivación y dejar el sistema sin usuarias activas, RN-59).
// - Invitación: Edge Function invitar-usuario (service role solo en
//   el servidor). El correo de otras usuarias no se consulta: no
//   existe un flujo seguro para leerlo desde el navegador.
// ============================================================

import { supabase } from '../supabase.js';

function raise(error) {
    if (error) throw error;
}

export async function listUsers() {
    const { data, error } = await supabase
        .from('usuario')
        .select('id_usuario, nombre, activo, fecha_registro')
        .order('fecha_registro', { ascending: true });
    raise(error);
    return data;
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
    if (data?.error) throw new Error(data.error);
    return data;
}

/** Cambia la contraseña de la sesión actual (también usado tras aceptar una invitación). */
export async function changeOwnPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    raise(error);
}
