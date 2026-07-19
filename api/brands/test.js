// api/brands/test.js
// POST /api/brands/test  → prueba credenciales SIN guardarlas.
// Body: { instagram?: {igUserId, pageAccessToken}, shopify?: {storeDomain, adminToken, apiVersion} }
import { checkAuth, readJson, withErrors } from "../../lib/api-helpers.js";
import { testInstagramCredentials } from "../../lib/meta.js";
import { testShopify } from "../../lib/shopify.js";

export default withErrors(async function handler(req, res) {
  if (!checkAuth(req, res)) return;
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
});
