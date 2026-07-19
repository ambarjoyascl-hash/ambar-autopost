// api/cron/refresh-token.js
// Cron (semanal): refresca el token de Meta de TODAS las marcas conectadas.
import { listBrands } from "../../lib/brands.js";
import { refreshBrandToken } from "../../lib/meta.js";
import { checkCron } from "../../lib/api-helpers.js";

export default async function handler(req, res) {
  if (!checkCron(req, res)) return;

  const brands = await listBrands({ redacted: false });
  const results = [];
  for (const brand of brands) {
    if (!brand.instagram?.longLivedUserToken) continue;
    try {
      await refreshBrandToken(brand.id);
      results.push({ brand: brand.name, ok: true });
    } catch (err) {
      results.push({ brand: brand.name, ok: false, error: String(err.message || err) });
    }
  }
  return res.status(200).json({ ok: true, refreshedAt: Date.now(), results });
}
