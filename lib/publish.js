// lib/publish.js
// Publica un documento de `scheduledPosts` usando las credenciales de su marca.
// Reutilizado por el cron y por el botón "Publicar ahora" del panel.
import { getBrandCredentials } from "./meta.js";
import { publishToInstagram } from "./instagram.js";
import { publishToFacebook } from "./facebook.js";

/**
 * Publica un post (objeto ya leído de Firestore, con .brandId).
 * @returns {Promise<{igMediaId?:string, fbPostId?:string}>}
 */
export async function publishPost(post) {
  if (!post.brandId) throw new Error("El post no tiene brandId.");
  const creds = await getBrandCredentials(post.brandId);

  const out = {};
  if (post.platform === "instagram" || post.platform === "both") {
    out.igMediaId = await publishToInstagram(post, creds);
  }
  if (post.platform === "facebook" || post.platform === "both") {
    out.fbPostId = await publishToFacebook(post, creds);
  }
  return out;
}
