// api/brands/index.js
// GET  /api/brands       → lista de marcas (sin secretos)
// POST /api/brands       → crea una marca
import { checkAuth, readJson, withErrors } from "../../lib/api-helpers.js";
import { listBrands, createBrand, redactBrand } from "../../lib/brands.js";

export default withErrors(async function handler(req, res) {
  if (!(await checkAuth(req, res))) return;

  if (req.method === "GET") {
    const brands = await listBrands();
    return res.status(200).json({ brands });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const brand = await createBrand(body);
    return res.status(201).json({ brand: redactBrand(brand) });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
