// api/brands/index.js
// GET  /api/brands       → lista de marcas (sin secretos)
// POST /api/brands       → crea una marca
import { checkAuth, readJson, withErrors } from "../../lib/api-helpers.js";
import { listBrands, createBrand, redactBrand } from "../../lib/brands.js";
import { checkBrandLimit } from "../../lib/limits.js";

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const brands = await listBrands({ ownerUid: user.uid, admin: user.admin });
    return res.status(200).json({ brands });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (!user.admin) {
      const mine = await listBrands({ ownerUid: user.uid });
      await checkBrandLimit(user.uid, user.email, mine.length);
    }
    const brand = await createBrand(body, user.admin ? null : user.uid);
    return res.status(201).json({ brand: redactBrand(brand) });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
