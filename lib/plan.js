// lib/plan.js
// Orquesta la generación del plan semanal y su publicación en la cola.
//
// Flujo:
//   generatePlan(brandId, opts)  → busca productos (Shopify o web) → IA arma el
//                                  plan → lo guarda como BORRADOR en `plans`.
//   approvePlan(planId)          → crea los posts en `scheduledPosts` (pending)
//                                  y los emails en `emails` (ready).
//   discardPlan(planId)          → borra el borrador.
//
// El usuario revisa el borrador en el panel antes de aprobar. Nada se publica
// ni se agenda hasta que aprueba.

import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";
import { hasShopify, getShopifyProducts } from "./shopify.js";
import { scrapeProducts } from "./scrape.js";
import { generateWeeklyPlan } from "./ai.js";
import { buildEmailHtml } from "./email-template.js";

const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || "America/Santiago";

/** Consigue productos de la mejor fuente disponible para la marca. */
export async function sourceProducts(brand, { limit = 20, exclude } = {}) {
  if (hasShopify(brand)) {
    try {
      const r = await getShopifyProducts(brand, { limit, exclude });
      if (r.candidates.length) return r;
    } catch (_) {
      /* si Shopify falla, caemos al scraping */
    }
  }
  if (brand.websiteUrl) {
    const r = await scrapeProducts(brand.websiteUrl, { limit });
    if (exclude && exclude.size) {
      const frescos = r.candidates.filter((c) => !exclude.has(c.productUrl));
      if (frescos.length) r.candidates = frescos;
    }
    return r;
  }
  return { source: "none", candidates: [] };
}

/**
 * productUrls ya usados en planes APROBADOS de la marca. Los borradores
 * descartados no cuentan. Sirve para no repetir producto hasta agotar el
 * catálogo ("de más nuevos a más viejos, sin repetir").
 */
async function usedProductUrls(brandId) {
  const snap = await db.collection("plans").where("brandId", "==", brandId).get();
  const used = new Set();
  for (const d of snap.docs) {
    const plan = d.data();
    if (plan.status !== "scheduled") continue;
    for (const p of plan.posts || []) {
      if (p.productUrl) used.add(p.productUrl);
    }
  }
  return used;
}

/**
 * Genera un borrador de plan semanal y lo guarda en `plans`.
 * @returns {Promise<Object>} el documento del plan (con posts y emails resueltos)
 */
