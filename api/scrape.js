// api/scrape.js
// POST /api/scrape → vista previa de productos extraídos de la web (o de Shopify).
// Body: { brandId } (usa la fuente configurada) o { websiteUrl } (scraping directo).
//       { what: "brandkit", websiteUrl|brandId } → detecta logo, colores y
//       tipografía de la web para los emails (ver lib/brand-kit.js). Va aquí,
//       y no en su propia función, por el tope de 12 funciones del plan Hobby.
import { checkAuth, readJson, requireBrand, withErrors } from "../lib/api-helpers.js";
import { sourceProducts } from "../lib/plan.js";
import { scrapeProducts } from "../lib/scrape.js";
import { detectBrandKit } from "../lib/brand-kit.js";
import { getBrand } from "../lib/brands.js";

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const body = await readJson(req);

  if (body.what === "brandkit") {
    let url = body.websiteUrl;
    if (!url && body.brandId) {
      if (!(await requireBrand(req, res, user, body.brandId))) return;
      url = (await getBrand(body.brandId))?.websiteUrl;
    }
    if (!url) {
      return res.status(400).json({
        error: "Esta marca no tiene web configurada. Escríbela en Conexiones para poder leer su logo y sus colores.",
      });
    }
    const kit = await detectBrandKit(url);
    return res.status(200).json({ kit });
  }

  if (body.brandId) {
    const brand = await requireBrand(req, res, user, body.brandId);
    if (!brand) return;
    const result = await sourceProducts(brand, { limit: body.limit || 20 });
    return res.status(200).json(result);
  }

  if (body.websiteUrl) {
    const result = await scrapeProducts(body.websiteUrl, { limit: body.limit || 20 });
    return res.status(200).json(result);
  }

  return res.status(400).json({ error: "Falta brandId o websiteUrl." });
});
