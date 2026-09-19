/**
 * ==============================================================================
 * DCE MODS LOADER — PUENTE SEGURO DE SUBIDA A GOOGLE DRIVE (5TB PRO)
 * Desarrollado por DCE STUDIOS | https://dcegaming.netlify.app/
 * ==============================================================================
 */

// IDs de tus carpetas compartidas de Google Drive:
const FOLDER_MODPACKS_ID = '1_kLN3bhFrm5zs196Bu6hXsZIqAWF9VHu';
const FOLDER_AUTOEXECS_ID = '1ugWPT7cHNk31mXHSTiCGE17Ub7cOkjVB';

// Función para obtener la carpeta por ID o crearla/usarla en tu propio Google Drive
function getTargetFolder(type) {
  const isModpack = (type === 'modpack');
  const targetId = isModpack ? FOLDER_MODPACKS_ID : FOLDER_AUTOEXECS_ID;
  const fallbackName = isModpack ? 'DCE_MODPACKS_5TB' : 'DCE_AUTOEXECS_5TB';

  // 1. Intentar por ID configurado
  if (targetId) {
    try {
      const folder = DriveApp.getFolderById(targetId);
      if (folder) {
        return folder;
      }
    } catch (err) {
      Logger.log("Aviso: No se pudo abrir carpeta por ID (" + targetId + "): " + err);
    }
  }

  // 2. Fallback: Buscar carpeta por nombre en tu Google Drive
  try {
    const existing = DriveApp.getFoldersByName(fallbackName);
    if (existing.hasNext()) {
      return existing.next();
    }
    return DriveApp.createFolder(fallbackName);
  } catch (err2) {
    Logger.log("Aviso: No se pudo crear carpeta por nombre, usando raíz: " + err2);
  }

  // 3. Fallback final: Raíz de tu Google Drive
  return DriveApp.getRootFolder();
}

/**
 * Función para ejecutar directamente en el editor de Apps Script.
 * Al darle a "Ejecutar", Google te pedirá los permisos necesarios de Drive si aún no los diste.
 */
function verificarAccesoYAutorizar() {
  Logger.log("=== INICIANDO VERIFICACIÓN DE PERMISOS DCE ===");
  try {
    const root = DriveApp.getRootFolder();
    Logger.log("✅ Acceso a Mi Unidad OK: " + root.getName());
  } catch (e) {
    Logger.log("❌ Error en Mi Unidad: " + e.toString());
  }

  try {
    const fMod = DriveApp.getFolderById(FOLDER_MODPACKS_ID);
    Logger.log("✅ Carpeta Modpacks encontrada: " + fMod.getName());
    const testFile = fMod.createFile("dce_test_verificacion.txt", "Prueba de permisos DCE ModLoader");
    Logger.log("✅ Escritura en Modpacks: EXITOSA");
    testFile.setTrashed(true);
    Logger.log("✅ Limpieza completada");
  } catch (e) {
    Logger.log("❌ Error en Carpeta Modpacks (" + FOLDER_MODPACKS_ID + "): " + e.toString());
  }

  try {
    const fAuto = DriveApp.getFolderById(FOLDER_AUTOEXECS_ID);
    Logger.log("✅ Carpeta Autoexecs encontrada: " + fAuto.getName());
    const testFile = fAuto.createFile("dce_test_verificacion.txt", "Prueba de permisos DCE ModLoader");
    Logger.log("✅ Escritura en Autoexecs: EXITOSA");
    testFile.setTrashed(true);
    Logger.log("✅ Limpieza completada");
  } catch (e) {
    Logger.log("❌ Error en Carpeta Autoexecs (" + FOLDER_AUTOEXECS_ID + "): " + e.toString());
  }

  Logger.log("=== VERIFICACIÓN TERMINADA ===");
}