export async function generatePlan(brandId, opts = {}) {
  const brand = await getBrand(brandId);
  if (!brand) throw new Error("Marca no encontrada.");

  const startDate = opts.startDate || todayInTz(DEFAULT_TZ);
  const postsPerWeek = opts.postsPerWeek ?? 7;
  const includeEmails = opts.includeEmails ?? true;
  const emailsPerWeek = opts.emailsPerWeek ?? 2;

  // Origen de las imágenes: "web" (solo web/Shopify), "mix" (web + subidas)
  // o "uploads" (solo fotos subidas por el usuario).
  const imageMode = ["mix", "uploads"].includes(opts.imageMode) ? opts.imageMode : "web";
  const uploads = (brand.media || [])
    .filter((m) => m.type === "image")
    .map((m) => ({
      title: m.name || "Foto propia de la marca",
      price: "",
      currency: "",
      imageUrl: m.url,
      images: [m.url],
      productUrl: brand.websiteUrl || "",
      description: "(foto subida por la marca; sin precio — ideal para lifestyle o contenido de marca)",
      isUpload: true,
    }));

  let products, source;
  if (imageMode === "uploads") {
    if (!uploads.length) throw new Error("No hay fotos subidas en esta marca. Sube fotos o elige otro origen de imágenes.");
    products = uploads;
    source = "fotos-subidas";
  } else {
    const exclude = await usedProductUrls(brandId);
    const r = await sourceProducts(brand, { limit: opts.productLimit || 20, exclude });
    products = imageMode === "mix" ? [...r.candidates, ...uploads] : r.candidates;
    source = imageMode === "mix" && uploads.length ? `${r.source}+subidas` : r.source;
  }

  const ai = await generateWeeklyPlan({
    brand,
    products,
    startDate,
    postsPerWeek,
    includeEmails,
    emailsPerWeek,
    goal: (opts.goal || "").slice(0, 500),
    tone: (opts.tone || "").slice(0, 120),
  });

  const tz = brand.voice?.timezone || DEFAULT_TZ;
  const platform = brand.instagram?.postToFacebook ? "both" : "instagram";
  const toPinterest = !!(opts.pinterest && brand.pinterest?.accessToken);

  // ── Resolver posts: unir texto de la IA con imagen/link del producto ──
  // Variedad visual del feed. La foto 0 de cada producto es la portada de
  // catálogo (fondo limpio); las siguientes suelen ser detalle, escala o el
  // producto puesto. Dejarle la decisión a la IA no funcionó: pedía "producto"
  // casi siempre y el feed quedaba como una vitrina, todas las fotos iguales
  // (reportado por Gina el 6-ago-2026). Ahora la alternancia es determinista:
  // los posts en posición par tiran a portada y los impares a secundarias, y
  // "lifestyle" de la IA fuerza secundaria aunque toque posición par. Dentro de
  // cada grupo se rota para no repetir foto en el mismo plan.
  const usedImages = new Set();
  let seq = 0;
  /** @returns {{url: string, style: "producto"|"lifestyle"}} */
  const pickImage = (prod, style) => {
    const imgs = (prod?.images?.length ? prod.images : [prod?.imageUrl]).filter(Boolean);
    if (!imgs.length) return { url: "", style: "producto" };
    const secundarias = imgs.slice(1);
    const quiereSecundaria = style === "lifestyle" || seq % 2 === 1;
    const n = seq++;
    // Si el producto no tiene secundarias, no hay nada que alternar: portada.
    const base = quiereSecundaria && secundarias.length ? secundarias : imgs;
    // Rotamos el punto de partida para que en los productos con 4 o 6 fotos no
    // caiga siempre la misma secundaria.
    const corte = n % base.length;
    const preferidas = [...base.slice(corte), ...base.slice(0, corte)];
    const choice =
      preferidas.find((u) => !usedImages.has(u)) ||
      imgs.find((u) => !usedImages.has(u)) ||
      preferidas[0];
    usedImages.add(choice);
    // El estilo guardado es el de la foto que realmente quedó, no el que pidió
    // la IA: así el calendario muestra la verdad.
    return { url: choice, style: choice === imgs[0] ? "producto" : "lifestyle" };
  };

  // Ningún producto puede salir dos veces en el mismo plan. Al prompt ya se le
  // pide, pero pedirlo no es garantizarlo: si la IA repite un índice (o manda
  // uno que no existe), aquí se cambia por el siguiente producto sin usar de la
  // lista, que ya viene rotada por categoría desde lib/shopify.js.
  const usados = new Set();
  const tomarProducto = (i) => {
    if (products[i] && !usados.has(i)) {
      usados.add(i);
      return products[i];
    }
    for (let j = 0; j < products.length; j++) {
      if (!usados.has(j)) {
        usados.add(j);
        return products[j];
      }
    }
    return products[i] || null; // catálogo agotado: mejor repetir que quedar sin foto
  };

  const posts = (ai.posts || []).map((p) => {
    const prod = tomarProducto(p.productIndex);
    const img = pickImage(prod, p.imageStyle);
    return {
      day: p.day,
      date: p.date,
      time: p.time || "19:00",
      theme: p.theme || "producto",
      imageStyle: img.style,
      type: p.type === "carousel" ? "image" : "image", // MVP: imagen simple
      platform,
      pinterest: toPinterest,
      caption: p.caption || "",
      altText: p.altText || (prod ? prod.title : ""),
      imageUrl: img.url,
      productUrl: prod?.productUrl || "",
      productTitle: prod?.title || "",
      scheduledFor: zonedToEpoch(p.date, p.time || "19:00", tz),
    };
  });

  // ── Resolver emails: construir el HTML con la plantilla ──
  const emails = (ai.emails || []).map((e) => {
    const prods = (e.productIndexes || [])
      .map((i) => products[i])
      .filter(Boolean);
    const built = buildEmailHtml({ brand, email: e, products: prods });
    return {
      day: e.day,
      date: e.date,
      subject: built.subject,
      previewText: built.previewText,
      heading: e.heading || "",
      html: built.html,
      plainText: built.plainText,
      ctaText: e.ctaText || "Ver más",
      ctaUrl: e.ctaUrl || "",
      productTitles: prods.map((p) => p.title),
      scheduledFor: zonedToEpoch(e.date, "09:00", tz),
    };
  });

  const now = Date.now();
  const planDoc = {
    brandId,
    brandName: brand.name,
    startDate,
    source,
    productCount: products.length,
    status: "draft",
    posts,
    emails,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection("plans").add(planDoc);
  return { id: ref.id, ...planDoc };
}

/**
 * Aprueba un borrador: crea los posts (pending) y los emails (ready).
 */
export async function approvePlan(planId) {
  const snap = await db.collection("plans").doc(planId).get();
  if (!snap.exists) throw new Error("Plan no encontrado.");
  const plan = snap.data();
  if (plan.status === "scheduled") {
    return { alreadyScheduled: true };
  }

  const batch = db.batch();
  const postIds = [];
  const now = Date.now();

  for (const post of plan.posts || []) {
    if (!post.imageUrl) continue; // sin imagen no se puede publicar en IG
    const ref = db.collection("scheduledPosts").doc();
    postIds.push(ref.id);
    batch.set(ref, {
      brandId: plan.brandId,
      platform: post.platform || "instagram",
      type: "image",
      imageUrl: post.imageUrl,
      caption: post.caption,
      altText: post.altText || "",
      scheduledFor: post.scheduledFor,
      status: "pending",
      source: "plan",
      planId,
      igMediaId: null,
      fbPostId: null,
      error: null,
      createdAt: now,
    });
  }

  const emailIds = [];
  for (const email of plan.emails || []) {
    const ref = db.collection("emails").doc();
    emailIds.push(ref.id);
    batch.set(ref, {
      brandId: plan.brandId,
      subject: email.subject,
      previewText: email.previewText,
      heading: email.heading || "",
      html: email.html,
      plainText: email.plainText,
      ctaText: email.ctaText,
      ctaUrl: email.ctaUrl,
      scheduledFor: email.scheduledFor,
      status: "ready", // listo para copiar/enviar en Shopify Email
      source: "plan",
      planId,
      createdAt: now,
    });
  }

  batch.update(snap.ref, { status: "scheduled", updatedAt: now });
  await batch.commit();

  return { scheduledPosts: postIds.length, emails: emailIds.length };
}

export async function discardPlan(planId) {
  await db.collection("plans").doc(planId).delete();
  return { ok: true };
}

export async function listPlans(brandId) {
  let q = db.collection("plans");
  if (brandId) q = q.where("brandId", "==", brandId);
  const snap = await q.get();
  const plans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return plans;
}

// ── Utilidades de fecha/hora con zona horaria (sin librerías) ──────────────

/** "YYYY-MM-DD" de hoy en la zona horaria dada. */
export function todayInTz(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA da directamente YYYY-MM-DD
}

/** Offset (ms) de la zona horaria en un instante dado. */
function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

/**
 * Convierte una hora local ("YYYY-MM-DD", "HH:MM") de una zona a epoch ms UTC.
 */
export function zonedToEpoch(dateStr, timeStr, tz) {
  const [y, mo, d] = String(dateStr).split("-").map(Number);
  const [h, mi] = String(timeStr).split(":").map(Number);
  if (!y || !mo || !d) return Date.now();
  const utcGuess = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  const offset = tzOffsetMs(new Date(utcGuess), tz);
  return utcGuess - offset;
}
