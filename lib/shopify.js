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

/** Llamada a la GraphQL Admin API. Los filtros de consentimiento de marketing
 *  no existen en REST, así que la audiencia de correo se lee por aquí. */
async function shopifyGraphql(brand, query, variables = {}) {
  const cfg = shopCfg(brand);
  if (!cfg) throw new Error(`La marca "${brand?.name}" no tiene Shopify conectado.`);
  const res = await fetch(`https://${cfg.domain}/admin/api/${cfg.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopify error (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  if (data.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(data.errors).slice(0, 300)}`);
  return data.data;
}

const Q_CLIENTES = `query($cursor: String) {
  customers(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id email firstName emailMarketingConsent { marketingState } }
  }
}`;

/**
 * Devuelve los clientes a los que SÍ se les puede escribir marketing.
 *
 * El filtro se aplica en el código y no en la query de Shopify a propósito: el
 * parámetro `query` de customersCount/customers ignora en silencio los filtros
 * que no reconoce, y un filtro que falla en silencio aquí significa escribirle
 * a gente que se dio de baja. Se lee el estado de cada cliente y se compara.
 */
export async function getSubscribedCustomers(brand, { max = 20000 } = {}) {
  const out = [];
  let cursor = null;
  let revisados = 0;
  for (;;) {
    const d = await shopifyGraphql(brand, Q_CLIENTES, { cursor });
    for (const c of d.customers.nodes) {
      revisados++;
      if (!c.email) continue;
      if (c.emailMarketingConsent?.marketingState !== "SUBSCRIBED") continue;
      out.push({ id: c.id, email: c.email, firstName: c.firstName || "" });
    }
    if (!d.customers.pageInfo.hasNextPage || out.length >= max) break;
    cursor = d.customers.pageInfo.endCursor;
  }
  return { destinatarios: out, revisados };
}

/** Registra la baja en Shopify. La baja manda: se respeta en todos los canales. */
export async function unsubscribeCustomer(brand, email) {
  const d = await shopifyGraphql(
    brand,
    `query($q: String!) { customers(first: 1, query: $q) { nodes { id } } }`,
    { q: `email:${email}` }
  );
  const id = d.customers.nodes[0]?.id;
  if (!id) return { ok: false, reason: "cliente no encontrado" };

  const r = await shopifyGraphql(
    brand,
    `mutation($input: CustomerEmailMarketingConsentUpdateInput!) {
       customerEmailMarketingConsentUpdate(input: $input) {
         userErrors { field message }
       }
     }`,
    {
      input: {
        customerId: id,
        emailMarketingConsent: {
          marketingState: "UNSUBSCRIBED",
          consentUpdatedAt: new Date().toISOString(),
        },
      },
    }
  );
  const errs = r.customerEmailMarketingConsentUpdate?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
  return { ok: true };
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

/** Trae TODO el catálogo activo, siguiendo la paginación por Link header. */
async function fetchAllActiveProducts(brand) {
  const cfg = shopCfg(brand);
  if (!cfg) throw new Error(`La marca "${brand?.name}" no tiene Shopify conectado.`);
  const out = [];
  let url = `https://${cfg.domain}/admin/api/${cfg.apiVersion}/products.json?limit=250&status=active`;
  while (url && out.length < 1000) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Shopify error (${res.status}): ${JSON.stringify(data)}`);
    out.push(...(data.products || []));
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") || "");
    url = next ? next[1] : null;
  }
  return out;
}

/** Agrupa "Anillos"/"Anillo", "Collares"/"Collar", etc. bajo la misma llave. */
function typeKey(p) {
  const t = (p.product_type || p.title || "").trim().split(/\s+/)[0].toLowerCase();
  if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

/**
 * Reparte el cupo entre los tipos de producto (aros, collares, anillos…),
 * barajando dentro de cada tipo. Antes se tomaba la primera página de Shopify
 * tal cual, que llega en orden alfabético: con 139 productos, los 20 que veía
 * la IA eran todos "Anillo ..." y el feed salía solo de anillos (ago-2026).
 */
function pickVaried(products, limit) {
  if (products.length <= limit) return products;
  const groups = new Map();
  for (const p of products) {
    const key = typeKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const lists = [...groups.values()];
  for (const list of lists) shuffle(list);
  const out = [];
  while (out.length < limit && lists.some((l) => l.length)) {
    for (const l of lists) {
      if (out.length >= limit) break;
      if (l.length) out.push(l.shift());
    }
  }
  return out;
}

/**
 * Trae productos activos como candidatos de contenido, con variedad de
 * categorías garantizada cuando el catálogo es más grande que `limit`.
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

  let products = await fetchAllActiveProducts(brand);

  if (tag) {
    const wanted = tag.toLowerCase();
    products = products.filter((p) =>
      (p.tags || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .includes(wanted)
    );
  }

  // Solo productos con foto cuentan para el cupo (sin foto no hay post).
  products = products.filter((p) => p.image?.src || p.images?.[0]?.src);
  products = pickVaried(products, limit);

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
      images: (p.images || []).map((i) => normalizeShopifyImage(i.src)).filter(Boolean).slice(0, 6),
      productUrl: p.handle ? `https://${shopCfg(brand).domain}/products/${p.handle}` : "",
      description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      shopifyProductId: p.id,
    });
  }
  return { source: "shopify-admin", currency, candidates };
}
