// lib/facebook.js
// Publicación en la Página de Facebook (opcional). Más simple que IG: un solo POST.
import { GRAPH, getCredentials } from "./meta.js";

/**
 * Publica una foto con texto en la Página de Facebook.
 * @param {{imageUrl:string, caption:string}} post
 * @returns {Promise<string>} fbPostId
 */
export async function publishToFacebook({ imageUrl, caption }) {
  const { pageId, pageAccessToken } = await getCredentials();

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
