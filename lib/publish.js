// lib/publish.js
// Publica un documento de `scheduledPosts` usando las credenciales de su marca.
// Reutilizado por el cron y por el botón "Publicar ahora" del panel.
import { getBrandCredentials } from "./meta.js";
import { publishToInstagram } from "./instagram.js";
import { publishToFacebook } from "./facebook.js";
import { publishToPinterest } from "./pinterest.js";
import { getBrand } from "./brands.js";

/**
 * Publica un post (objeto ya leído de Firestore, con .brandId).
 * Pinterest no es fatal: si falla, el post queda publicado en IG/FB y el
 * detalle va en `pinError`.
 * @returns {Promise<{igMediaId?:string, fbPostId?:string, pinId?:string, pinError?:string}>}
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
  if (post.pinterest) {
    try {
      const brand = await getBrand(post.brandId);
      out.pinId = await publishToPinterest(post, brand);
    } catch (err) {
      out.pinError = String(err.message || err);
    }
  }
  return out;
}
