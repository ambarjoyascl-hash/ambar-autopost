// api/emails/index.js
// GET /api/emails?brandId=...&status=...  → emails generados de una marca
// (el HTML completo se pide en /api/emails/:id para no inflar la lista)
import { checkAuth, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";

export default withErrors(async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const { brandId, status } = req.query;
  let q = db.collection("emails");
  if (brandId) q = q.where("brandId", "==", brandId);
  const snap = await q.get();
  let emails = snap.docs.map((d) => {
    const { html, plainText, ...rest } = d.data();
    return { id: d.id, ...rest }; // omitimos el HTML pesado en la lista
  });
  if (status) emails = emails.filter((e) => e.status === status);
  emails.sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
  return res.status(200).json({ emails });
});
