// lib/blob-upload.js
// Subidas de fotos/videos a Vercel Blob.
//
// El navegador NO manda el archivo a nuestra función serverless (el body de una
// función tiene tope de 4.5 MB y aquí aceptamos hasta 100 MB): pide una URL
// prefirmada y hace el PUT directo contra Vercel Blob. La URL viene acotada a
// una ruta, un tipo de archivo y un tamaño máximo, así que no sirve para subir
// cualquier cosa a cualquier parte.
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { readJson, requireBrand } from "./api-helpers.js";

/** Tope por archivo; el frontend valida lo mismo antes de pedir la URL. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** La URL prefirmada dura lo justo para subir un archivo grande. */
const URL_TTL_MS = 30 * 60 * 1000;

/** Deja el nombre en algo seguro para una ruta, conservando la extensión. */
function safeName(name) {
  const clean = String(name || "archivo")
    .split(/[\\/]/)
    .pop()
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120);
  return clean || "archivo";
}

/**
 * POST /api/brands/upload  → { presignedUrl, pathname }
 * Body: { brandId, filename, contentType, size }
 *
 * Vive dentro de api/brands/[id].js (id reservado "upload") para no gastar otra
 * función del plan Hobby, igual que "test" y los flujos de OAuth.
 */
export async function handleUploadPresign(req, res, user) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  const { brandId, filename, contentType, size } = await readJson(req);

  const brand = await requireBrand(req, res, user, brandId);
  if (!brand) return;

  const type = String(contentType || "");
  if (!/^(image|video)\//.test(type)) {
    return res.status(400).json({ error: "Solo se aceptan imágenes o videos." });
  }

  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return res.status(400).json({ error: "Falta el tamaño del archivo." });
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "El archivo supera los 100 MB." });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: "Falta BLOB_READ_WRITE_TOKEN. Conecta un store de Vercel Blob al proyecto.",
    });
  }

  // La ruta lleva el uid del dueño y la marca: cada usuario escribe solo en lo suyo.
  const pathname = `uploads/${user.uid}/${brand.id}/${safeName(filename)}`;
  const constraints = {
    allowedContentTypes: [type],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
  };

  const signed = await issueSignedToken({
    pathname,
    operations: ["put"],
    validUntil: Date.now() + URL_TTL_MS,
    ...constraints,
  });

  const { presignedUrl } = await presignUrl(signed, {
    operation: "put",
    pathname,
    access: "public",
    // Dos archivos con el mismo nombre no se pisan entre sí.
    addRandomSuffix: true,
    ...constraints,
  });

  return res.status(200).json({ presignedUrl, pathname });
}
