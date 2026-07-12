// api/products.js
// Catálogo público de la app, tomado en vivo desde tu Shopify.
// Usa el endpoint público products.json de tu tienda (NO requiere credenciales),
// así la app siempre muestra tus productos reales, con foto, precio y stock.
const DEFAULT_DOMAIN = "www.ambarjoyas.cl";

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default async function handler(req, res) {
  try {
    let domain = process.env.SHOPIFY_STORE_DOMAIN || DEFAULT_DOMAIN;
    // Si viene como *.myshopify.com o con http, lo normalizamos.
    domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const base = `https://${domain}`;

    const r = await fetch(`${base}/products.json?limit=250`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      return res.status(502).json({ error: "shopify_unreachable", status: r.status, base });
    }
    const data = await r.json();

    const products = (data.products || [])
      .map((p) => {
        const variant = (p.variants || [])[0] || {};
        const image = (p.images || [])[0]?.src || null;
        const price = Math.round(parseFloat(variant.price || "0")) || 0;
        return {
          id: String(p.id),
          name: p.title,
          handle: p.handle,
          category: p.product_type || "General",
          desc: stripHtml(p.body_html).slice(0, 160),
          price,
          image,
          available: variant.available !== false,
          variantId: variant.id ? String(variant.id) : null,
          url: `${base}/products/${p.handle}`,
        };
      })
      .filter((p) => p.variantId && p.price > 0);

    // Cache en el edge de Vercel: 1 min fresco, 5 min mientras revalida.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ domain: base, count: products.length, products });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
