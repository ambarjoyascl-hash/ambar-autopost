// lib/instagram.js
// Publicación en Instagram vía Meta Graph API (Content Publishing).
//
// El flujo de IG SIEMPRE es en dos fases:
//   1) Crear un "media container" (POST /{igUserId}/media) → devuelve un creation_id.
//   2) Publicar ese contenedor (POST /{igUserId}/media_publish) → devuelve el media id.
//
// Para imagen simple basta un contenedor. Para carrusel hay que crear un
// contenedor hijo por cada imagen (is_carousel_item=true) y luego un contenedor
// padre de tipo CAROUSEL que los agrupa.
//
// Meta descarga la imagen de forma asíncrona, así que entre crear y publicar
// conviene esperar a que el contenedor esté en estado FINISHED.
import { GRAPH, getCredentials } from "./meta.js";

// Cuántas veces y cada cuánto consultamos el estado del contenedor antes de publicar.
const STATUS_MAX_TRIES = 20;
const STATUS_DELAY_MS = 3000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Helper genérico para llamar a la Graph API y lanzar un Error legible si falla.
 */
async function graph(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`IG error: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Espera a que un media container quede en estado FINISHED.
 * Lanza un Error si Meta reporta ERROR o si se agota el tiempo.
 */
async function waitForContainer(creationId, token) {
  for (let i = 0; i < STATUS_MAX_TRIES; i++) {
    const data = await graph(
      `${creationId}?fields=status_code,status`,
      { token }
    );
    const code = data.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Contenedor en estado ${code}: ${data.status || ""}`);
    }
    // IN_PROGRESS / PUBLISHED → seguimos esperando.
    await sleep(STATUS_DELAY_MS);
  }
  throw new Error("Timeout esperando que el contenedor de IG quede FINISHED.");
}

/**
 * Crea un contenedor de imagen simple.
 * @returns {Promise<string>} creation_id
 */
async function createImageContainer({ igUserId, token, imageUrl, caption, altText }) {
  const body = { image_url: imageUrl };
  if (caption) body.caption = caption;
  if (altText) body.alt_text = altText;
  const data = await graph(`${igUserId}/media`, { method: "POST", token, body });
  return data.id;
}

/**
 * Crea un contenedor de carrusel (2–10 imágenes).
 * @returns {Promise<string>} creation_id del contenedor padre
 */
async function createCarouselContainer({ igUserId, token, imageUrls, caption }) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error("Un carrusel requiere entre 2 y 10 imágenes (imageUrls).");
  }

  // 1) Un contenedor hijo por imagen.
  const childIds = [];
  for (const url of imageUrls) {
    const child = await graph(`${igUserId}/media`, {
      method: "POST",
      token,
      body: { image_url: url, is_carousel_item: true },
    });
    await waitForContainer(child.id, token);
    childIds.push(child.id);
  }

  // 2) Contenedor padre que agrupa a los hijos.
  const parent = await graph(`${igUserId}/media`, {
    method: "POST",
    token,
    body: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: caption || "",
    },
  });
  return parent.id;
}

/**
 * Publica un post en Instagram.
 * @param {{type?:string, imageUrl?:string, imageUrls?:string[], caption?:string, altText?:string}} post
 * @returns {Promise<string>} igMediaId publicado
 */
export async function publishToInstagram(post) {
  const { igUserId, pageAccessToken } = await getCredentials();
  const token = pageAccessToken;

  let creationId;
  if (post.type === "carousel") {
    creationId = await createCarouselContainer({
      igUserId,
      token,
      imageUrls: post.imageUrls,
      caption: post.caption,
    });
  } else {
    if (!post.imageUrl) throw new Error("Falta imageUrl para publicar en Instagram.");
    creationId = await createImageContainer({
      igUserId,
      token,
      imageUrl: post.imageUrl,
      caption: post.caption,
      altText: post.altText,
    });
  }

  // Esperar a que Meta termine de procesar la(s) imagen(es).
  await waitForContainer(creationId, token);

  // Publicar el contenedor.
  const published = await graph(`${igUserId}/media_publish`, {
    method: "POST",
    token,
    body: { creation_id: creationId },
  });

  return published.id;
}
