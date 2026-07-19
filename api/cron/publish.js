// api/cron/publish.js
// Cron (cada 5 min): publica los posts "pending" cuya hora ya llegó, de TODAS
// las marcas. Cada post se publica con las credenciales de su propia marca.
import { db } from "../../lib/firebase-admin.js";
import { publishPost } from "../../lib/publish.js";
import { getBrandCredentials, getPublishingLimit } from "../../lib/meta.js";
import { checkCron } from "../../lib/api-helpers.js";

export default async function handler(req, res) {
  if (!checkCron(req, res)) return;

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
        error: null,
        igMediaId: out.igMediaId || null,
        fbPostId: out.fbPostId || null,
      });
      results.push({ id: doc.id, ok: true });
    } catch (err) {
      await doc.ref.update({ status: "error", error: String(err.message || err) });
      results.push({ id: doc.id, ok: false, error: String(err.message || err) });
    }
  }

  return res.status(200).json({ processed: results.length, results });
}
