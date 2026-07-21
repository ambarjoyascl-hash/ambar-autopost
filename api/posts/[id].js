// api/posts/[id].js
// PUT    /api/posts/:id  → edita un post (caption, scheduledFor, status, ...)
// POST   /api/posts/:id  → {action:"publish"} publica ahora
// DELETE /api/posts/:id  → elimina el post de la cola
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";
import { publishPost } from "../../lib/publish.js";

const EDITABLE = ["caption", "altText", "imageUrl", "scheduledFor", "platform", "status"];

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;
  const { id } = req.query;
  const ref = db.collection("scheduledPosts").doc(id);

  const existing = await ref.get();
  if (!existing.exists) return res.status(404).json({ error: "Post no encontrado." });
  if (!(await requireBrand(req, res, user, existing.data().brandId))) return;

  if (req.method === "PUT") {
    const body = await readJson(req);
    const patch = { updatedAt: Date.now() };
    for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return res.status(200).json({ post: { id: snap.id, ...snap.data() } });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (body.action !== "publish") return res.status(400).json({ error: "Acción no reconocida." });
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Post no encontrado." });
    const post = { id: snap.id, ...snap.data() };
    try {
      await ref.update({ status: "publishing", lockedAt: Date.now() });
      const out = await publishPost(post);
      await ref.update({
        status: "published",
        publishedAt: Date.now(),
        error: null,
        igMediaId: out.igMediaId || null,
        fbPostId: out.fbPostId || null,
      });
      return res.status(200).json({ ok: true, ...out });
    } catch (err) {
      await ref.update({ status: "error", error: String(err.message || err) });
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
  }

  if (req.method === "DELETE") {
    await ref.delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
