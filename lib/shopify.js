// lib/shopify.js
// Utilidades de Shopify POR MARCA. Cada marca guarda su propio dominio y token
// de Admin API en `brands/{id}.shopify`. Preferimos esta fuente sobre el scraping
// porque llega limpia: título, precio, moneda, imagen y link del producto.
//
// Sobre los emails: la Admin API de Shopify NO permite enviar campañas de
// "Shopify Email" de forma programática. Por eso la app GENERA el email (asunto
// + HTML) y lo deja listo para que lo pegues/envíes con un clic dentro de
// Shopify Email. Ver lib/email-template.js y el panel.

import { normalizeShopifyImage } from "./scrape.js";

function shopCfg(brand) {
  const s = brand?.shopify || {};
  if (!s.storeDomain || !s.adminToken) return null;
  return {
    domain: s.storeDomain.replace(/^https?:\/\//, ""),
    token: s.adminToken,
    apiVersion: s.apiVersion || process.env.SHOPIFY_API_VERSION || "2024-04",
  };
}

export function hasShopify(brand) {
  return !!shopCfg(brand);
}

async function shopify(brand, path, { method = "GET", body } = {}) {
  const cfg = shopCfg(brand);
  if (!cfg) throw new Error(`La marca "${brand?.name}" no tiene Shopify conectado.`);
  const res = await fetch(`https://${cfg.domain}/admin/api/${cfg.apiVersion}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": cfg.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Shopify error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/** Prueba de conexión: devuelve el nombre y la moneda de la tienda. */
export async function testShopify(brand) {
  try {
    const data = await shopify(brand, "shop.json");
    return { ok: true, name: data.shop?.name, currency: data.shop?.currency };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * Trae productos activos como candidatos de contenido.
 * @returns {Promise<{source:string, currency:string, candidates:Array}>}
 */
export async function getShopifyProducts(brand, { limit = 30, tag } = {}) {
  let currency = brand?.voice?.currency || "";
  try {
    const shop = await shopify(brand, "shop.json");
    currency = shop.shop?.currency || currency;
  } catch (_) {
    /* no bloqueante */
  }

  const params = new URLSearchParams({ limit: String(limit), status: "active" });
  const data = await shopify(brand, `products.json?${params.toString()}`);
  let products = data.products || [];

  if (tag) {
    const wanted = tag.toLowerCase();
    products = products.filter((p) =>
      (p.tags || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .includes(wanted)
    );
  }

  const candidates = [];
  for (const p of products) {
    const image = p.image?.src || p.images?.[0]?.src;
    if (!image) continue;
    const variant = p.variants?.[0] || {};
    candidates.push({
      title: p.title,
      price: variant.price != null ? String(variant.price) : "",
      currency,
      imageUrl: normalizeShopifyImage(image),
      productUrl: p.handle ? `https://${shopCfg(brand).domain}/products/${p.handle}` : "",
      description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      shopifyProductId: p.id,
    });
  }
  return { source: "shopify-admin", currency, candidates };
}
