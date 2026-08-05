// api/cron/[task].js
// Una sola función para ambas tareas programadas (límite de funciones del plan Hobby):
//   POST /api/cron/publish        (cada 5 min) publica los posts "pending" cuya hora llegó
//   POST /api/cron/refresh-token  (semanal)    refresca los tokens de Meta de todas las marcas
import { db } from "../../lib/firebase-admin.js";
import { publishPost } from "../../lib/publish.js";
import { getBrandCredentials, getPublishingLimit, refreshBrandToken } from "../../lib/meta.js";
import { refreshPinterestToken } from "../../lib/pinterest.js";
import { listBrands } from "../../lib/brands.js";
import { checkCron } from "../../lib/api-helpers.js";

export default async function handler(req, res) {
  if (!checkCron(req, res)) return;

  const { task } = req.query;
  if (task === "publish") return publishDue(res);
  if (task === "refresh-token") return refreshTokens(res);
  return res.status(404).json({ error: "Tarea desconocida." });
}

async function publishDue(res) {
  const now = Date.now();
  const snap = await db
    .collection("scheduledPosts")
    .where("status", "==", "pending")
    .where("scheduledFor", "<=", now)
    .orderBy("scheduledFor")
    .limit(10)
    .get();

  const results = [];
  const limitCache = new Map(); // brandId → ¿cuota agotada?

  for (const doc of snap.docs) {
    const post = doc.data();

    // Cortafuegos de rate limit por marca.
    try {
      if (!limitCache.has(post.brandId)) {
        const creds = await getBrandCredentials(post.brandId);
        const limit = await getPublishingLimit(creds);
        const reached =
          limit && limit.config && limit.quota_usage >= limit.config.quota_total;
        limitCache.set(post.brandId, !!reached);
      }
      if (limitCache.get(post.brandId)) {
        results.push({ id: doc.id, skipped: "rate_limit" });
        continue;
      }
    } catch (_) {
      // si no se pudo leer el límite, seguimos e intentamos publicar
    }

    // Lock optimista para evitar doble publicación.
    try {
      await doc.ref.update({ status: "publishing", lockedAt: now });
    } catch (_) {
      continue;
    }

    try {
      const out = await publishPost(post);
      await doc.ref.update({
        status: "published",
        publishedAt: Date.now(),
        error: out.pinError ? `Pinterest: ${out.pinError}` : null,
        igMediaId: out.igMediaId || null,
        fbPostId: out.fbPostId || null,
        pinId: out.pinId || null,
      });
      results.push({ id: doc.id, ok: true });
    } catch (err) {
      // Un fallo pasajero (token caído, cuota, red) NO debe quemar el post: se
      // deja en pending para reintentar cuando el problema se arregle. Solo se
      // marca error lo que no tiene arreglo solo, o lo que ya llegó demasiado
      // tarde como para publicarlo (un "solo por hoy" cinco días después, no).
      const msg = String(err.message || err);
      const pasajero =
        /access token|session has been invalidated|rate limit|too many|quota|timeout|ETIMEDOUT|ECONNRESET|fetch failed|socket|temporarily|\b5\d\d\b/i.test(msg);
      const intentos = (post.attempts || 0) + 1;
      const tardeMs = Date.now() - (post.scheduledFor || 0);
      const demasiadoTarde = tardeMs > 48 * 3600 * 1000;

      if (pasajero && !demasiadoTarde) {
        await doc.ref.update({
          status: "pending",
          attempts: intentos,
          error: msg,
          lastTriedAt: Date.now(),
        });
        results.push({ id: doc.id, retry: true, attempts: intentos, error: msg });
      } else {
        await doc.ref.update({
          status: "error",
          attempts: intentos,
          error: demasiadoTarde
            ? `No se pudo publicar dentro de las 48 h siguientes a su horario. Último fallo: ${msg}`
            : msg,
        });
        results.push({ id: doc.id, ok: false, error: msg });
      }
    }
  }

  return res.status(200).json({ processed: results.length, results });
}

async function refreshTokens(res) {
  // admin:true — el cron debe ver TODAS las marcas (multi-cliente).
  const brands = await listBrands({ redacted: false, admin: true });
  const results = [];
  for (const brand of brands) {
    if (brand.instagram?.longLivedUserToken) {
      try {
        await refreshBrandToken(brand.id);
        results.push({ brand: brand.name, meta: true });
      } catch (err) {
        results.push({ brand: brand.name, meta: false, error: String(err.message || err) });
      }
    }
    if (brand.pinterest?.refreshToken) {
      try {
        await refreshPinterestToken(brand.id);
        results.push({ brand: brand.name, pinterest: true });
      } catch (err) {
        results.push({ brand: brand.name, pinterest: false, error: String(err.message || err) });
      }
    }
  }
  return res.status(200).json({ ok: true, refreshedAt: Date.now(), results });
}
