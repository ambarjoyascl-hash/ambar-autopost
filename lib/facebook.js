// lib/facebook.js
// Publicación en la Página de Facebook. Dos caminos, según el tipo de post:
//   - Foto  → un solo POST a /{pageId}/photos.
//   - Reel  → la API /{pageId}/video_reels, que va en TRES fases (start, upload,
//             finish). No es la misma API que la de Instagram y no se puede
//             mezclar: un reel mandado a /photos devuelve un error de Meta que
//             no dice nada útil.
import { GRAPH } from "./meta.js";

// rupload es un host aparte, no graph.facebook.com. La versión tiene que ser la
// misma que usa GRAPH o Meta rechaza el video_id.
const GRAPH_VERSION = GRAPH.split("/").pop();
const RUPLOAD = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

// Facebook exige que un post programado quede al menos 10 minutos en el futuro
// (y como mucho a 75 días). Si mandamos menos, el finish falla con un error de
// validación y el video subido se pierde.
const MIN_ADELANTO_MS = 10 * 60 * 1000;
const MAX_ADELANTO_MS = 75 * 24 * 60 * 60 * 1000;

async function graphJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`FB error: ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Publica (o programa) un reel en la Página de Facebook.
 *
 * El video NO se sube byte a byte desde acá: se le pasa a Meta la URL pública y
 * Meta lo descarga. Es lo que permite que esto quepa en una función de 60 s,
 * porque el trabajo pesado ocurre del lado de ellos.
 *
 * @param {{videoUrl:string, caption?:string, scheduledPublishTime?:number}} post
 *        `scheduledPublishTime` en milisegundos (Date.now()). Si viene y está en
 *        el futuro, el reel queda PROGRAMADO en vez de salir al aire.
 * @param {{pageId:string, pageAccessToken:string}} creds
 * @returns {Promise<{videoId:string, programadoPara?:number}>}
 */
export async function publishReelToFacebook(
  { videoUrl, caption, scheduledPublishTime },
  { pageId, pageAccessToken }
) {
  if (!videoUrl) throw new Error("Falta videoUrl para publicar un reel en Facebook.");

  // La fecha se valida ANTES de empezar, no en la fase 3: si se valida al final,
  // Meta ya descargó y transcodificó el video para nada.
  if (scheduledPublishTime) {
    const adelanto = scheduledPublishTime - Date.now();
    if (adelanto < MIN_ADELANTO_MS) {
      throw new Error(
        "Facebook no programa un reel a menos de 10 minutos; usa publicación inmediata."
      );
    }
    if (adelanto > MAX_ADELANTO_MS) {
      throw new Error("Facebook no programa un reel a más de 75 días.");
    }
  }

  // ── Fase 1: pedir un video_id y la URL de subida ───────────────────────────
  const start = await graphJson(
    await fetch(`${GRAPH}/${pageId}/video_reels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({ upload_phase: "start" }),
    })
  );
  const videoId = start.video_id;
  const uploadUrl = start.upload_url || `${RUPLOAD}/${videoId}`;
  if (!videoId) throw new Error("Facebook no devolvió video_id en la fase start.");

  // ── Fase 2: decirle a Meta de dónde bajar el video ─────────────────────────
  // Ojo: acá el token va como `OAuth <token>`, no como `Bearer`. Es la única
  // llamada de todo Sincro que usa ese formato, y con Bearer devuelve 401.
  const subida = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageAccessToken}`,
      file_url: videoUrl,
    },
  });
  const subidaData = await subida.json().catch(() => ({}));
  if (!subida.ok || subidaData.success === false) {
    throw new Error(
      `FB error subiendo el reel: ${subidaData.error?.message || JSON.stringify(subidaData)}`
    );
  }

  // ── Fase 3: cerrar la subida, publicando o programando ─────────────────────
  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
  });
  if (caption) params.set("description", caption);

  let programadoPara;
  if (scheduledPublishTime) {
    params.set("video_state", "SCHEDULED");
    params.set("scheduled_publish_time", String(Math.floor(scheduledPublishTime / 1000)));
    programadoPara = scheduledPublishTime;
  } else {
    params.set("video_state", "PUBLISHED");
  }

  await graphJson(
    await fetch(`${GRAPH}/${pageId}/video_reels?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    })
  );

  return programadoPara ? { videoId, programadoPara } : { videoId };
}

/**
 * Publica un post en la Página de Facebook de una marca.
 * @param {{imageUrl?:string, videoUrl?:string, caption:string, type?:string, scheduledPublishTime?:number}} post
 * @param {{pageId:string, pageAccessToken:string}} creds credenciales de la marca
 * @returns {Promise<string>} fbPostId (o el video_id, en el caso de un reel)
 */
export async function publishToFacebook(post, creds) {
  const { pageId, pageAccessToken } = creds;
  const { imageUrl, caption, type } = post;

  if (["reel", "reels", "video"].includes(type) || (!imageUrl && post.videoUrl)) {
    const { videoId } = await publishReelToFacebook(post, creds);
    return videoId;
  }

  if (!imageUrl) throw new Error("Falta imageUrl para publicar la foto en Facebook.");

  const res = await fetch(`${GRAPH}/${pageId}/photos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify({ url: imageUrl, caption }),
  });
  const data = await graphJson(res);
  // photos devuelve post_id como "{pageId}_{postId}"
  return data.post_id || data.id;
}
