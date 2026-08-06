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
 *
 * Facebook tampoco es fatal cuando Instagram ya salió: lo publicado en
 * Instagram no se puede "des-publicar", así que si acá se lanzara el error, el
 * cron devolvería el post a la cola y lo volvería a publicar en Instagram. Pasó
 * el 6-ago-2026 (faltaba `pages_manage_posts`) y por poco duplica un post.
 * @returns {Promise<{igMediaId?:string, fbPostId?:string, fbError?:string, pinId?:string, pinError?:string}>}
 */
export async function publishPost(post) {
  if (!post.brandId) throw new Error("El post no tiene brandId.");
  const creds = await getBrandCredentials(post.brandId);

  const out = {};
  if (post.platform === "instagram" || post.platform === "both") {
    out.igMediaId = await publishToInstagram(post, creds);
  }
  if (post.platform === "facebook" || post.platform === "both") {
    try {
      out.fbPostId = await publishToFacebook(post, creds);
    } catch (err) {
      // Si Facebook era el único destino, el post no salió a ninguna parte y el
      // fallo sí tiene que subir para que se reintente.
      if (!out.igMediaId) throw err;
      out.fbError = String(err.message || err);
    }
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
