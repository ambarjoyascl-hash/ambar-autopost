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
export async function sourceProducts(brand, { limit = 20 } = {}) {
  if (hasShopify(brand)) {
    try {
      const r = await getShopifyProducts(brand, { limit });
      if (r.candidates.length) return r;
    } catch (_) {
      /* si Shopify falla, caemos al scraping */
    }
  }
  if (brand.websiteUrl) {
    return scrapeProducts(brand.websiteUrl, { limit });
  }
  return { source: "none", candidates: [] };
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
    const r = await sourceProducts(brand, { limit: opts.productLimit || 20 });
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

  // ── Resolver posts: unir texto de la IA con imagen/link del producto ──
  // Variedad visual: la IA pide "producto" (foto 0, fondo blanco) o "lifestyle"
  // (fotos secundarias, en uso). Evitamos repetir la misma imagen en el plan.
  const usedImages = new Set();
  const pickImage = (prod, style) => {
    const imgs = (prod?.images?.length ? prod.images : [prod?.imageUrl]).filter(Boolean);
    if (!imgs.length) return "";
    const pool = style === "lifestyle" && imgs.length > 1 ? imgs.slice(1) : [imgs[0]];
    const choice =
      pool.find((u) => !usedImages.has(u)) ||
      imgs.find((u) => !usedImages.has(u)) ||
      pool[0];
    usedImages.add(choice);
    return choice;
  };

  const posts = (ai.posts || []).map((p) => {
    const prod = products[p.productIndex] || null;
    return {
      day: p.day,
      date: p.date,
      time: p.time || "19:00",
      theme: p.theme || "producto",
      imageStyle: p.imageStyle === "lifestyle" ? "lifestyle" : "producto",
      type: p.type === "carousel" ? "image" : "image", // MVP: imagen simple
      platform,
      caption: p.caption || "",
      altText: p.altText || (prod ? prod.title : ""),
      imageUrl: pickImage(prod, p.imageStyle),
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
