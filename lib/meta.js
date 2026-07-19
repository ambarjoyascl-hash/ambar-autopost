// lib/meta.js
// Manejo de credenciales y tokens de Meta (Instagram + Facebook), POR MARCA.
// Las credenciales viven dentro de cada documento `brands/{id}.instagram`.
//
// instagram: {
//   igUserId, pageId, pageAccessToken, longLivedUserToken, tokenUpdatedAt,
//   postToFacebook
// }
import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v21.0"}`;

/**
 * Devuelve las credenciales de Instagram de una marca (sin redactar).
 * Lanza un Error legible si la marca no existe o no está conectada.
 */
export async function getBrandCredentials(brandId) {
  const brand = await getBrand(brandId);
  if (!brand) throw new Error(`Marca ${brandId} no encontrada.`);
  const ig = brand.instagram || {};
  if (!ig.igUserId || !ig.pageAccessToken) {
    throw new Error(
      `La marca "${brand.name}" no tiene Instagram conectado (falta igUserId o pageAccessToken).`
    );
  }
  return { brand, ...ig };
}

/**
 * Refresca el long-lived user token (60 días) de una marca y re-deriva el
 * page access token. El cron semanal lo llama para todas las marcas.
 */
export async function refreshBrandToken(brandId) {
  const brand = await getBrand(brandId);
  const ig = brand?.instagram || {};
  if (!ig.longLivedUserToken) {
    return { skipped: "sin longLivedUserToken" };
  }

  const exchangeUrl =
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${ig.longLivedUserToken}`;

  const exRes = await fetch(exchangeUrl);
  const exData = await exRes.json();
  if (!exRes.ok || !exData.access_token) {
    throw new Error(`Fallo refrescando user token: ${JSON.stringify(exData)}`);
  }
  const longLivedUserToken = exData.access_token;

  // Re-derivar el page access token (el derivado de un user token de larga
  // duración no expira, pero lo re-derivamos por las dudas).
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,access_token&access_token=${longLivedUserToken}`
  );
  const pagesData = await pagesRes.json();
  const page = pagesData.data?.find((p) => p.id === ig.pageId);
  const pageAccessToken = page?.access_token || ig.pageAccessToken;

  await db.collection("brands").doc(brandId).set(
    {
      instagram: { longLivedUserToken, pageAccessToken, tokenUpdatedAt: Date.now() },
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return { longLivedUserToken, pageAccessToken };
}

/**
 * Límite de publicación actual de una cuenta IG (25–100 / 24h).
 * @param {{igUserId:string, pageAccessToken:string}} creds
 */
export async function getPublishingLimit(creds) {
  const res = await fetch(
    `${GRAPH}/${creds.igUserId}/content_publishing_limit` +
      `?fields=quota_usage,rate_limit_settings&access_token=${creds.pageAccessToken}`
  );
  const data = await res.json();
  if (!res.ok) return null;
  return data.data?.[0] || null;
}

/**
 * Valida un conjunto de credenciales pegadas por el usuario en el panel,
 * consultando el nombre de la cuenta IG. Útil para el botón "Probar conexión".
 */
export async function testInstagramCredentials({ igUserId, pageAccessToken }) {
  if (!igUserId || !pageAccessToken) {
    return { ok: false, error: "Faltan igUserId o pageAccessToken." };
  }
  const res = await fetch(
    `${GRAPH}/${igUserId}?fields=username,name,followers_count&access_token=${pageAccessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error?.message || JSON.stringify(data) };
  }
  return { ok: true, username: data.username, followers: data.followers_count };
}

export { GRAPH };
