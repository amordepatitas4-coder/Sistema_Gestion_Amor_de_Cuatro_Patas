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
// OBTENER ACCESS TOKEN DE GOOGLE
// ============================================================
async function obtenerGoogleAccessToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim();
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Faltan credenciales de Google Drive.");
  }
  const parametros = new URLSearchParams();
  parametros.set("client_id", clientId);
  parametros.set("client_secret", clientSecret);
  parametros.set("refresh_token", refreshToken);
  parametros.set("grant_type", "refresh_token");
  // OAuth 2.0: el refresh token guardado como secreto se canjea por un access token de corta duración para llamar a Drive.
  const respuestaGoogle = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: parametros.toString()
  });
  const datos = await respuestaGoogle.json();
  if (!respuestaGoogle.ok || !datos.access_token) {
    console.error("Error obteniendo token Google:", datos);
    throw new Error("No fue posible autenticar con Google Drive.");
  }
  return datos.access_token;
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
    // Secretos: existen solo en el servidor (variables de la Edge Function) y nunca se envían al navegador.
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Faltan variables de entorno de Supabase.");
    }
    // ========================================================
    // 4. OBTENER JWT
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
    // 7. VALIDAR USUARIO ACTIVO
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
    const idArchivo = Number(body?.id_archivo);
    // ========================================================
    // 9. VALIDAR ID
    // ========================================================
    if (!Number.isInteger(idArchivo) || idArchivo <= 0) {
      return respuesta({
        error: "El id_archivo no es válido."
      }, 400);
    }
    // ========================================================
    // 10. CLIENTE ADMIN
    //
    // Se utiliza únicamente dentro de la Edge Function para
    // consultar el registro interno del archivo.
    // ========================================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
    // ========================================================
    // 11. BUSCAR ARCHIVO EN NUESTRA BASE DE DATOS
    //
    // Importante:
    // El navegador entrega id_archivo.
    //
    // NO permitimos que entregue directamente id_externo.
    // ========================================================
    const { data: archivo, error: archivoError } = await supabaseAdmin.from("archivo").select(`
          id_archivo,
          nombre_archivo,
          nombre_original,
          mime_type,
          id_externo,
          fecha_documento,
          descripcion
        `).eq("id_archivo", idArchivo).single();
    if (archivoError || !archivo) {
      return respuesta({
        error: "El archivo solicitado no existe."
      }, 404);
    }
    if (!archivo.id_externo) {
      return respuesta({
        error: "El archivo no posee un identificador de Google Drive."
      }, 409);
    }
    // ========================================================
    // 12. OBTENER TOKEN GOOGLE
    // ========================================================
    const googleAccessToken = await obtenerGoogleAccessToken();
    // ========================================================
    // 13. CONSULTAR ARCHIVO EN GOOGLE DRIVE
    //
    // webViewLink:
    // enlace de visualización entregado por Google Drive.
    // ========================================================
    const idExterno = String(archivo.id_externo).trim();
    const campos = [
      "id",
      "name",
      "mimeType",
      "webViewLink",
      "trashed"
    ].join(",");
    const urlGoogle = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(idExterno)}`);
    urlGoogle.searchParams.set("fields", campos);
    const respuestaDrive = await fetch(urlGoogle.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`
      }
    });
    const datosDrive = await respuestaDrive.json();
    // ========================================================
    // 14. ARCHIVO NO DISPONIBLE EN DRIVE
    // ========================================================
    if (!respuestaDrive.ok) {
      console.error("Error consultando archivo en Drive:", {
        id_archivo: idArchivo,
        status: respuestaDrive.status,
        respuesta: datosDrive
      });
      if (respuestaDrive.status === 404) {
        return respuesta({
          error: "El archivo ya no se encuentra disponible en Google Drive."
        }, 404);
      }
      return respuesta({
        error: "No fue posible consultar el archivo en Google Drive."
      }, 502);
    }
    // ========================================================
    // 15. COMPROBAR PAPELERA
    // ========================================================
    if (datosDrive.trashed) {
      return respuesta({
        error: "El archivo se encuentra en la papelera de Google Drive."
      }, 410);
    }
    // ========================================================
    // 16. COMPROBAR LINK
    // ========================================================
    if (!datosDrive.webViewLink) {
      return respuesta({
        error: "Google Drive no entregó un enlace de visualización para este archivo."
      }, 409);
    }
    // ========================================================
    // 17. RESPUESTA AL FRONTEND
    // ========================================================
    return respuesta({
      mensaje: "Archivo encontrado correctamente.",
      archivo: {
        id_archivo: archivo.id_archivo,
        nombre: archivo.nombre_archivo,
        nombre_original: archivo.nombre_original,
        mime_type: datosDrive.mimeType ?? archivo.mime_type,
        fecha_documento: archivo.fecha_documento,
        descripcion: archivo.descripcion,
        url: datosDrive.webViewLink
      }
    }, 200);
  } catch (error) {
    console.error("ERROR obtener-link-archivo:", error);
    return respuesta({
      error: error instanceof Error ? error.message : "Error interno."
    }, 500);
  }
});
