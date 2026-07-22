// lib/pinterest.js
// Integración con Pinterest (API v5): OAuth, refresco de tokens, tablero por
// defecto y publicación de pines. Requiere PINTEREST_APP_ID y
// PINTEREST_APP_SECRET en el entorno (app creada en developers.pinterest.com).
import { db } from "./firebase-admin.js";

const API = "https://api.pinterest.com/v5";
export const PINTEREST_SCOPES = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";

function basicAuth() {
  const id = process.env.PINTEREST_APP_ID;
  const secret = process.env.PINTEREST_APP_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Faltan PINTEREST_APP_ID y PINTEREST_APP_SECRET en Vercel. Crea la app en developers.pinterest.com."
    );
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function pinApi(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Pinterest: ${data.message || data.error || `error ${res.status}`}`);
  }
  return data;
}

/** URL del diálogo de autorización de Pinterest. */
export function pinterestAuthUrl(redirectUri, state) {
  const id = process.env.PINTEREST_APP_ID;
  if (!id) throw new Error("Falta PINTEREST_APP_ID en Vercel.");
  const u = new URL("https://www.pinterest.com/oauth/");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", PINTEREST_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Intercambia el code por tokens. */
export async function exchangeCode(code, redirectUri) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pinterest token: ${data.message || data.error || res.status}`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

/** Refresca el access token de una marca y lo guarda. */
export async function refreshPinterestToken(brandId) {
  const ref = db.collection("brands").doc(brandId);
  const snap = await ref.get();
  const pin = snap.data()?.pinterest;
  if (!pin?.refreshToken) throw new Error("La marca no tiene refresh token de Pinterest.");
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: pin.refreshToken,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pinterest refresh: ${data.message || res.status}`);
  await ref.set(
    {
      pinterest: {
        ...pin,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || pin.refreshToken,
        tokenUpdatedAt: Date.now(),
      },
    },
    { merge: true }
  );
  return data.access_token;
}

/** Busca (o crea) el tablero donde publicará Sincro. */
export async function ensureBoard(token, preferredName) {
  const boards = await pinApi("/boards?page_size=50", { token });
  const list = boards.items || [];
  const match =
    list.find((b) => b.name?.toLowerCase() === preferredName.toLowerCase()) || list[0];
  if (match) return { id: match.id, name: match.name };
  const created = await pinApi("/boards", {
    method: "POST",
    token,
    body: { name: preferredName, privacy: "PUBLIC" },
  });
  return { id: created.id, name: created.name };
}

/** Datos de la cuenta conectada. */
export async function getAccount(token) {
  return pinApi("/user_account", { token });
}

/**
 * Publica un post como pin. Usa el caption como descripción y el producto
 * como enlace. Devuelve el id del pin.
 */
export async function publishToPinterest(post, brand) {
  const pin = brand.pinterest;
  if (!pin?.accessToken || !pin?.boardId) {
    throw new Error("Pinterest no está conectado en esta marca.");
  }
  if (!post.imageUrl) throw new Error("El post no tiene imagen para el pin.");
  const title = (post.productTitle || post.altText || brand.name || "").slice(0, 100);
  const description = String(post.caption || "").slice(0, 780);
  const created = await pinApi("/pins", {
    method: "POST",
    token: pin.accessToken,
    body: {
      board_id: pin.boardId,
      title,
      description,
      ...(post.productUrl ? { link: post.productUrl } : {}),
      media_source: { source_type: "image_url", url: post.imageUrl },
    },
  });
  return created.id;
}
