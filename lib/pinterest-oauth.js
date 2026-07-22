// lib/pinterest-oauth.js
// Flujo "Conectar Pinterest" (vive en /api/brands/pinterest-oauth, id reservado).
//   POST {brandId} (autenticado) → URL del diálogo de Pinterest con state firmado.
//   GET ?code&state → intercambia tokens, elige/crea el tablero y guarda todo.
import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";
import { checkAuth, readJson, requireBrand } from "./api-helpers.js";
import { makeState, verifyState, htmlPage } from "./meta-oauth.js";
import { pinterestAuthUrl, exchangeCode, ensureBoard, getAccount } from "./pinterest.js";

function redirectUri(req) {
  return `https://${req.headers.host}/api/brands/pinterest-oauth`;
}

export async function handlePinterestOauth(req, res) {
  if (req.method === "POST") {
    const user = await checkAuth(req, res);
    if (!user) return;
    const { brandId } = await readJson(req);
    const brand = await requireBrand(req, res, user, brandId);
    if (!brand) return;
    try {
      const url = pinterestAuthUrl(redirectUri(req), makeState({ brandId, pin: 1 }));
      return res.status(200).json({ url });
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const { code, state, error: pinError } = req.query;
  const payload = verifyState(state);
  if (!payload?.brandId) {
    return htmlPage(res, 400, "Enlace inválido",
      `<h1>Enlace inválido o expirado</h1><p>Vuelve al panel y pulsa «Conectar Pinterest» de nuevo.</p>`);
  }
  const brand = await getBrand(payload.brandId);
  if (!brand) {
    return htmlPage(res, 404, "Marca no encontrada",
      `<h1>Marca no encontrada</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }
  if (pinError) {
    return htmlPage(res, 400, "Permiso denegado",
      `<h1>Pinterest no autorizó la conexión</h1><p>${pinError}</p><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }
  if (!code) {
    return htmlPage(res, 400, "Falta el código",
      `<h1>Falta el código de Pinterest</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }

  try {
    const tokens = await exchangeCode(code, redirectUri(req));
    const account = await getAccount(tokens.access_token).catch(() => ({}));
    const board = await ensureBoard(tokens.access_token, brand.name);
    await db.collection("brands").doc(payload.brandId).set(
      {
        pinterest: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenUpdatedAt: Date.now(),
          username: account.username || "",
          boardId: board.id,
          boardName: board.name,
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    return htmlPage(res, 200, "Pinterest conectado",
      `<h1>✅ ¡Pinterest conectado!</h1>
       <p>La cuenta <b>@${account.username || "—"}</b> quedó vinculada a <b>${brand.name}</b>.
       Los pines se publicarán en el tablero <b>${board.name}</b>.</p>
       <p>Ya puedes cerrar esta pestaña y recargar el panel.</p>`);
  } catch (err) {
    return htmlPage(res, 500, "Error",
      `<h1>Algo salió mal</h1><p>${String(err.message || err)}</p><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }
}
