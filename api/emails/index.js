// api/emails/index.js
// GET /api/emails?brandId=...&status=...  → emails generados de una marca
// (el HTML completo se pide en /api/emails/:id para no inflar la lista)
// GET /api/emails?brandId=...&audiencia=1 → cuántos clientes suscritos tiene la
//     marca en Shopify. Vive aquí y no en su propia función porque el plan
//     Hobby de Vercel solo admite 12 funciones y ya van 11.
import { checkAuth, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";
import { getBrand } from "../../lib/brands.js";
import { getSubscribedCustomers } from "../../lib/shopify.js";

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const { brandId, status } = req.query;
  if (!(await requireBrand(req, res, user, brandId))) return;

  if (req.query.audiencia) {
    const brand = await getBrand(brandId);
    if (!brand?.shopify?.adminToken) {
      return res.status(200).json({ suscritos: 0, revisados: 0, sinShopify: true });
    }
    const { destinatarios, revisados } = await getSubscribedCustomers(brand);
    return res.status(200).json({ suscritos: destinatarios.length, revisados });
  }

  const q = db.collection("emails").where("brandId", "==", brandId);
  const snap = await q.get();
  let emails = snap.docs.map((d) => {
    const { html, plainText, ...rest } = d.data();
    return { id: d.id, ...rest }; // omitimos el HTML pesado en la lista
  });
  if (status) emails = emails.filter((e) => e.status === status);
  emails.sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
  return res.status(200).json({ emails });
});
