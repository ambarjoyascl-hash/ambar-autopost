// lib/store.js
// Catálogo del live guardado en Vercel Blob (un solo archivo JSON).
// Sin base de datos aparte: las piezas viven en catalog/items.json y las
// fotos/videos como blobs individuales. Lectura siempre fresca (list()).
import { list, put, del } from "@vercel/blob";

const CATALOG = "catalog/items.json";
const REACTIONS = "catalog/reactions.json";
const CHAT = "catalog/chat.json";

export async function getItems() {
  try {
    const { blobs } = await list({ prefix: CATALOG });
    const b = blobs.find((x) => x.pathname === CATALOG) || blobs[0];
    if (!b) return [];
    const r = await fetch(b.url, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export async function saveItems(items) {
  await put(CATALOG, JSON.stringify(items), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function deleteMedia(url) {
  try {
    if (url) await del(url);
  } catch (e) {
    /* ignore */
  }
}

// ── Reacciones (❤️🔥) — se guardan aparte para no tocar el catálogo ──
export async function getReactions() {
  try {
    const { blobs } = await list({ prefix: REACTIONS });
    const b = blobs.find((x) => x.pathname === REACTIONS) || blobs[0];
    if (!b) return {};
    const r = await fetch(b.url, { cache: "no-store" });
    if (!r.ok) return {};
    const d = await r.json();
    return d && typeof d === "object" ? d : {};
  } catch (e) {
    return {};
  }
}

export async function saveReactions(map) {
  await put(REACTIONS, JSON.stringify(map), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

// ── Chat en vivo ──
export async function getChat() {
  try {
    const { blobs } = await list({ prefix: CHAT });
    const b = blobs.find((x) => x.pathname === CHAT) || blobs[0];
    if (!b) return [];
    const r = await fetch(b.url, { cache: "no-store" });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

export async function saveChat(messages) {
  await put(CHAT, JSON.stringify(messages), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}
