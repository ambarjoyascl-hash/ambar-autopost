// lib/shopify.js
// Utilidades de Shopify POR MARCA. Cada marca guarda su propio dominio y token
// de Admin API en `brands/{id}.shopify`. Preferimos esta fuente sobre el scraping
// porque llega limpia: título, precio, moneda, imagen y link del producto.
//
// Sobre los emails: la Admin API de Shopify NO permite enviar campañas de
// "Shopify Email" de forma programática. Por eso la app GENERA el email (asunto
// + HTML) y lo deja listo para que lo pegues/envíes con un clic dentro de
// Shopify Email. Ver lib/email-template.js y el panel.

import { normalizeShopifyImage, claveProducto } from "./scrape.js";

/**
 * Dominio con el que se arman los links de producto. Se usa el de la marca
 * (ambarjoyas.cl) y no el de Shopify: un correo a 1.000 clientes con links a
 * `ambar-8632.myshopify.com` se ve a leguas que no es la tienda, y de paso
 * pierde el dominio de la marca en Google.
 */
function origenPublico(brand) {
  const w = String(brand?.websiteUrl || "").trim();
  if (w) {
    try {
      return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).origin;
    } catch (_) {
      /* si la web guardada está mal escrita, cae al dominio de Shopify */
    }
  }
  return `https://${shopCfg(brand).domain}`;
}

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

/**
 * Categoría normalizada de un producto, para poder rotarlas.
 *
 * `product_type` viene sucio en la tienda real: conviven "Anillos" y "Anillo",
 * "Collares" y "Collar", "Pulsera" y "Pulseras", y 20 de los 139 productos no
 * tienen tipo. Se normaliza (sin tildes, en minúsculas, singular) y, cuando no
 * hay tipo, se deduce de la primera palabra del título, que en esta tienda es
 * siempre la categoría ("Collar Flor Cristal Rosa", "Prendedor Sol Perlas").
 */
function categoriaDe(p) {
  const limpia = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/e?s$/, ""); // "anillos"→"anillo", "collares"→"collar"
  const tipo = limpia(p.product_type);
  if (tipo) return tipo;
  const primera = limpia(String(p.title || "").split(/\s+/)[0]);
  return primera || "otro";
}

/**
 * Reparte los candidatos rotando entre categorías: uno de cada categoría por
 * vuelta, en vez de agotar una antes de pasar a la siguiente.
 *
 * Sin esto, ordenar por fecha basta para no repetir producto pero no cambia el
 * rubro: si lo último que subió Gina fueron 20 anillos, la semana entera son
 * anillos (pedido suyo, 9-ago-2026). Dentro de cada categoría se respeta el
 * orden que traía (más nuevo primero), y las categorías arrancan por la que
 * tiene el producto más nuevo, para que lo recién llegado siga abriendo.
 */
function rotarCategorias(lista) {
  const grupos = new Map(); // categoría → productos, en el orden recibido
  for (const c of lista) {
    if (!grupos.has(c.category)) grupos.set(c.category, []);
    grupos.get(c.category).push(c);
  }
  const colas = [...grupos.values()]; // Map conserva el orden de inserción
  const out = [];
  for (let i = 0; out.length < lista.length; i++) {
    let movio = false;
    for (const cola of colas) {
      if (i < cola.length) {
        out.push(cola[i]);
        movio = true;
      }
    }
    if (!movio) break; // red de seguridad: nunca girar en vacío
  }
  return out;
}

/**
 * Trae productos activos como candidatos de contenido, rotando entre categorías
 * y sin repetir los ya publicados (`exclude` = productUrls usados). Dentro de
 * cada categoría van del más nuevo al más viejo. Cuando el catálogo entero ya se
 * publicó, la rueda parte de nuevo. (Pedido de Gina, 9-ago-2026: antes la
 * primera página llegaba en orden alfabético y los planes salían solo con
 * "Anillo ..."; ordenar por fecha lo arregló a medias, porque una tanda nueva
 * de una sola categoría volvía a dejar la semana entera igual.)
 * @returns {Promise<{source:string, currency:string, candidates:Array, freshCount:number}>}
 */
export async function getShopifyProducts(brand, { limit = 30, tag, exclude } = {}) {
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
  // Más nuevos primero: la fecha de creación en Shopify marca el orden.
  products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const candidates = [];
  for (const p of products) {
    const image = p.image?.src || p.images?.[0]?.src;
    const variant = p.variants?.[0] || {};
    candidates.push({
      title: p.title,
      price: variant.price != null ? String(variant.price) : "",
      currency,
      imageUrl: normalizeShopifyImage(image),
      images: (p.images || []).map((i) => normalizeShopifyImage(i.src)).filter(Boolean).slice(0, 6),
      productUrl: p.handle ? `${origenPublico(brand)}/products/${p.handle}` : "",
      description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      shopifyProductId: p.id,
      category: categoriaDe(p),
    });
  }

  // Primero los que nunca se han publicado; los ya usados solo entran a
  // rellenar cuando el catálogo fresco no alcanza para el cupo. La rotación se
  // aplica por separado a cada bolsa, para no mezclar frescos con repetidos.
  const ex = new Set([...(exclude || [])].map(claveProducto));
  const yaUsado = (c) => ex.has(claveProducto(c.productUrl));
  const frescos = rotarCategorias(candidates.filter((c) => !yaUsado(c)));
  const repetidos = rotarCategorias(candidates.filter((c) => yaUsado(c)));
  const seleccion = [...frescos, ...repetidos].slice(0, limit);
  return { source: "shopify-admin", currency, candidates: seleccion, freshCount: Math.min(frescos.length, limit) };
}
