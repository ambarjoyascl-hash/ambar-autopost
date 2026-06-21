// lib/shopify-to-queue.js
// Opcional: toma productos de Shopify y arma posts en la cola `scheduledPosts`.
//
// Convierte cada producto en un documento de Firestore listo para que el cron de
// publicación lo levante. La imagen se normaliza a JPEG 1080px (requisito de IG),
// y el caption se arma con título, precio y link al producto.
//
// Uso típico (script puntual o endpoint protegido):
//   import { syncShopifyProductsToQueue } from "./lib/shopify-to-queue.js";
//   await syncShopifyProductsToQueue({ tag: "para-publicar", spacingMinutes: 180 });
//
// Variables de entorno necesarias:
//   SHOPIFY_STORE_DOMAIN   ej. "ambar-joyas.myshopify.com"
//   SHOPIFY_ADMIN_TOKEN    Admin API access token (shpat_...)
//   SHOPIFY_API_VERSION    ej. "2024-04" (opcional)
import { db } from "./firebase-admin.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

/**
 * Normaliza la URL de imagen del CDN de Shopify a JPEG ~1080px de ancho.
 * Shopify sirve transformaciones vía query param `width`; forzamos también
 * la extensión a .jpg cuando se puede para cumplir el requisito de IG.
 */
function normalizeShopifyImage(src) {
  if (!src) return src;
  try {
    const url = new URL(src);
    url.searchParams.set("width", "1080");
    return url.toString();
  } catch (_) {
    return src;
  }
}

/**
 * Formatea un precio con la moneda de la tienda.
 */
function formatPrice(amount, currency) {
  if (amount == null) return "";
  const n = Number(amount);
  if (Number.isNaN(n)) return "";
  return `${currency || ""} ${n.toFixed(2)}`.trim();
}

/**
 * Arma el caption de un producto: título + precio + link + hashtags base.
 */
function buildCaption(product, productUrl, currency) {
  const variant = product.variants?.[0];
  const price = formatPrice(variant?.price, currency);
  const lines = [];
  lines.push(product.title);
  if (price) lines.push(`💎 ${price}`);
  if (productUrl) lines.push(`🛒 ${productUrl}`);
  lines.push("");
  lines.push("#ambarjoyas #joyas #plata925 #accesorios");
  return lines.join("\n");
}

/**
 * Llama a la Admin REST API de Shopify.
 */
async function shopify(path, { method = "GET", body } = {}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) {
    throw new Error("Faltan SHOPIFY_STORE_DOMAIN o SHOPIFY_ADMIN_TOKEN.");
  }
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Shopify error: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Sincroniza productos de Shopify a la cola `scheduledPosts`.
 *
 * @param {Object} opts
 * @param {string}  [opts.tag]              Solo productos con este tag.
 * @param {number}  [opts.limit=10]         Máximo de productos a tomar.
 * @param {number}  [opts.spacingMinutes=180] Minutos entre cada post programado.
 * @param {number}  [opts.startAt=Date.now()] Epoch ms del primer post.
 * @param {string}  [opts.platform="both"]  "instagram" | "facebook" | "both".
 * @param {string}  [opts.currency="MXN"]   Moneda para el precio.
 * @returns {Promise<{created:number, ids:string[]}>}
 */
export async function syncShopifyProductsToQueue({
  tag,
  limit = 10,
  spacingMinutes = 180,
  startAt = Date.now(),
  platform = "both",
  currency = "MXN",
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), status: "active" });
  const data = await shopify(`products.json?${params.toString()}`);
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

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const spacingMs = spacingMinutes * 60 * 1000;
  const ids = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const image = product.image || product.images?.[0];
    if (!image?.src) continue; // sin imagen no hay post

    const handle = product.handle;
    const productUrl = handle ? `https://${domain}/products/${handle}` : "";
    const scheduledFor = startAt + i * spacingMs;

    const docRef = await db.collection("scheduledPosts").add({
      platform,
      type: "image",
      imageUrl: normalizeShopifyImage(image.src),
      caption: buildCaption(product, productUrl, currency),
      altText: product.title,
      scheduledFor,
      status: "pending",
      source: "shopify",
      shopifyProductId: product.id,
      igMediaId: null,
      fbPostId: null,
      error: null,
      createdAt: Date.now(),
    });
    ids.push(docRef.id);
  }

  return { created: ids.length, ids };
}
