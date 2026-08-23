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
// Los reels usan el mismo flujo de dos fases, pero con media_type=REELS y
// video_url en vez de image_url. La diferencia práctica es el tiempo: Meta tiene
// que descargar y transcodificar el video, así que el contenedor tarda minutos
// en quedar FINISHED, no segundos.
//
// Meta descarga la imagen de forma asíncrona, así que entre crear y publicar
// conviene esperar a que el contenedor esté en estado FINISHED.
import { GRAPH } from "./meta.js";

// Cuántas veces y cada cuánto consultamos el estado del contenedor antes de publicar.
const STATUS_MAX_TRIES = 20;
const STATUS_DELAY_MS = 3000;

// El video tarda más: Meta lo descarga y lo transcodifica. Pero la función del
// cron muere a los 60 s (vercel.json), así que el presupuesto de espera es ~45 s,
// no "lo que haga falta". Para reels cortos (15-30 s, pocos MB) sobra.
//
// Si un video tardara más que eso, el post NO se pierde ni se duplica: queda en
// `pending` por timeout —que el cron trata como fallo pasajero— y en la pasada
// siguiente se crea un contenedor nuevo. Crear contenedores no publica nada, así
// que reintentar es inofensivo; solo se desperdicia el anterior.
const VIDEO_STATUS_MAX_TRIES = 15;
const VIDEO_STATUS_DELAY_MS = 3000;

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
async function waitForContainer(creationId, token, opts = {}) {
  const maxTries = opts.maxTries || STATUS_MAX_TRIES;
  const delayMs = opts.delayMs || STATUS_DELAY_MS;
  for (let i = 0; i < maxTries; i++) {
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
    await sleep(delayMs);
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
 * Crea un contenedor de reel (video vertical).
 *
 * `share_to_feed` deja el reel también en la grilla del perfil; sin eso el reel
 * solo vive en la pestaña de Reels y el perfil se ve vacío.
 * @returns {Promise<string>} creation_id
 */
async function createReelContainer({ igUserId, token, videoUrl, caption, coverUrl, shareToFeed }) {
  const body = { media_type: "REELS", video_url: videoUrl };
  if (caption) body.caption = caption;
  if (coverUrl) body.cover_url = coverUrl;
  body.share_to_feed = shareToFeed === false ? false : true;
  const data = await graph(`${igUserId}/media`, { method: "POST", token, body });
  return data.id;
}

/**
 * Publica un post en Instagram con las credenciales de una marca.
 * @param {{type?:string, imageUrl?:string, imageUrls?:string[], videoUrl?:string, coverUrl?:string, shareToFeed?:boolean, caption?:string, altText?:string}} post
 * @param {{igUserId:string, pageAccessToken:string}} creds credenciales de la marca
 * @returns {Promise<string>} igMediaId publicado
 */
export async function publishToInstagram(post, creds) {
  const { igUserId, pageAccessToken } = creds;
  const token = pageAccessToken;

  const esReel = post.type === "reel" || post.type === "reels" || post.type === "video";

  let creationId;
  if (esReel) {
    if (!post.videoUrl) throw new Error("Falta videoUrl para publicar un reel.");
    creationId = await createReelContainer({
      igUserId,
      token,
      videoUrl: post.videoUrl,
      caption: post.caption,
      coverUrl: post.coverUrl,
      shareToFeed: post.shareToFeed,
    });
  } else if (post.type === "carousel") {
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

  // Esperar a que Meta termine de procesar la(s) imagen(es) o el video.
  await waitForContainer(
    creationId,
    token,
    esReel ? { maxTries: VIDEO_STATUS_MAX_TRIES, delayMs: VIDEO_STATUS_DELAY_MS } : {}
  );

  // Publicar el contenedor.
  const published = await graph(`${igUserId}/media_publish`, {
    method: "POST",
    token,
    body: { creation_id: creationId },
  });

  return published.id;
}
