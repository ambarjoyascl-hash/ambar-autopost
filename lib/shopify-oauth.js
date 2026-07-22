// lib/shopify-oauth.js
// "Conectar Shopify" con un clic (OAuth de la app del Dev Dashboard).
//   POST {brandId, shop} (autenticado) → URL de autorización en la tienda.
//   GET ?code&shop&state → intercambia el code por un token offline y lo
//   guarda como shopify.adminToken de la marca.
// Requiere SHOPIFY_APP_CLIENT_ID y SHOPIFY_APP_SECRET (app "sincro" del
// dev dashboard, con este redirect URI configurado y publicado).
import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";
import { checkAuth, readJson, requireBrand } from "./api-helpers.js";
import { makeState, verifyState, htmlPage } from "./meta-oauth.js";

const SCOPES = "read_products";

function creds() {
  const id = process.env.SHOPIFY_APP_CLIENT_ID;
  const secret = process.env.SHOPIFY_APP_SECRET;
  if (!id || !secret) {
    throw new Error("Faltan SHOPIFY_APP_CLIENT_ID y SHOPIFY_APP_SECRET en Vercel.");
  }
  return { id, secret };
}

function redirectUri(req) {
  return `https://${req.headers.host}/api/brands/shopify-oauth`;
}

/** Normaliza "mi tienda", "https://x.myshopify.com/", "x" → "x.myshopify.com" */
export function normalizeShop(input = "") {
  let s = String(input).trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!s) return "";
  if (!s.endsWith(".myshopify.com")) {
    s = s.replace(/\.myshopify\.com.*$/, "");
    s = `${s}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(s)) return "";
  return s;
}

export async function handleShopifyOauth(req, res) {
  if (req.method === "POST") {
    const user = await checkAuth(req, res);
    if (!user) return;
    const { brandId, shop } = await readJson(req);
    const brand = await requireBrand(req, res, user, brandId);
    if (!brand) return;
    const domain = normalizeShop(shop || brand.shopify?.storeDomain);
    if (!domain) {
      return res.status(400).json({
        error: "Escribe el dominio de la tienda (ej: mi-tienda.myshopify.com).",
      });
    }
    try {
      const { id } = creds();
      const u = new URL(`https://${domain}/admin/oauth/authorize`);
      u.searchParams.set("client_id", id);
      u.searchParams.set("scope", SCOPES);
      u.searchParams.set("redirect_uri", redirectUri(req));
      u.searchParams.set("state", makeState({ brandId, shop: domain }));
      return res.status(200).json({ url: u.toString() });
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const { code, shop, state } = req.query;
  const payload = verifyState(state);
  if (!payload?.brandId) {
    return htmlPage(res, 400, "Enlace inválido",
      `<h1>Enlace inválido o expirado</h1><p>Vuelve al panel y pulsa «Conectar Shopify» de nuevo.</p>`);
  }
  const brand = await getBrand(payload.brandId);
  if (!brand) {
    return htmlPage(res, 404, "Marca no encontrada", `<h1>Marca no encontrada</h1>`);
  }
  const domain = normalizeShop(shop || payload.shop);
  if (!code || !domain || domain !== payload.shop) {
    return htmlPage(res, 400, "Datos incompletos",
      `<h1>No se pudo completar la conexión</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }

  try {
    const { id, secret } = creds();
    const tokRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code }),
    });
    const tok = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tok.access_token) {
      throw new Error(tok.error_description || tok.error || `Shopify respondió ${tokRes.status}`);
    }
    await db.collection("brands").doc(payload.brandId).set(
      {
        shopify: {
          ...(brand.shopify || {}),
          storeDomain: domain,
          adminToken: tok.access_token,
          apiVersion: brand.shopify?.apiVersion || "2024-04",
          connectedVia: "oauth",
          tokenUpdatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    return htmlPage(res, 200, "Shopify conectado",
      `<h1>✅ ¡Shopify conectado!</h1>
       <p>La tienda <b>${domain}</b> quedó vinculada a la marca <b>${brand.name}</b>.
       Los planes usarán sus productos y precios exactos.</p>
       <a href="/" style="display:inline-block;margin-top:14px;padding:12px 26px;border-radius:999px;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700">Volver a la plataforma</a>`);
  } catch (err) {
    return htmlPage(res, 500, "Error",
      `<h1>Algo salió mal</h1><p>${String(err.message || err)}</p>
       <p>Verifica que la app "Sincro" del Dev Dashboard tenga el redirect URI correcto y una versión publicada, y vuelve a intentar.</p>`);
  }
}
