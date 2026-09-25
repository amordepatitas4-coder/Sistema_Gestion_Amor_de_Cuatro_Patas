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
// ============================================================
// BUSCAR CARPETA EN GOOGLE DRIVE
//
// Esta versión incluye logs detallados para diagnóstico.
// ============================================================
async function buscarCarpeta(accessToken, parentId, propertyKey, propertyValue) {
  const consulta = [
    `'${parentId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    `appProperties has { key='${propertyKey}' and value='${propertyValue}' }`
  ].join(" and ");
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", consulta);
  url.searchParams.set("fields", "files(id,name,appProperties)");
  url.searchParams.set("pageSize", "10");
  // ----------------------------------------------------------
  // LOG DE DIAGNÓSTICO
  // No imprime access token ni secretos.
  // ----------------------------------------------------------
  console.log("GOOGLE DRIVE - BUSCANDO CARPETA", {
    parentId,
    propertyKey,
    propertyValue,
    consulta,
    url: url.toString()
  });
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  let data;
  try {
    data = await response.json();
  } catch  {
    data = {
      error: "Google no devolvió una respuesta JSON válida."
    };
  }
  // ----------------------------------------------------------
  // ERROR DETALLADO DE GOOGLE DRIVE
  // ----------------------------------------------------------
  if (!response.ok) {
    console.error("ERROR GOOGLE DRIVE - buscarCarpeta", {
      status: response.status,
      statusText: response.statusText,
      parentId: parentId,
      propertyKey: propertyKey,
      propertyValue: propertyValue,
      consulta: consulta,
      respuestaGoogle: data
    });
    throw new Error(`Google Drive respondió ${response.status}: ${data?.error?.message ?? "Error desconocido al consultar Drive."}`);
  }
  // ----------------------------------------------------------
  // CONSULTA CORRECTA
  // ----------------------------------------------------------
  console.log("GOOGLE DRIVE - RESULTADO BÚSQUEDA", {
    cantidad: Array.isArray(data.files) ? data.files.length : 0,
    archivos: data.files ?? []
  });
  if (Array.isArray(data.files) && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}
// ============================================================
// CREAR CARPETA EN GOOGLE DRIVE
// ============================================================
async function crearCarpeta(accessToken, parentId, nombre, appProperties) {
  console.log("GOOGLE DRIVE - CREANDO CARPETA", {
    parentId,
    nombre,
    appProperties
  });
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,appProperties", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      parents: [
        parentId
      ],
      appProperties: appProperties
    })
  });
  let data;
  try {
    data = await response.json();
  } catch  {
    data = {
      error: "Google no devolvió una respuesta JSON válida."
    };
  }
  if (!response.ok || !data.id) {
    console.error("ERROR GOOGLE DRIVE - crearCarpeta", {
      status: response.status,
      statusText: response.statusText,
      parentId: parentId,
      nombre: nombre,
      appProperties: appProperties,
      respuestaGoogle: data
    });
    throw new Error(`Google Drive respondió ${response.status}: ${data?.error?.message ?? "No fue posible crear la carpeta."}`);
  }
  console.log("GOOGLE DRIVE - CARPETA CREADA", {
    id: data.id,
    nombre: data.name
  });
  return data;
}
// ============================================================
// EDGE FUNCTION
// crear-carpeta-proyecto
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
    // Secretos: existen solo en el servidor (variables de la Edge Function) y nunca se envían al navegador.
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
    const carpetaProyectosId = Deno.env.get("GOOGLE_DRIVE_PROYECTOS_FOLDER_ID");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !googleClientId || !googleClientSecret || !googleRefreshToken || !carpetaProyectosId) {
      console.error("Faltan variables de entorno.");
      throw new Error("Faltan variables de entorno requeridas.");
    }
    // ========================================================
    // 4. AUTENTICACIÓN
    // ========================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respuesta({
        error: "No se encontró una sesión válida."
      }, 401);
    }
    // Cliente "como la usuaria": reenvía su JWT, por lo que sus consultas respetan RLS.
    const supabaseUsuario = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // Valida el JWT contra Supabase Auth (firma y vigencia); sin sesión válida se responde 401.
    const { data: { user }, error: authError } = await supabaseUsuario.auth.getUser(token);
    if (authError || !user) {
      console.error("Error autenticación Supabase:", authError);
      return respuesta({
        error: "Sesión inválida o expirada."
      }, 401);
    }
    console.log("USUARIO AUTENTICADO", {
      id: user.id
    });
    // ========================================================
    // 5. VERIFICAR USUARIO ACTIVO
    // ========================================================
    const { data: usuario, error: usuarioError } = await supabaseUsuario.from("usuario").select("id_usuario, activo").eq("id_usuario", user.id).single();
    if (usuarioError || !usuario || !usuario.activo) {
      console.error("Usuario no autorizado:", usuarioError);
      return respuesta({
        error: "Usuario no autorizado o inactivo."
      }, 403);
    }
    // ========================================================
    // 6. LEER ID DEL PROYECTO
    // ========================================================
    let body;
    try {
      body = await req.json();
    } catch  {
      return respuesta({
        error: "El cuerpo de la solicitud no es válido."
      }, 400);
    }
    const idProyecto = Number(body.id_proyecto);
    if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
      return respuesta({
        error: "id_proyecto no válido."
      }, 400);
    }
    console.log("PROYECTO SOLICITADO", {
      id_proyecto: idProyecto
    });
    // ========================================================
    // 7. CLIENTE ADMIN INTERNO
    // ========================================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    // ========================================================
    // 8. CONSULTAR PROYECTO
    // ========================================================
    const { data: proyecto, error: proyectoError } = await supabaseAdmin.from("proyecto_esterilizacion").select("id_proyecto, nombre, id_carpeta_drive").eq("id_proyecto", idProyecto).single();
    if (proyectoError || !proyecto) {
      console.error("Error consultando proyecto:", proyectoError);
      return respuesta({
        error: "El proyecto de esterilización indicado no existe."
      }, 404);
    }
    console.log("PROYECTO ENCONTRADO", {
      id_proyecto: proyecto.id_proyecto,
      nombre: proyecto.nombre,
      tiene_carpeta: Boolean(proyecto.id_carpeta_drive)
    });
    // ========================================================
    // 9. OBTENER ACCESS TOKEN DE GOOGLE
    // ========================================================
    console.log("Solicitando access token a Google...");
    // OAuth 2.0: el refresh token guardado como secreto se canjea por un access token de corta duración para llamar a Drive.
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
      console.error("ERROR GOOGLE OAUTH", {
        status: tokenResponse.status,
        respuestaGoogle: tokenData
      });
      throw new Error(`No fue posible autenticar con Google: ${tokenData?.error_description ?? tokenData?.error ?? "Error desconocido."}`);
    }
    console.log("Access token de Google obtenido correctamente.");
    const accessToken = tokenData.access_token;
    // ========================================================
    // 10. CARPETA PRINCIPAL DEL PROYECTO
    // ========================================================
    let idCarpetaProyecto = proyecto.id_carpeta_drive;
    let nombreCarpetaProyecto = `${proyecto.id_proyecto} - ${proyecto.nombre}`;
    let carpetaProyectoRecuperada = false;
    if (!idCarpetaProyecto) {
      console.log("Proyecto sin carpeta registrada. Buscando en Drive...");
      const carpetaExistente = await buscarCarpeta(accessToken, carpetaProyectosId, "proyecto_id", String(proyecto.id_proyecto));
      if (carpetaExistente) {
        console.log("Carpeta del proyecto recuperada desde Drive.");
        idCarpetaProyecto = carpetaExistente.id;
        nombreCarpetaProyecto = carpetaExistente.name;
        carpetaProyectoRecuperada = true;
      } else {
        console.log("No existe carpeta del proyecto. Se creará una nueva.");
        const nuevaCarpeta = await crearCarpeta(accessToken, carpetaProyectosId, nombreCarpetaProyecto, {
          proyecto_id: String(proyecto.id_proyecto),
          tipo: "proyecto_esterilizacion"
        });
        idCarpetaProyecto = nuevaCarpeta.id;
        nombreCarpetaProyecto = nuevaCarpeta.name;
      }
      // ------------------------------------------------------
      // Guardar ID principal en PostgreSQL
      // ------------------------------------------------------
      const { error: updateError } = await supabaseAdmin.from("proyecto_esterilizacion").update({
        id_carpeta_drive: idCarpetaProyecto
      }).eq("id_proyecto", proyecto.id_proyecto).is("id_carpeta_drive", null);
      if (updateError) {
        console.error("Error guardando carpeta del proyecto:", updateError);
        throw new Error("La carpeta existe en Drive, pero no fue posible guardar su ID en la base de datos.");
      }
      console.log("ID de carpeta principal guardado en PostgreSQL.");
    }
    // ========================================================
    // SEGURIDAD DE TIPO
    // ========================================================
    if (!idCarpetaProyecto) {
      throw new Error("No fue posible determinar la carpeta principal del proyecto.");
    }
    // ========================================================
    // 11. SUBCARPETA DOCUMENTACIÓN
    // ========================================================
    console.log("Buscando subcarpeta Documentación...");
    let carpetaDocumentacion = await buscarCarpeta(accessToken, idCarpetaProyecto, "tipo_carpeta", "documentacion");
    if (!carpetaDocumentacion) {
      console.log("Subcarpeta Documentación no encontrada. Creando...");
      carpetaDocumentacion = await crearCarpeta(accessToken, idCarpetaProyecto, "Documentación", {
        proyecto_id: String(proyecto.id_proyecto),
        tipo_carpeta: "documentacion"
      });
    }
    // ========================================================
    // 12. SUBCARPETA ANIMALES
    // ========================================================
    console.log("Buscando subcarpeta Animales...");
    let carpetaAnimales = await buscarCarpeta(accessToken, idCarpetaProyecto, "tipo_carpeta", "animales");
    if (!carpetaAnimales) {
      console.log("Subcarpeta Animales no encontrada. Creando...");
      carpetaAnimales = await crearCarpeta(accessToken, idCarpetaProyecto, "Animales", {
        proyecto_id: String(proyecto.id_proyecto),
        tipo_carpeta: "animales"
      });
    }
    // ========================================================
    // 13. ÉXITO
    // ========================================================
    console.log("ESTRUCTURA DEL PROYECTO COMPLETADA", {
      proyecto: proyecto.id_proyecto,
      carpetaPrincipal: idCarpetaProyecto,
      documentacion: carpetaDocumentacion.id,
      animales: carpetaAnimales.id
    });
    return respuesta({
      mensaje: "Estructura de Google Drive del proyecto preparada correctamente.",
      id_proyecto: proyecto.id_proyecto,
      nombre_carpeta: nombreCarpetaProyecto,
      id_carpeta_drive: idCarpetaProyecto,
      recuperada: carpetaProyectoRecuperada,
      subcarpetas: {
        documentacion: {
          id: carpetaDocumentacion.id,
          nombre: carpetaDocumentacion.name
        },
        animales: {
          id: carpetaAnimales.id,
          nombre: carpetaAnimales.name
        }
      }
    }, 200);
  } catch (error) {
    console.error("ERROR FINAL crear-carpeta-proyecto", error);
    return respuesta({
      error: error instanceof Error ? error.message : "Error interno."
    }, 500);
  }
});
