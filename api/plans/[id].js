// api/plans/[id].js
// GET    /api/plans/:id   → el plan (borrador o agendado), con posts y emails
// POST   /api/plans/:id   → aprueba el borrador (Body: {action:"approve"})
// DELETE /api/plans/:id   → descarta el borrador
import { checkAuth, readJson, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";
import { approvePlan, discardPlan } from "../../lib/plan.js";

export default withErrors(async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const { id } = req.query;

  if (req.method === "GET") {
    const snap = await db.collection("plans").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Plan no encontrado." });
    return res.status(200).json({ plan: { id: snap.id, ...snap.data() } });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (body.action === "approve") {
      const result = await approvePlan(id);
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: "Acción no reconocida." });
  }

  if (req.method === "DELETE") {
    await discardPlan(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
