// api/scrape.js
// POST /api/scrape → vista previa de productos extraídos de la web (o de Shopify).
// Body: { brandId } (usa la fuente configurada) o { websiteUrl } (scraping directo).
import { checkAuth, readJson, withErrors } from "../lib/api-helpers.js";
import { getBrand } from "../lib/brands.js";
import { sourceProducts } from "../lib/plan.js";
import { scrapeProducts } from "../lib/scrape.js";

export default withErrors(async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const body = await readJson(req);

  if (body.brandId) {
    const brand = await getBrand(body.brandId);
    if (!brand) return res.status(404).json({ error: "Marca no encontrada." });
    const result = await sourceProducts(brand, { limit: body.limit || 20 });
    return res.status(200).json(result);
  }

  if (body.websiteUrl) {
    const result = await scrapeProducts(body.websiteUrl, { limit: body.limit || 20 });
    return res.status(200).json(result);
  }

  return res.status(400).json({ error: "Falta brandId o websiteUrl." });
});
