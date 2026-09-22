import { createClient } from "npm:@supabase/supabase-js@2";
// ============================================================
// CORS
// ============================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
// ============================================================
// RESPUESTA JSON
// ============================================================
function respuesta(contenido, status = 200) {
  return new Response(JSON.stringify(contenido), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
// ============================================================
// NORMALIZAR NOMBRE
// ============================================================
function normalizarNombre(nombre) {
  return nombre.trim().replace(/\s+/g, " ");
}
// ============================================================
// VALIDAR CORREO
// ============================================================
function correoValido(email) {
  const expresion = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return expresion.test(email);
}
// ============================================================
// EDGE FUNCTION
// ============================================================
Deno.serve(async (req)=>{
  // ==========================================================
  // 1. CORS
  // ==========================================================
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    });
  }
  // ==========================================================
  // 2. SOLO POST
  // ==========================================================
  if (req.method !== "POST") {
    return respuesta({
      error: "Método no permitido."
    }, 405);
  }
  try {
    // ========================================================
    // 3. VARIABLES SUPABASE
    // ========================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Faltan variables de entorno de Supabase.");
    }
    // ========================================================
    // 4. OBTENER JWT DEL USUARIO QUE INVITA
    // ========================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respuesta({
        error: "No se encontró una sesión válida."
      }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // ========================================================
    // 5. CLIENTE DEL USUARIO
    //
    // Conserva el JWT de la persona que está realizando
    // la invitación.
    // ========================================================
    const supabaseUsuario = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // ========================================================
    // 6. VALIDAR JWT
    // ========================================================
    const { data: { user }, error: authError } = await supabaseUsuario.auth.getUser(token);
    if (authError || !user) {
      return respuesta({
        error: "Sesión inválida o expirada."
      }, 401);
    }
    // ========================================================
    // 7. COMPROBAR QUE QUIEN INVITA ESTÁ ACTIVO
    // ========================================================
    const { data: usuarioActual, error: usuarioError } = await supabaseUsuario.from("usuario").select("id_usuario, nombre, activo").eq("id_usuario", user.id).single();
    if (usuarioError || !usuarioActual || !usuarioActual.activo) {
      return respuesta({
        error: "Usuario no autorizado o inactivo."
      }, 403);
    }
    // ========================================================
    // 8. LEER BODY
    // ========================================================
    let body;
    try {
      body = await req.json();
    } catch  {
      return respuesta({
        error: "El cuerpo de la solicitud debe ser JSON."
      }, 400);
    }
    const nombre = normalizarNombre(String(body?.nombre ?? ""));
    const email = String(body?.email ?? "").trim().toLowerCase();
    // ========================================================
    // 9. VALIDACIONES
    // ========================================================
    if (!nombre) {
      return respuesta({
        error: "Debe ingresar el nombre del usuario."
      }, 400);
    }
    if (nombre.length < 2) {
      return respuesta({
        error: "El nombre ingresado es demasiado corto."
      }, 400);
    }
    if (nombre.length > 150) {
      return respuesta({
        error: "El nombre no puede superar los 150 caracteres."
      }, 400);
    }
    if (!email) {
      return respuesta({
        error: "Debe ingresar un correo electrónico."
      }, 400);
    }
    if (!correoValido(email)) {
      return respuesta({
        error: "El correo electrónico no tiene un formato válido."
      }, 400);
    }
    // ========================================================
    // 10. CLIENTE ADMIN
    //
    // La clave administrativa existe SOLO dentro de la
    // Edge Function.
    //
    // Nunca se entrega al navegador.
    // ========================================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    // ========================================================
    // 11. ENVIAR INVITACIÓN
    //
    // "nombre" se guarda en user_metadata.
    //
    // Nuestro trigger trg_crear_usuario_publico utilizará
    // este metadata para crear public.usuario.
    // ========================================================
    const { data: invitacion, error: invitacionError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        nombre: nombre
      }
    });
    // ========================================================
    // 12. MANEJAR ERROR DE SUPABASE AUTH
    // ========================================================
    if (invitacionError) {
      console.error("ERROR INVITANDO USUARIO:", {
        mensaje: invitacionError.message,
        status: invitacionError.status,
        codigo: invitacionError.code
      });
      // No entregamos detalles internos innecesarios
      // al navegador.
      if (invitacionError.message.toLowerCase().includes("already")) {
        return respuesta({
          error: "Ya existe una cuenta asociada a este correo electrónico."
        }, 409);
      }
      return respuesta({
        error: "No fue posible enviar la invitación.",
        detalle: invitacionError.message
      }, 400);
    }
    // ========================================================
    // 13. COMPROBAR USUARIO CREADO
    // ========================================================
    const usuarioInvitado = invitacion?.user;
    if (!usuarioInvitado) {
      throw new Error("Supabase no devolvió el usuario invitado.");
    }
    console.log("Usuario invitado correctamente:", {
      id: usuarioInvitado.id,
      email: usuarioInvitado.email,
      invitadoPor: user.id
    });
    // ========================================================
    // 14. RESPUESTA
    // ========================================================
    return respuesta({
      mensaje: "Invitación enviada correctamente.",
      usuario: {
        id_usuario: usuarioInvitado.id,
        nombre: nombre,
        email: usuarioInvitado.email
      }
    }, 201);
  } catch (error) {
    console.error("ERROR invitar-usuario:", error);
    return respuesta({
      error: error instanceof Error ? error.message : "Error interno."
    }, 500);
  }
});