/**
 * Manejador POST: Recibe archivo en base64 y lo guarda en Google Drive
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No se recibieron datos de archivo.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const postData = JSON.parse(e.postData.contents);

    // Si la solicitud es para eliminar un archivo de Google Drive
    if (postData.action === 'delete' || postData.action === 'trash') {
      const fileId = postData.fileId;
      if (!fileId) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No se recibió fileId para eliminar.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      try {
        const fileToDelete = DriveApp.getFileById(fileId);
        fileToDelete.setTrashed(true);
        Logger.log("✅ Archivo enviado a la papelera en Google Drive: " + fileId);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          fileId: fileId,
          message: 'Archivo eliminado de Google Drive correctamente.'
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (delErr) {
        Logger.log("⚠️ Error al eliminar archivo (" + fileId + "): " + delErr);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No se pudo eliminar el archivo de Google Drive: ' + delErr.toString()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const type = postData.type || postData.fileType || 'modpack';
    const fileName = postData.fileName || ('dce_' + Date.now() + (type === 'modpack' ? '.dcepack' : '.cfg'));
    const base64Data = postData.fileData;
    const mimeType = postData.mimeType || 'application/octet-stream';

    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No se recibieron datos binarios del archivo (base64Data vacío).'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Decodificar archivo
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

    // Obtener carpeta de destino
    let folder = getTargetFolder(type);
    let file = null;

    // Intentar crear archivo en la carpeta seleccionada
    try {
      file = folder.createFile(blob);
    } catch (createErr) {
      Logger.log("Error creando archivo en carpeta destino: " + createErr + ". Reintentando en Mi Unidad...");
      // Si la carpeta destino tiene restricciones, guardar en la raíz de tu Drive
      const rootFolder = DriveApp.getRootFolder();
      file = rootFolder.createFile(blob);
      folder = rootFolder;
    }

    const jsonMeta = JSON.stringify({
      title: postData.title || fileName,
      type: type,
      modpackMode: postData.modpackMode || (type === 'modpack' ? 'Normal' : ''),
      version: postData.version || "1.0.0",
      category: postData.category || "General",
      authorName: postData.authorName || "Comunidad DCE",
      authorSteamId: postData.authorSteamId || "N/A",
      authorSteamUrl: postData.authorSteamUrl || "",
      authorAvatar: postData.authorAvatar || ""
    });

    // Metadatos descriptivos
    const metaDesc = [
      "DCE MODS LOADER — Comunidad L4D2 Versus",
      "Título: " + (postData.title || fileName),
      "Tipo: " + String(type).toUpperCase(),
      "Versión: " + (postData.version || "1.0.0"),
      "Categoría: " + (postData.category || "General"),
      "Autor: " + (postData.authorName || "Comunidad DCE") + " (Steam: " + (postData.authorSteamId || "N/A") + ")",
      "Fecha: " + new Date().toISOString(),
      "JSON_META:" + jsonMeta
    ].join("\n");

    try {
      file.setDescription(metaDesc);
    } catch (descErr) {
      Logger.log("Aviso al poner descripción: " + descErr);
    }

    // Habilitar acceso público de descarga
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Aviso al configurar compartir: " + shareErr);
    }

    const fileId = file.getId();
    const directDownloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      fileId: fileId,
      fileName: fileName,
      fileSize: file.getSize(),
      directDownloadUrl: directDownloadUrl,
      viewUrl: file.getUrl(),
      folderName: folder.getName(),
      message: 'Archivo guardado exitosamente en tu Google Drive.'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString(),
      stack: (err.stack ? err.stack.toString() : 'N/A')
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Función auxiliar para listar publicaciones desde una carpeta de Google Drive
 */
