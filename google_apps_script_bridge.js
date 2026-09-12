/**
 * ==============================================================================
 * DCE MODS LOADER — PUENTE SEGURO DE SUBIDA A GOOGLE DRIVE (5TB PRO)
 * Desarrollado por DCE STUDIOS | https://dcegaming.netlify.app/
 * ==============================================================================
 * 
 * INSTRUCCIONES DE DESPLIEGUE EN 30 SEGUNDOS:
 * 1. Entra a: https://script.google.com con tu cuenta de Google (la que tiene los 5TB Pro).
 * 2. Haz clic en "+ Nuevo proyecto".
 * 3. Borra el código existente y pega TODO este archivo.
 * 4. Haz clic en "Implementar" (arriba a la derecha) -> "Nueva implementación".
 * 5. En el engranaje "Seleccionar tipo", elige "Aplicación web".
 * 6. Configura:
 *    - Descripción: "DCE Community Drive Bridge"
 *    - Ejecutar como: "Yo (tu_correo@gmail.com)"
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone)
 * 7. Haz clic en "Implementar" y autoriza los permisos de Drive cuando te lo pida.
 * 8. Copia la "URL de la aplicación web" (termina en /exec) y pégala en comunidad.js
 *    en la variable GOOGLE_DRIVE_BRIDGE_ENDPOINT.
 * ==============================================================================
 */

// IDs de tus carpetas compartidas de Google Drive:
const FOLDER_MODPACKS_ID = '1_kLN3bhFrm5zs196Bu6hXsZIqAWF9VHu';
const FOLDER_AUTOEXECS_ID = '1ugWPT7cHNk31mXHSTiCGE17Ub7cOkjVB';

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const type = postData.type || 'modpack'; // 'modpack' o 'autoexec'
    const fileName = postData.fileName || ('dce_' + Date.now() + (type === 'modpack' ? '.dcepack' : '.cfg'));
    const base64Data = postData.fileData;
    const mimeType = postData.mimeType || 'application/octet-stream';

    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No se recibieron datos de archivo.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Seleccionar carpeta de destino según el tipo de publicación
    const folderId = (type === 'modpack') ? FOLDER_MODPACKS_ID : FOLDER_AUTOEXECS_ID;
    const folder = DriveApp.getFolderById(folderId);

    // Decodificar Base64 y crear el archivo en Google Drive
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const file = folder.createFile(blob);

    // Asignar descripción con metadatos de autoría y versión
    const metaDesc = [
      "DCE MODS LOADER — Publicación Comunitaria",
      "Título: " + (postData.title || fileName),
      "Tipo: " + type.toUpperCase(),
      "Versión: " + (postData.version || "1.0.0"),
      "Categoría: " + (postData.category || "General"),
      "Autor: " + (postData.authorName || "Desconocido") + " (Steam ID: " + (postData.authorSteamId || "N/A") + ")",
      "Subido el: " + new Date().toISOString()
    ].join("\n");
    file.setDescription(metaDesc);

    // Configurar acceso público de solo lectura para descarga directa
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    // Enlace de descarga directa 100% inmediata sin intermediarios
    const directDownloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    const viewUrl = file.getUrl();

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      fileId: fileId,
      fileName: fileName,
      fileSize: file.getSize(),
      directDownloadUrl: directDownloadUrl,
      viewUrl: viewUrl,
      message: 'Archivo subido con éxito a tu carpeta de Google Drive.'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    service: 'DCE Community Drive Bridge (5TB Pro)',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
