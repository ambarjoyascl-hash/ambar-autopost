// lib/brands.js
// CRUD de "marcas" (brands) en Firestore. Cada marca es una cuenta independiente
// con su propio Instagram, su Shopify, su web y su voz de marca. Así una misma
// persona puede administrar varias marcas desde el mismo panel.
//
// Modelo del documento `brands/{id}`:
// {
//   name: "Ámbar Joyas",
//   slug: "ambar-joyas",
//   websiteUrl: "https://www.ambarjoyas.cl",
//   instagram: {                     // credenciales de Meta (ver lib/meta.js)
//     igUserId, pageId, pageAccessToken, longLivedUserToken, tokenUpdatedAt,
//     postToFacebook: false          // si además publica en la Página de FB
//   },
//   shopify: { storeDomain, adminToken, apiVersion },
//   voice: {                         // guía para la IA
//     tone: "cálido y cercano",
//     audience: "mujeres 25-45 que aman la plata",
//     hashtags: ["#ambarjoyas", "#plata925"],
//     currency: "CLP",
//     language: "es"
//   },
//   createdAt, updatedAt
// }
import { db } from "./firebase-admin.js";

const COL = "brands";

/** Convierte "Ámbar Joyas" → "ambar-joyas". */
export function slugify(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "marca";
}

/**
 * Oculta los secretos antes de mandar una marca al frontend.
 * Nunca exponemos tokens completos al navegador; sólo indicamos si existen.
 */
export function redactBrand(brand) {
  if (!brand) return brand;
  const ig = brand.instagram || {};
  const shop = brand.shopify || {};
  const { pendingOauth: _omit, ...rest } = brand;
  return {
    ...rest,
    instagram: {
      igUserId: ig.igUserId || "",
      pageId: ig.pageId || "",
      postToFacebook: !!ig.postToFacebook,
      tokenUpdatedAt: ig.tokenUpdatedAt || null,
      connected: !!(ig.igUserId && ig.pageAccessToken),
    },
    shopify: {
      storeDomain: shop.storeDomain || "",
      apiVersion: shop.apiVersion || "",
      connected: !!(shop.storeDomain && shop.adminToken),
    },
  };
}

export async function listBrands({ redacted = true, ownerUid = null, admin = false } = {}) {
  // Los admin ven todo; cada usuario solo sus marcas. Se ordena en memoria para
  // no necesitar un índice compuesto (ownerUid + createdAt).
  let q = db.collection(COL);
  if (!admin) q = q.where("ownerUid", "==", ownerUid || "__nadie__");
  const snap = await q.get();
  return snap.docs
    .map((d) => {
      const data = { id: d.id, ...d.data() };
      return redacted ? redactBrand(data) : data;
    })
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function getBrand(id, { redacted = false } = {}) {
  const snap = await db.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...snap.data() };
  return redacted ? redactBrand(data) : data;
}

export async function createBrand(input = {}, ownerUid = null) {
  const now = Date.now();
  const name = (input.name || "").trim();
  if (!name) throw new Error("El nombre de la marca es obligatorio.");

  const doc = {
    name,
    ownerUid: ownerUid || null,
    slug: slugify(name),
    websiteUrl: (input.websiteUrl || "").trim(),
    instagram: sanitizeInstagram(input.instagram),
    shopify: sanitizeShopify(input.shopify),
    voice: sanitizeVoice(input.voice),
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection(COL).add(doc);
  return { id: ref.id, ...doc };
}

/**
 * Actualiza una marca. Los campos de credenciales sólo se sobreescriben si
 * vienen con valor (así el frontend puede mandar "" para no tocar un token).
 */
export async function updateBrand(id, patch = {}) {
  const current = await getBrand(id);
  if (!current) throw new Error("Marca no encontrada.");

  const next = { updatedAt: Date.now() };
  if (typeof patch.name === "string" && patch.name.trim()) {
    next.name = patch.name.trim();
    next.slug = slugify(next.name);
  }
  if (typeof patch.websiteUrl === "string") next.websiteUrl = patch.websiteUrl.trim();

  if (patch.instagram) {
    next.instagram = mergeCreds(current.instagram, sanitizeInstagram(patch.instagram));
  }
  if (patch.shopify) {
    next.shopify = mergeCreds(current.shopify, sanitizeShopify(patch.shopify));
  }
  if (patch.voice) {
    next.voice = { ...(current.voice || {}), ...sanitizeVoice(patch.voice) };
  }

  await db.collection(COL).doc(id).set(next, { merge: true });
  return getBrand(id);
}

export async function deleteBrand(id) {
  await db.collection(COL).doc(id).delete();
  return { ok: true };
}

// ── Helpers de saneamiento ────────────────────────────────────────────────

// Merge que ignora strings vacíos del patch (para no borrar secretos existentes).
function mergeCreds(current = {}, patch = {}) {
  const out = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

function sanitizeInstagram(ig = {}) {
  const out = {};
  if (ig.igUserId != null) out.igUserId = String(ig.igUserId).trim();
  if (ig.pageId != null) out.pageId = String(ig.pageId).trim();
  if (ig.pageAccessToken != null) out.pageAccessToken = String(ig.pageAccessToken).trim();
  if (ig.longLivedUserToken != null)
    out.longLivedUserToken = String(ig.longLivedUserToken).trim();
  if (ig.postToFacebook != null) out.postToFacebook = !!ig.postToFacebook;
  return out;
}

function sanitizeShopify(shop = {}) {
  const out = {};
  if (shop.storeDomain != null)
    out.storeDomain = String(shop.storeDomain).trim().replace(/^https?:\/\//, "");
  if (shop.adminToken != null) out.adminToken = String(shop.adminToken).trim();
  if (shop.apiVersion != null) out.apiVersion = String(shop.apiVersion).trim();
  return out;
}

function sanitizeVoice(voice = {}) {
  const out = {};
  if (voice.tone != null) out.tone = String(voice.tone).slice(0, 300);
  if (voice.audience != null) out.audience = String(voice.audience).slice(0, 300);
  if (voice.currency != null) out.currency = String(voice.currency).trim().slice(0, 8);
  if (voice.language != null) out.language = String(voice.language).trim().slice(0, 8);
  if (Array.isArray(voice.hashtags)) {
    out.hashtags = voice.hashtags
      .map((h) => String(h).trim())
      .filter(Boolean)
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .slice(0, 30);
  }
  if (Array.isArray(voice.inspo)) {
    out.inspo = voice.inspo
      .map((h) => String(h).trim())
      .filter(Boolean)
      .map((h) => (h.startsWith("@") ? h : `@${h}`))
      .slice(0, 10);
  }
  return out;
}
