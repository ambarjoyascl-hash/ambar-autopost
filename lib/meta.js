// lib/meta.js
// Manejo de credenciales y tokens de Meta. Guardadas en Firestore: meta/credentials.
import { db } from "./firebase-admin.js";

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v21.0"}`;

/**
 * Lee las credenciales guardadas en Firestore.
 * Doc esperado en meta/credentials:
 *   { igUserId, pageId, pageAccessToken, longLivedUserToken, tokenUpdatedAt }
 */
export async function getCredentials() {
  const snap = await db.doc("meta/credentials").get();
  if (!snap.exists) throw new Error("No existe meta/credentials en Firestore.");
  return snap.data();
}

/**
 * Refresca el long-lived user token (válido 60 días) re-intercambiándolo.
 * El page access token derivado de un long-lived user token no expira, pero
 * lo re-derivamos por las dudas. Llamar ~cada semana vía cron.
 */
export async function refreshLongLivedToken() {
  const creds = await getCredentials();

  // 1) Re-intercambiar el user token de larga duración.
  const exchangeUrl =
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${creds.longLivedUserToken}`;

  const exRes = await fetch(exchangeUrl);
  const exData = await exRes.json();
  if (!exRes.ok || !exData.access_token) {
    throw new Error(`Fallo refrescando user token: ${JSON.stringify(exData)}`);
  }
  const longLivedUserToken = exData.access_token;

  // 2) Re-derivar el page access token.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,access_token&access_token=${longLivedUserToken}`
  );
  const pagesData = await pagesRes.json();
  const page = pagesData.data?.find((p) => p.id === creds.pageId);
  const pageAccessToken = page?.access_token || creds.pageAccessToken;

  await db.doc("meta/credentials").set(
    {
      longLivedUserToken,
      pageAccessToken,
      tokenUpdatedAt: Date.now(),
    },
    { merge: true }
  );

  return { longLivedUserToken, pageAccessToken };
}

/**
 * Consulta el límite de publicación actual de la cuenta IG (de 25 a 100 / 24h).
 * Devuelve { quota_usage, config } o null si no se pudo leer.
 */
export async function getPublishingLimit() {
  const { igUserId, pageAccessToken } = await getCredentials();
  const res = await fetch(
    `${GRAPH}/${igUserId}/content_publishing_limit` +
      `?fields=quota_usage,rate_limit_settings&access_token=${pageAccessToken}`
  );
  const data = await res.json();
  if (!res.ok) return null;
  return data.data?.[0] || null;
}

export { GRAPH };
