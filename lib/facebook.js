// lib/facebook.js
// Publicación en la Página de Facebook (opcional). Más simple que IG: un solo POST.
import { GRAPH } from "./meta.js";

/**
 * Publica una foto con texto en la Página de Facebook de una marca.
 * @param {{imageUrl:string, caption:string}} post
 * @param {{pageId:string, pageAccessToken:string}} creds credenciales de la marca
 * @returns {Promise<string>} fbPostId
 */
export async function publishToFacebook({ imageUrl, caption, type }, creds) {
  const { pageId, pageAccessToken } = creds;

  // Los reels de Facebook van por otra API (/video_reels, subida en 3 pasos) que
  // todavía no está implementada. Se avisa claro en vez de mandar un /photos sin
  // imagen, que devolvería un error de Meta imposible de interpretar. Como
  // publish.js no considera fatal un fallo de Facebook cuando Instagram ya salió,
  // el reel se publica igual en IG.
  if (["reel", "reels", "video"].includes(type) || !imageUrl) {
    throw new Error("Facebook aún no publica reels desde Sincro; el reel salió solo en Instagram.");
  }

  const res = await fetch(`${GRAPH}/${pageId}/photos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify({ url: imageUrl, caption }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`FB error: ${data.error?.message || JSON.stringify(data)}`);
  }
  // photos devuelve post_id como "{pageId}_{postId}"
  return data.post_id || data.id;
}
