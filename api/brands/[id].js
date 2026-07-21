// api/brands/[id].js
// GET    /api/brands/:id   → una marca (sin secretos)
// PUT    /api/brands/:id   → actualiza (los tokens vacíos no se sobreescriben)
// DELETE /api/brands/:id   → elimina la marca
// POST   /api/brands/test  → prueba credenciales SIN guardarlas (id reservado
//        "test"; vive aquí para no gastar otra función del plan Hobby).
// GET/POST /api/brands/facebook-oauth → flujo "Conectar con Facebook" (id
//        reservado; el GET es el callback de Facebook y NO lleva sesión —
//        se protege con un state firmado, ver lib/meta-oauth.js).
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { updateBrand, deleteBrand, redactBrand } from "../../lib/brands.js";
import { testInstagramCredentials } from "../../lib/meta.js";
import { testShopify } from "../../lib/shopify.js";
import { handleFacebookOauth } from "../../lib/meta-oauth.js";

export default withErrors(async function handler(req, res) {
  const { id } = req.query;
  if (id === "facebook-oauth") return handleFacebookOauth(req, res);

  const user = await checkAuth(req, res);
  if (!user) return;

  if (id === "test") {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const body = await readJson(req);
    const out = {};
    if (body.instagram) {
      out.instagram = await testInstagramCredentials(body.instagram);
    }
    if (body.shopify) {
      out.shopify = await testShopify({ name: "test", shopify: body.shopify });
    }
    return res.status(200).json(out);
  }

  const brand = await requireBrand(req, res, user, id);
  if (!brand) return;

  if (req.method === "GET") {
    return res.status(200).json({ brand: redactBrand(brand) });
  }

  if (req.method === "PUT") {
    const body = await readJson(req);
    const updated = await updateBrand(id, body);
    return res.status(200).json({ brand: redactBrand(updated) });
  }

  if (req.method === "DELETE") {
    await deleteBrand(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
