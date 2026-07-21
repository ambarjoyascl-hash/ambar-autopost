// api/posts/index.js
// GET  /api/posts?brandId=...&status=...  → cola de posts de una marca
// POST /api/posts                          → crea un post manual en la cola
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { brandId, status } = req.query;
    if (!(await requireBrand(req, res, user, brandId))) return;
    const q = db.collection("scheduledPosts").where("brandId", "==", brandId);
    const snap = await q.get();
    let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (status) posts = posts.filter((p) => p.status === status);
    posts.sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
    return res.status(200).json({ posts });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (!(await requireBrand(req, res, user, body.brandId))) return;
    if (!body.imageUrl) return res.status(400).json({ error: "Falta imageUrl." });
    const now = Date.now();
    const doc = {
      brandId: body.brandId,
      platform: body.platform || "instagram",
      type: body.type || "image",
      imageUrl: body.imageUrl,
      imageUrls: body.imageUrls || null,
      caption: body.caption || "",
      altText: body.altText || "",
      scheduledFor: body.scheduledFor || now,
      status: "pending",
      source: "manual",
      igMediaId: null,
      fbPostId: null,
      error: null,
      createdAt: now,
    };
    const ref = await db.collection("scheduledPosts").add(doc);
    return res.status(201).json({ post: { id: ref.id, ...doc } });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
