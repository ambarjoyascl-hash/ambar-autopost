// api/emails/[id].js
// GET    /api/emails/:id  → email completo (incluye html y plainText)
// PUT    /api/emails/:id  → cambia estado (ej. {status:"sent"}) o edita campos
// DELETE /api/emails/:id  → elimina el email
import { checkAuth, readJson, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";

const EDITABLE = ["subject", "previewText", "status"];

export default withErrors(async function handler(req, res) {
  if (!(await checkAuth(req, res))) return;
  const { id } = req.query;
  const ref = db.collection("emails").doc(id);

  if (req.method === "GET") {
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Email no encontrado." });
    return res.status(200).json({ email: { id: snap.id, ...snap.data() } });
  }

  if (req.method === "PUT") {
    const body = await readJson(req);
    const patch = { updatedAt: Date.now() };
    for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return res.status(200).json({ email: { id: snap.id, ...snap.data() } });
  }

  if (req.method === "DELETE") {
    await ref.delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
