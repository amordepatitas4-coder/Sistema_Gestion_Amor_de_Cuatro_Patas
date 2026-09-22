import { createClient } from "npm:@supabase/supabase-js@2";
// ============================================================
// CONFIGURACIÓN CORS
// ============================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
// ============================================================
// EDGE FUNCTION
// crear-carpeta-animal
//
// Objetivo:
// Crear o recuperar la carpeta de Google Drive asociada
// a un animal.
//
// Protección:
// - Si ANIMAL ya tiene id_carpeta_drive, no crea otra.
// - Si Drive ya contiene una carpeta marcada con animal_id,
//   recupera esa carpeta en vez de crear otra.
// - La carpeta se identifica mediante appProperties.animal_id.
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
  try {
    // ========================================================
    // 2. SOLO POST
    // ========================================================
    if (req.method !== "POST") {
      return respuesta({
        error: "Método no permitido."
      }, 405);
    }
    // ========================================================
    // 3. VARIABLES DE ENTORNO
    // ========================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
    const carpetaAnimalesId = Deno.env.get("GOOGLE_DRIVE_ANIMALES_FOLDER_ID");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !googleClientId || !googleClientSecret || !googleRefreshToken || !carpetaAnimalesId) {
      throw new Error("Faltan variables de entorno requeridas.");
    }
    // ========================================================
    // 4. AUTENTICACIÓN SUPABASE
    // ========================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respuesta({
        error: "No se encontró una sesión válida."
      }, 401);
    }
    const supabaseUsuario = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabaseUsuario.auth.getUser(token);
    if (authError || !user) {
      return respuesta({
        error: "Sesión inválida o expirada."
      }, 401);
    }
    // ========================================================
    // 5. VERIFICAR USUARIO ACTIVO
    // ========================================================
    const { data: usuario, error: usuarioError } = await supabaseUsuario.from("usuario").select("id_usuario, activo").eq("id_usuario", user.id).single();
    if (usuarioError || !usuario || !usuario.activo) {
      return respuesta({
        error: "Usuario no autorizado o inactivo."
      }, 403);
    }
    // ========================================================
    // 6. RECIBIR ID DEL ANIMAL
    // ========================================================
    let body;
    try {
      body = await req.json();
    } catch  {
      return respuesta({
        error: "El cuerpo de la solicitud no es válido."
      }, 400);
    }
    const idAnimal = Number(body.id_animal);
    if (!Number.isInteger(idAnimal) || idAnimal <= 0) {
      return respuesta({
        error: "id_animal no válido."
      }, 400);
    }
    // ========================================================
    // 7. CLIENTE INTERNO SUPABASE
    // ========================================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    // ========================================================
    // 8. CONSULTAR ANIMAL
    // ========================================================
    const { data: animal, error: animalError } = await supabaseAdmin.from("animal").select("id_animal, nombre, activo, id_carpeta_drive").eq("id_animal", idAnimal).single();
    if (animalError || !animal) {
      return respuesta({
        error: "El animal indicado no existe."
      }, 404);
    }
    if (!animal.activo) {
      return respuesta({
        error: "El animal se encuentra inactivo."
      }, 400);
    }
    // ========================================================
    // 9. PRIMERA PROTECCIÓN
    //
    // Si PostgreSQL ya conoce la carpeta, terminamos aquí.
    // ========================================================
    if (animal.id_carpeta_drive) {
      return respuesta({
        mensaje: "El animal ya posee una carpeta en Google Drive.",
        recuperada: true,
        id_animal: animal.id_animal,
        id_carpeta_drive: animal.id_carpeta_drive
      }, 200);
    }
    // ========================================================
    // 10. OBTENER ACCESS TOKEN DE GOOGLE
    // ========================================================
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: googleRefreshToken,
        grant_type: "refresh_token"
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Error obteniendo token Google:", tokenData);
      throw new Error("No fue posible autenticar con Google Drive.");
    }
    const accessToken = tokenData.access_token;
    // ========================================================
    // 11. BUSCAR SI DRIVE YA TIENE LA CARPETA
    //
    // No buscamos por nombre.
    //
    // Buscamos por:
    // appProperties.animal_id
    //
    // Además exigimos que esté dentro de nuestra carpeta
    // principal "Animales".
    // ========================================================
    const consulta = [
      `'${carpetaAnimalesId}' in parents`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
      `appProperties has { key='animal_id' and value='${animal.id_animal}' }`
    ].join(" and ");
    const searchUrl = new URL("https://www.googleapis.com/drive/v3/files");
    searchUrl.searchParams.set("q", consulta);
    searchUrl.searchParams.set("fields", "files(id,name)");
    searchUrl.searchParams.set("pageSize", "10");
    const searchResponse = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const searchData = await searchResponse.json();
    if (!searchResponse.ok) {
      console.error("Error buscando carpeta en Drive:", searchData);
      throw new Error("No fue posible comprobar las carpetas existentes en Google Drive.");
    }
    // ========================================================
    // 12. SI LA CARPETA YA EXISTE EN DRIVE
    //
    // Esto permite recuperarnos de un escenario como:
    //
    // Drive creó carpeta ✅
    // PostgreSQL no alcanzó a guardar ID ❌
    //
    // En el siguiente intento NO creamos otra.
    // ========================================================
    if (Array.isArray(searchData.files) && searchData.files.length > 0) {
      const carpetaExistente = searchData.files[0];
      const { error: updateExistenteError } = await supabaseAdmin.from("animal").update({
        id_carpeta_drive: carpetaExistente.id
      }).eq("id_animal", animal.id_animal).is("id_carpeta_drive", null);
      if (updateExistenteError) {
        console.error("Error recuperando carpeta en ANIMAL:", updateExistenteError);
        throw new Error("La carpeta existe en Drive, pero no fue posible registrar su ID.");
      }
      return respuesta({
        mensaje: "Se encontró la carpeta existente del animal y fue recuperada.",
        recuperada: true,
        id_animal: animal.id_animal,
        nombre_carpeta: carpetaExistente.name,
        id_carpeta_drive: carpetaExistente.id
      }, 200);
    }
    // ========================================================
    // 13. CONSTRUIR NOMBRE DE CARPETA
    // ========================================================
    const nombreAnimal = animal.nombre?.trim() || "Sin nombre";
    const nombreCarpeta = `${animal.id_animal} - ${nombreAnimal}`;
    // ========================================================
    // 14. CREAR CARPETA EN GOOGLE DRIVE
    //
    // IMPORTANTE:
    //
    // appProperties es información interna de la aplicación.
    //
    // Aunque posteriormente cambiemos el nombre visible,
    // animal_id continuará identificando la carpeta.
    // ========================================================
    const driveResponse = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: nombreCarpeta,
        mimeType: "application/vnd.google-apps.folder",
        parents: [
          carpetaAnimalesId
        ],
        appProperties: {
          animal_id: String(animal.id_animal)
        }
      })
    });
    const driveData = await driveResponse.json();
    if (!driveResponse.ok || !driveData.id) {
      console.error("Error Google Drive:", driveData);
      throw new Error("No fue posible crear la carpeta en Google Drive.");
    }
    // ========================================================
    // 15. GUARDAR ID EN POSTGRESQL
    // ========================================================
    const { error: updateError } = await supabaseAdmin.from("animal").update({
      id_carpeta_drive: driveData.id
    }).eq("id_animal", animal.id_animal).is("id_carpeta_drive", null);
    if (updateError) {
      console.error("La carpeta fue creada pero no se pudo actualizar ANIMAL:", updateError);
      throw new Error("La carpeta fue creada, pero no fue posible registrar su ID en la base de datos.");
    }
    // ========================================================
    // 16. RESPUESTA EXITOSA
    // ========================================================
    return respuesta({
      mensaje: "Carpeta del animal creada correctamente.",
      recuperada: false,
      id_animal: animal.id_animal,
      nombre_carpeta: driveData.name,
      id_carpeta_drive: driveData.id
    }, 201);
  } catch (error) {
    console.error("Error crear-carpeta-animal:", error);
    return respuesta({
      error: error instanceof Error ? error.message : "Error interno."
    }, 500);
  }
});
// ============================================================
// RESPUESTA JSON
// ============================================================
function respuesta(contenido, status) {
  return new Response(JSON.stringify(contenido), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
