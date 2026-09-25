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
// ESCAPAR VALORES PARA CONSULTAS DE GOOGLE DRIVE
// ============================================================
// Escapa \ y comillas simples antes de usar el valor en la consulta "q" de la API de Drive (evita búsquedas mal formadas o inyectadas).
function escaparDrive(valor) {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
// ============================================================
// OBTENER ACCESS TOKEN DE GOOGLE
// ============================================================
async function obtenerGoogleAccessToken(clientId, clientSecret, refreshToken) {
  // OAuth 2.0: el refresh token guardado como secreto se canjea por un access token de corta duración para llamar a Drive.
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error("Error OAuth Google:", {
      status: response.status,
      respuesta: data
    });
    throw new Error(`No fue posible autenticar con Google Drive: ${data?.error_description ?? data?.error ?? "error desconocido"}`);
  }
  return data.access_token;
}
// ============================================================
// BUSCAR SUBCARPETA MEDIANTE appProperties
// ============================================================
async function buscarCarpeta(accessToken, parentId, propertyKey, propertyValue) {
  const parent = escaparDrive(parentId.trim());
  const key = escaparDrive(propertyKey);
  const value = escaparDrive(propertyValue);
  const consulta = [
    `'${parent}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    `appProperties has { key='${key}' and value='${value}' }`
  ].join(" and ");
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", consulta);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "10");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Error buscando carpeta Drive:", {
      status: response.status,
      consulta: consulta,
      respuesta: data
    });
    throw new Error(`Google Drive respondió ${response.status}: ${data?.error?.message ?? "No fue posible consultar la carpeta."}`);
  }
  if (Array.isArray(data.files) && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}
// ============================================================
// CREAR SUBCARPETA
// ============================================================
async function crearCarpeta(accessToken, parentId, nombre, appProperties) {
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      parents: [
        parentId.trim()
      ],
      appProperties: appProperties
    })
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error("Error creando carpeta Drive:", {
      status: response.status,
      respuesta: data
    });
    throw new Error(`No fue posible crear la carpeta "${nombre}" en Google Drive.`);
  }
  return data;
}
// ============================================================
// OBTENER O CREAR SUBCARPETA
// ============================================================
async function obtenerOCrearSubcarpeta(accessToken, parentId, nombre, propertyKey, propertyValue, appPropertiesExtra = {}) {
  const existente = await buscarCarpeta(accessToken, parentId, propertyKey, propertyValue);
  if (existente) {
    return existente;
  }
  return await crearCarpeta(accessToken, parentId, nombre, {
    ...appPropertiesExtra,
    [propertyKey]: propertyValue
  });
}
// ============================================================
// SUBIR ARCHIVO A GOOGLE DRIVE
//
// Utilizamos multipart/related:
// 1. Metadata JSON
// 2. Contenido binario
// ============================================================
async function subirArchivoGoogleDrive(accessToken, carpetaId, archivo, nombreDrive, appProperties) {
  const boundary = `-------amor4patas${crypto.randomUUID()}`;
  const metadata = {
    name: nombreDrive,
    parents: [
      carpetaId.trim()
    ],
    appProperties: appProperties
  };
  const metadataParte = new TextEncoder().encode(`--${boundary}\r\n` + `Content-Type: application/json; charset=UTF-8\r\n\r\n` + `${JSON.stringify(metadata)}\r\n` + `--${boundary}\r\n` + `Content-Type: ${archivo.type || "application/octet-stream"}\r\n\r\n`);
  const archivoBytes = new Uint8Array(await archivo.arrayBuffer());
  const cierre = new TextEncoder().encode(`\r\n--${boundary}--`);
  const cuerpo = new Uint8Array(metadataParte.length + archivoBytes.length + cierre.length);
  cuerpo.set(metadataParte, 0);
  cuerpo.set(archivoBytes, metadataParte.length);
  cuerpo.set(cierre, metadataParte.length + archivoBytes.length);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: cuerpo
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error("Error subiendo archivo Drive:", {
      status: response.status,
      respuesta: data
    });
    throw new Error(`Google Drive rechazó el archivo: ${data?.error?.message ?? "error desconocido"}`);
  }
  return data;
}
// ============================================================
// ELIMINAR ARCHIVO DE DRIVE
//
// Se utiliza como compensación si la BD falla después
// de haber creado el archivo en Google Drive.
// ============================================================
async function eliminarArchivoDrive(accessToken, fileId) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      const texto = await response.text();
      console.error("No fue posible eliminar archivo huérfano de Drive:", {
        fileId,
        status: response.status,
        respuesta: texto
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error intentando compensar archivo Drive:", error);
    return false;
  }
}
// ============================================================
// TIPO REAL DEL DOCUMENTO DE ESTERILIZACIÓN (firma del contenido)
// No se confía en la extensión ni en el tipo declarado.
// ============================================================
function detectarTipoDocumento(b) {
  const es = (offset, bytes)=>bytes.every((v, i)=>b[offset + i] === v);
  if (es(0, [
    0x25,
    0x50,
    0x44,
    0x46,
    0x2d
  ])) return {
    mime: "application/pdf",
    extension: ".pdf"
  };
  if (es(0, [
    0xff,
    0xd8,
    0xff
  ])) return {
    mime: "image/jpeg",
    extension: ".jpg"
  };
  if (es(0, [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
  ])) return {
    mime: "image/png",
    extension: ".png"
  };
  if (es(0, [
    0x52,
    0x49,
    0x46,
    0x46
  ]) && es(8, [
    0x57,
    0x45,
    0x42,
    0x50
  ])) return {
    mime: "image/webp",
    extension: ".webp"
  };
  return null;
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
  if (req.method !== "POST") {
    return respuesta({
      error: "Método no permitido."
    }, 405);
  }
  try {
    // ========================================================
    // 2. VARIABLES DE ENTORNO
    // ========================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    // Secretos: existen solo en el servidor (variables de la Edge Function) y nunca se envían al navegador.
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
    const carpetaFundacionId = Deno.env.get("GOOGLE_DRIVE_FUNDACION_FOLDER_ID")?.trim();
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !googleClientId || !googleClientSecret || !googleRefreshToken || !carpetaFundacionId) {
      throw new Error("Faltan variables de entorno requeridas.");
    }
    // ========================================================
    // 3. AUTENTICACIÓN SUPABASE
    // ========================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respuesta({
        error: "No se encontró una sesión válida."
      }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // Cliente "como la usuaria": reenvía su JWT, por lo que sus consultas respetan RLS.
    const supabaseUsuario = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Valida el JWT contra Supabase Auth (firma y vigencia); sin sesión válida se responde 401.
    const { data: { user }, error: authError } = await supabaseUsuario.auth.getUser(token);
    if (authError || !user) {
      return respuesta({
        error: "Sesión inválida o expirada."
      }, 401);
    }
    // ========================================================
    // 4. VERIFICAR USUARIO ACTIVO
    // ========================================================
    const { data: usuario, error: usuarioError } = await supabaseUsuario.from("usuario").select("id_usuario, activo").eq("id_usuario", user.id).single();
    if (usuarioError || !usuario || !usuario.activo) {
      return respuesta({
        error: "Usuario no autorizado o inactivo."
      }, 403);
    }
    // ========================================================
    // 5. CLIENTE ADMIN INTERNO
    // ========================================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    // ========================================================
    // 6. LEER FormData
    // ========================================================
    let formData;
    try {
      formData = await req.formData();
    } catch  {
      return respuesta({
        error: "La solicitud debe enviarse como multipart/form-data."
      }, 400);
    }
    const archivo = formData.get("archivo");
    const idCategoria = Number(formData.get("id_categoria_archivo"));
    const tipoContexto = String(formData.get("tipo_contexto") ?? "").trim().toLowerCase();
    const contextoRaw = formData.get("id_contexto");
    const idContexto = contextoRaw === null || String(contextoRaw).trim() === "" ? null : Number(contextoRaw);
    const fechaDocumentoRaw = String(formData.get("fecha_documento") ?? "").trim();
    const fechaDocumento = fechaDocumentoRaw === "" ? null : fechaDocumentoRaw;
    const descripcionRaw = String(formData.get("descripcion") ?? "").trim();
    const descripcion = descripcionRaw === "" ? null : descripcionRaw;
    // ========================================================
    // 7. VALIDACIONES
    // ========================================================
    if (!(archivo instanceof File)) {
      return respuesta({
        error: "Debe adjuntarse un archivo."
      }, 400);
    }
    if (archivo.size <= 0) {
      return respuesta({
        error: "El archivo está vacío."
      }, 400);
    }
    // Límite inicial razonable para documentos del MVP:
    // 10 MB.
    //
    // Esto puede ajustarse posteriormente.
    const MAX_ARCHIVO = 10 * 1024 * 1024;
    if (archivo.size > MAX_ARCHIVO) {
      return respuesta({
        error: "El archivo supera el límite de 10 MB."
      }, 400);
    }
    if (!Number.isInteger(idCategoria) || idCategoria <= 0) {
      return respuesta({
        error: "id_categoria_archivo no válido."
      }, 400);
    }
    const contextosValidos = [
      "animal",
      "adopcion",
      "gasto",
      "proyecto",
      "esterilizacion",
      "fundacion"
    ];
    if (!contextosValidos.includes(tipoContexto)) {
      return respuesta({
        error: "Tipo de contexto de archivo no válido."
      }, 400);
    }
    if (tipoContexto !== "fundacion" && (idContexto === null || !Number.isInteger(idContexto) || idContexto <= 0)) {
      return respuesta({
        error: "Debe indicarse un id_contexto válido."
      }, 400);
    }
    if (fechaDocumento !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDocumento)) {
      return respuesta({
        error: "fecha_documento debe utilizar formato YYYY-MM-DD."
      }, 400);
    }
    // ========================================================
    // 8. VALIDAR CATEGORÍA
    // ========================================================
    const { data: categoria, error: categoriaError } = await supabaseAdmin.from("categoria_archivo").select("id_categoria_archivo, nombre, activo").eq("id_categoria_archivo", idCategoria).single();
    if (categoriaError || !categoria || !categoria.activo) {
      return respuesta({
        error: "La categoría de archivo no existe o está inactiva."
      }, 400);
    }
    // ========================================================
    // 8.1 DOCUMENTO DE ESTERILIZACIÓN (2026-09-23)
    //
    // Documento principal único por animal de esterilización:
    //   - tipo real verificado por contenido (PDF, JPG, PNG o WebP);
    //   - rechazo anticipado si ya existe un documento (409);
    //   - la unicidad definitiva la garantiza el índice
    //     uq_esterilizacion_archivo_documento (carreras simultáneas),
    //     con compensación en Drive si registrar_archivo falla.
    // ========================================================
    let archivoFinal = archivo;
    let extensionFinal = null;
    if (tipoContexto === "esterilizacion") {
      const tipo = detectarTipoDocumento(new Uint8Array(await archivo.slice(0, 12).arrayBuffer()));
      if (!tipo) {
        return respuesta({
          error: "El documento de esterilización debe ser PDF, JPG, PNG o WebP."
        }, 400);
      }
      archivoFinal = new File([
        archivo
      ], archivo.name, {
        type: tipo.mime
      });
      extensionFinal = tipo.extension;
      const { count: documentosPrevios, error: previosError } = await supabaseAdmin.from("esterilizacion_archivo").select("id_esterilizacion_archivo", {
        count: "exact",
        head: true
      }).eq("id_animal_esterilizacion", idContexto);
      if (previosError) {
        throw new Error("No fue posible verificar los documentos existentes.");
      }
      if ((documentosPrevios ?? 0) > 0) {
        return respuesta({
          error: "Esta esterilización ya tiene un documento registrado."
        }, 409);
      }
    }
    // ========================================================
    // 9. TOKEN GOOGLE
    // ========================================================
    const accessToken = await obtenerGoogleAccessToken(googleClientId, googleClientSecret, googleRefreshToken);
    // ========================================================
    // 10. RESOLVER CARPETA DESTINO
    // ========================================================
    let carpetaDestino = null;
    let nombreDrive = archivo.name;
    // ========================================================
    // CONTEXTO: ANIMAL
    // ========================================================
    if (tipoContexto === "animal") {
      const { data: animal, error: animalError } = await supabaseAdmin.from("animal").select("id_animal, nombre, id_carpeta_drive, activo").eq("id_animal", idContexto).single();
      if (animalError || !animal) {
        return respuesta({
          error: "El animal indicado no existe."
        }, 404);
      }
      if (!animal.id_carpeta_drive) {
        return respuesta({
          error: "El animal todavía no posee una carpeta de Google Drive."
        }, 409);
      }
      carpetaDestino = animal.id_carpeta_drive.trim();
    } else if (tipoContexto === "adopcion") {
      const { data: adopcion, error: adopcionError } = await supabaseAdmin.from("adopcion").select("id_adopcion, id_animal").eq("id_adopcion", idContexto).single();
      if (adopcionError || !adopcion) {
        return respuesta({
          error: "La adopción indicada no existe."
        }, 404);
      }
      const { data: animal, error: animalError } = await supabaseAdmin.from("animal").select("id_animal, id_carpeta_drive").eq("id_animal", adopcion.id_animal).single();
      if (animalError || !animal) {
        return respuesta({
          error: "No fue posible localizar el animal asociado a la adopción."
        }, 404);
      }
      if (!animal.id_carpeta_drive) {
        return respuesta({
          error: "El animal de la adopción todavía no posee una carpeta de Google Drive."
        }, 409);
      }
      carpetaDestino = animal.id_carpeta_drive.trim();
    } else if (tipoContexto === "gasto") {
      const { data: gasto, error: gastoError } = await supabaseAdmin.from("gasto").select("id_gasto").eq("id_gasto", idContexto).single();
      if (gastoError || !gasto) {
        return respuesta({
          error: "El gasto indicado no existe."
        }, 404);
      }
      const carpetaGastos = await obtenerOCrearSubcarpeta(accessToken, carpetaFundacionId, "Gastos", "tipo_carpeta", "gastos", {
        tipo: "documentacion_fundacion"
      });
      carpetaDestino = carpetaGastos.id;
    } else if (tipoContexto === "proyecto") {
      const { data: proyecto, error: proyectoError } = await supabaseAdmin.from("proyecto_esterilizacion").select("id_proyecto, nombre, id_carpeta_drive").eq("id_proyecto", idContexto).single();
      if (proyectoError || !proyecto) {
        return respuesta({
          error: "El proyecto indicado no existe."
        }, 404);
      }
      if (!proyecto.id_carpeta_drive) {
        return respuesta({
          error: "El proyecto todavía no posee una carpeta de Google Drive."
        }, 409);
      }
      const carpetaDocumentacion = await obtenerOCrearSubcarpeta(accessToken, proyecto.id_carpeta_drive, "Documentación", "tipo_carpeta", "documentacion", {
        proyecto_id: String(proyecto.id_proyecto)
      });
      carpetaDestino = carpetaDocumentacion.id;
    } else if (tipoContexto === "esterilizacion") {
      const { data: animalEsterilizacion, error: animalEsterilizacionError } = await supabaseAdmin.from("animal_esterilizacion").select("id_animal_esterilizacion, id_proyecto, codigo").eq("id_animal_esterilizacion", idContexto).single();
      if (animalEsterilizacionError || !animalEsterilizacion) {
        return respuesta({
          error: "El animal de esterilización indicado no existe."
        }, 404);
      }
      const { data: proyecto, error: proyectoError } = await supabaseAdmin.from("proyecto_esterilizacion").select("id_proyecto, id_carpeta_drive").eq("id_proyecto", animalEsterilizacion.id_proyecto).single();
      if (proyectoError || !proyecto) {
        return respuesta({
          error: "No fue posible localizar el proyecto de esterilización."
        }, 404);
      }
      if (!proyecto.id_carpeta_drive) {
        return respuesta({
          error: "El proyecto todavía no posee una carpeta de Google Drive."
        }, 409);
      }
      const carpetaAnimales = await obtenerOCrearSubcarpeta(accessToken, proyecto.id_carpeta_drive, "Animales", "tipo_carpeta", "animales", {
        proyecto_id: String(proyecto.id_proyecto)
      });
      carpetaDestino = carpetaAnimales.id;
      // ------------------------------------------------------
      // El código identifica al animal dentro del proyecto.
      // La extensión corresponde al tipo real detectado.
      // ------------------------------------------------------
      nombreDrive = `${animalEsterilizacion.codigo}${extensionFinal}`;
    } else if (tipoContexto === "fundacion") {
      carpetaDestino = carpetaFundacionId;
    }
    // ========================================================
    // 11. SEGURIDAD FINAL DE DESTINO
    // ========================================================
    if (!carpetaDestino) {
      throw new Error("No fue posible determinar la carpeta de destino.");
    }
    // ========================================================
    // 12. SUBIR A GOOGLE DRIVE
    // ========================================================
    const archivoDrive = await subirArchivoGoogleDrive(accessToken, carpetaDestino, archivoFinal, nombreDrive, {
      tipo_contexto: tipoContexto,
      id_contexto: idContexto === null ? "fundacion" : String(idContexto)
    });
    // ========================================================
    // 13. REGISTRAR ARCHIVO EN POSTGRESQL
    // ========================================================
    const { data: idArchivo, error: registrarError } = await supabaseUsuario.rpc("registrar_archivo", {
      p_id_categoria_archivo: idCategoria,
      p_nombre_archivo: archivoDrive.name,
      p_nombre_original: archivo.name,
      p_mime_type: archivoFinal.type || "application/octet-stream",
      p_id_externo: archivoDrive.id,
      p_fecha_documento: fechaDocumento,
      p_descripcion: descripcion,
      p_tipo_contexto: tipoContexto,
      p_id_contexto: idContexto
    });
    // ========================================================
    // 14. COMPENSACIÓN SI POSTGRESQL FALLA
    // ========================================================
    if (registrarError) {
      console.error("Error registrar_archivo:", registrarError);
      const eliminado = await eliminarArchivoDrive(accessToken, archivoDrive.id);
      // Carrera con otra carga simultánea: el índice único rechazó el segundo documento.
      if (tipoContexto === "esterilizacion" && registrarError.code === "23505") {
        return respuesta({
          error: "Esta esterilización ya tiene un documento registrado.",
          archivo_drive_eliminado: eliminado
        }, 409);
      }
      return respuesta({
        error: "El archivo se alcanzó a subir a Google Drive, pero no pudo registrarse en la base de datos.",
        detalle: registrarError.message,
        archivo_drive_eliminado: eliminado
      }, 500);
    }
    // ========================================================
    // 15. ÉXITO
    // ========================================================
    return respuesta({
      mensaje: "Archivo subido y registrado correctamente.",
      id_archivo: idArchivo,
      archivo: {
        id_externo: archivoDrive.id,
        nombre: archivoDrive.name,
        nombre_original: archivo.name,
        mime_type: archivoFinal.type || "application/octet-stream",
        tamaño: archivo.size
      },
      contexto: {
        tipo: tipoContexto,
        id: idContexto
      }
    }, 201);
  } catch (error) {
    console.error("ERROR subir-archivo-drive:", error);
    return respuesta({
      error: error instanceof Error ? error.message : "Error interno."
    }, 500);
  }
});
