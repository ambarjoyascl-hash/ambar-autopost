// api/cron/publish.js
// Cron (cada 5 min): busca posts "pending" cuya hora ya llegó y los publica.
import { db } from "../../lib/firebase-admin.js";
import { publishToInstagram } from "../../lib/instagram.js";
import { publishToFacebook } from "../../lib/facebook.js";
import { getPublishingLimit } from "../../lib/meta.js";

function authorized(req) {
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });

  // Cortafuegos de rate limit: si la cuota IG está al tope, no intentamos.
  try {
    const limit = await getPublishingLimit();
    if (limit && limit.config && limit.quota_usage >= limit.config.quota_total) {
      return res.status(200).json({ skipped: "rate_limit_reached", limit });
    }
  } catch (_) {
    // si falla la lectura del límite, seguimos igual
  }

  const now = Date.now();
  const snap = await db
    .collection("scheduledPosts")
    .where("status", "==", "pending")
    .where("scheduledFor", "<=", now)
    .orderBy("scheduledFor")
    .limit(5)
    .get();

  const results = [];

  for (const doc of snap.docs) {
    const post = doc.data();
    // Lock optimista: marcamos "publishing" para evitar doble publicación.
    try {
      await doc.ref.update({ status: "publishing", lockedAt: now });
    } catch (_) {
      continue;
    }

    try {
      const update = { status: "published", publishedAt: Date.now(), error: null };

      if (post.platform === "instagram" || post.platform === "both") {
        update.igMediaId = await publishToInstagram(post);
      }
      if (post.platform === "facebook" || post.platform === "both") {
        update.fbPostId = await publishToFacebook(post);
      }

      await doc.ref.update(update);
      results.push({ id: doc.id, ok: true });
    } catch (err) {
      await doc.ref.update({ status: "error", error: String(err.message || err) });
      results.push({ id: doc.id, ok: false, error: String(err.message || err) });
    }
  }

  return res.status(200).json({ processed: results.length, results });
}
