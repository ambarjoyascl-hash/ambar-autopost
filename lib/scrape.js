// lib/scrape.js
// Extrae "productos candidatos" desde la página web de una marca para alimentar
// al generador de contenido. No depende de una plataforma concreta: intenta
// varias estrategias en orden y se queda con la que dé mejores resultados.
//
//   1) Shopify  → {dominio}/products.json  (lo más limpio: título, precio, imagen)
//   2) JSON-LD  → <script type="application/ld+json"> con @type Product / ItemList
//   3) Open Graph + <img> → homepage/colección como último recurso
//
// Cada candidato tiene forma:
//   { title, price, currency, imageUrl, productUrl, description }
//
// Nota sobre imágenes para Instagram: IG exige JPEG en una URL pública. Aquí
// normalizamos las imágenes de Shopify a ~1080px; para otras plataformas
// devolvemos la URL tal cual y el usuario decide (o se sube a Storage).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function normalizeBase(websiteUrl) {
  let u = String(websiteUrl || "").trim();
  if (!u) throw new Error("Falta la URL de la web.");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  const url = new URL(u);
  return { origin: url.origin, href: url.href };
}

async function fetchText(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, status: res.status, body: "" };
    const body = await res.text();
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: "", error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

/** Fuerza ~1080px de ancho en imágenes del CDN de Shopify (requisito de IG). */
export function normalizeShopifyImage(src) {
  if (!src) return src;
  try {
    const url = new URL(src, "https://cdn.shopify.com");
    url.searchParams.set("width", "1080");
    return url.toString();
  } catch (_) {
    return src;
  }
}

// ── Estrategia 1: Shopify products.json ────────────────────────────────────
async function tryShopify(origin) {
  const { ok, body } = await fetchText(`${origin}/products.json?limit=50`);
  if (!ok) return null;
  let json;
  try {
    json = JSON.parse(body);
  } catch (_) {
    return null;
  }
  if (!Array.isArray(json.products) || json.products.length === 0) return null;

  const candidates = [];
  for (const p of json.products) {
    const image = p.images?.[0]?.src || p.image?.src;
    if (!image) continue;
    const variant = p.variants?.[0] || {};
    candidates.push({
      title: p.title,
      price: variant.price != null ? String(variant.price) : "",
      currency: "", // products.json no trae moneda; se toma de la voz de marca
      imageUrl: normalizeShopifyImage(image),
      productUrl: p.handle ? `${origin}/products/${p.handle}` : origin,
      description: stripHtml(p.body_html).slice(0, 400),
    });
  }
  return candidates.length ? { source: "shopify", candidates } : null;
}

// ── Estrategia 2: JSON-LD ──────────────────────────────────────────────────
function tryJsonLd(html, origin) {
  const blocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )];
  const products = [];
  for (const m of blocks) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch (_) {
      continue;
    }
    collectProducts(data, products);
  }
  const candidates = products
    .map((p) => productFromLd(p, origin))
    .filter((c) => c && c.imageUrl);
  return candidates.length ? { source: "json-ld", candidates } : null;
}

function collectProducts(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectProducts(n, out));
    return;
  }
  const type = node["@type"];
  const isProduct =
    type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (isProduct) out.push(node);
  if (Array.isArray(node["@graph"])) collectProducts(node["@graph"], out);
  if (Array.isArray(node.itemListElement)) collectProducts(node.itemListElement, out);
  if (node.item) collectProducts(node.item, out);
}

function productFromLd(p, origin) {
  const image = Array.isArray(p.image) ? p.image[0] : p.image?.url || p.image;
  const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers || {};
  return {
    title: p.name || "",
    price: offers.price != null ? String(offers.price) : "",
    currency: offers.priceCurrency || "",
    imageUrl: absolutize(image, origin),
    productUrl: absolutize(p.url || offers.url, origin) || origin,
    description: stripHtml(p.description).slice(0, 400),
  };
}

// ── Estrategia 3: Open Graph + <img> ──────────────────────────────────────
function tryHtmlImages(html, origin) {
  const candidates = [];

  // og:image principal
  const og = matchMeta(html, "og:image") || matchMeta(html, "twitter:image");
  const ogTitle = matchMeta(html, "og:title") || matchTitle(html);
  if (og) {
    candidates.push({
      title: ogTitle || "",
      price: "",
      currency: "",
      imageUrl: absolutize(og, origin),
      productUrl: origin,
      description: matchMeta(html, "og:description") || "",
    });
  }

  // <img> con pinta de foto de producto (evita logos/iconos por tamaño/nombre)
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => m[0])
    .map((tag) => ({
      src: attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-srcset"),
      alt: attr(tag, "alt") || "",
    }))
    .filter((i) => i.src && looksLikePhoto(i.src));

  const seen = new Set(candidates.map((c) => c.imageUrl));
  for (const i of imgs.slice(0, 24)) {
    const url = absolutize(firstFromSrcset(i.src), origin);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      title: i.alt || ogTitle || "",
      price: "",
      currency: "",
      imageUrl: url,
      productUrl: origin,
      description: "",
    });
  }
  return candidates.length ? { source: "html", candidates } : null;
}

// ── Orquestador ────────────────────────────────────────────────────────────
/**
 * Extrae candidatos de producto desde una web.
 * @param {string} websiteUrl
 * @param {{ limit?: number }} opts
 * @returns {Promise<{source:string, candidates:Array}>}
 */
export async function scrapeProducts(websiteUrl, { limit = 20 } = {}) {
  const { origin, href } = normalizeBase(websiteUrl);

  // 1) Shopify (mejor fuente)
  const shopify = await tryShopify(origin);
  if (shopify) return trim(shopify, limit);

  // 2) HTML de la home para JSON-LD / imágenes
  const { ok, body } = await fetchText(href);
  if (ok && body) {
    const ld = tryJsonLd(body, origin);
    if (ld) return trim(ld, limit);
    const html = tryHtmlImages(body, origin);
    if (html) return trim(html, limit);
  }

  return { source: "none", candidates: [], note: "No se pudieron extraer productos automáticamente." };
}

function trim(result, limit) {
  return { ...result, candidates: dedupe(result.candidates).slice(0, limit) };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((c) => {
    if (!c.imageUrl || seen.has(c.imageUrl)) return false;
    seen.add(c.imageUrl);
    return true;
  });
}

// ── Utilidades de parseo ──────────────────────────────────────────────────
function stripHtml(s = "") {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function matchMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i"
  );
  return (html.match(re)?.[1] || html.match(alt)?.[1] || "").trim() || null;
}
function matchTitle(html) {
  return (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim() || null;
}
function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}
function firstFromSrcset(src) {
  if (!src) return src;
  if (src.includes(",") && /\s\d+[wx]/.test(src)) return src.split(",")[0].trim().split(/\s+/)[0];
  return src;
}
function looksLikePhoto(src) {
  const s = src.toLowerCase();
  if (/(sprite|logo|icon|favicon|placeholder|blank|1x1|pixel|loader|spinner)/.test(s))
    return false;
  return /\.(jpe?g|png|webp|avif)(\?|$)/.test(s) || s.includes("/cdn/") || s.includes("shopify");
}
function absolutize(src, origin) {
  if (!src) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  try {
    return new URL(src, origin).toString();
  } catch (_) {
    return null;
  }
}