function listFolderPublications(folder, defaultType) {
  const list = [];
  if (!folder) return list;
  try {
    const files = folder.getFiles();
    let count = 0;
    while (files.hasNext() && count < 80) {
      const f = files.next();
      if (f.isTrashed()) continue;
      count++;
      const fId = f.getId();
      const desc = f.getDescription() || '';

      let title = f.getName();
      let type = defaultType;
      let version = "1.0.0";
      let category = "General";
      let author = "Comunidad DCE";
      let authorSteamId = "";
      let authorSteamUrl = "";
      let authorAvatar = "";
      let modpackMode = (defaultType === 'modpack' ? 'Normal' : '');

      const lines = desc.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("JSON_META:")) {
          try {
            const j = JSON.parse(line.substring(10).trim());
            if (j.title) title = j.title;
            if (j.type) type = j.type;
            if (j.version) version = j.version;
            if (j.category) category = j.category;
            if (j.modpackMode) modpackMode = j.modpackMode;
            if (j.authorName) author = j.authorName;
            if (j.authorSteamId) authorSteamId = j.authorSteamId;
            if (j.authorSteamUrl) authorSteamUrl = j.authorSteamUrl;
            if (j.authorAvatar) authorAvatar = j.authorAvatar;
          } catch (e) {}
        } else if (line.startsWith("Título: ")) {
          title = line.substring(8).trim();
        } else if (line.startsWith("Versión: ")) {
          version = line.substring(9).trim();
        } else if (line.startsWith("Categoría: ")) {
          category = line.substring(11).trim();
        }
      }

      list.push({
        id: 'gdrive_' + fId,
        type: type,
        modpackMode: modpackMode,
        title: title,
        version: version,
        category: category,
        description: desc.split("JSON_META:")[0].trim(),
        authorName: author,
        authorSteamId: authorSteamId,
        authorSteamUrl: authorSteamUrl,
        authorAvatar: authorAvatar,
        fileName: f.getName(),
        fileSize: f.getSize(),
        driveDownloadUrl: "https://drive.google.com/uc?export=download&id=" + fId,
        driveFileId: fId,
        createdAt: f.getDateCreated().toISOString()
      });
    }
  } catch (err) {
    Logger.log("Error listando carpeta: " + err);
  }
  return list;
}

/**
 * Manejador GET: Lista publicaciones de la comunidad o ejecuta diagnóstico
 */
function doGet(e) {
  // Soporte de eliminación mediante GET
  if (e && e.parameter && (e.parameter.action === 'delete' || e.parameter.action === 'trash') && e.parameter.fileId) {
    try {
      const fileToDelete = DriveApp.getFileById(e.parameter.fileId);
      fileToDelete.setTrashed(true);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        fileId: e.parameter.fileId,
        message: 'Archivo eliminado de Google Drive correctamente.'
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (delErr) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Error al eliminar archivo: ' + delErr.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Diagnóstico explícito si se solicita
  if (e && e.parameter && e.parameter.action === 'diag') {
    const diag = {
      status: 'online',
      service: 'DCE Community Drive Bridge (5TB Pro)',
      timestamp: new Date().toISOString(),
      diagnostico: {}
    };

    try {
      const root = DriveApp.getRootFolder();
      diag.diagnostico.accesoDrive = "OK - Mi Unidad: " + root.getName();
    } catch (err) {
      diag.diagnostico.accesoDrive = "ERROR: " + err.toString();
    }

    try {
      const f1 = DriveApp.getFolderById(FOLDER_MODPACKS_ID);
      diag.diagnostico.carpetaModpacks = "OK - " + f1.getName();
    } catch (err) {
      diag.diagnostico.carpetaModpacks = "ERROR: " + err.toString();
    }

    try {
      const f2 = DriveApp.getFolderById(FOLDER_AUTOEXECS_ID);
      diag.diagnostico.carpetaAutoexecs = "OK - " + f2.getName();
    } catch (err) {
      diag.diagnostico.carpetaAutoexecs = "ERROR: " + err.toString();
    }

    return ContentService.createTextOutput(JSON.stringify(diag, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Por defecto (o con action=list): Devolver todas las publicaciones públicas de Google Drive
  try {
    const modpacks = listFolderPublications(getTargetFolder('modpack'), 'modpack');
    const autoexecs = listFolderPublications(getTargetFolder('autoexec'), 'autoexec');
    const combined = modpacks.concat(autoexecs);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      service: 'DCE Community Drive Bridge (5TB Pro)',
      count: combined.length,
      timestamp: new Date().toISOString(),
      publications: combined
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (listErr) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Error al listar publicaciones: ' + listErr.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
