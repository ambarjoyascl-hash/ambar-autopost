// lib/meta-oauth.js
// "Conectar con Facebook": flujo OAuth que extrae solo las credenciales de
// Instagram de una marca (igUserId, pageId, pageAccessToken, longLivedUserToken)
// sin que el usuario tenga que usar el Graph API Explorer.
//
// Flujo (vive en /api/brands/facebook-oauth para no gastar otra función):
//   1. POST {brandId}  (autenticado)  → devuelve la URL del diálogo de Facebook
//      con un `state` firmado (HMAC) que identifica la marca.
//   2. Facebook redirige a GET ?code&state → intercambiamos el code por un
//      token largo, listamos las Páginas con IG vinculado y:
//        - si hay una sola, guardamos las credenciales en la marca y listo;
//        - si hay varias, mostramos un selector (los links llevan otro state
//          firmado y el token queda pendiente en el doc de la marca).
//   3. GET ?pick=PAGE_ID&state → completa con la página elegida.
import crypto from "node:crypto";
import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";
import { checkAuth, readJson, requireBrand } from "./api-helpers.js";

const GRAPH_VERSION = process.env.GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
// Este flujo entra por Facebook Login y saca la cuenta de IG desde /me/accounts,
// así que los permisos son los de la familia `instagram_*`, NO los
// `instagram_business_*` (esos son de "Instagram API con Instagram Login", un
// flujo distinto donde el usuario entra con su cuenta de Instagram).
const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
].join(",");
const STATE_TTL_MS = 15 * 60 * 1000;

function signingSecret() {
  const s = process.env.CRON_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error("Falta CRON_SECRET o APP_PASSWORD para firmar el state.");
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function makeState(payload) {
  const body = b64url(JSON.stringify({ ...payload, ts: Date.now() }));
  const mac = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state = "") {
  const [body, mac] = String(state).split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.ts || Date.now() - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function redirectUri(req) {
  return `https://${req.headers.host}/api/brands/facebook-oauth`;
}

/** URL del diálogo de Facebook para una marca.
 *  `reauth` añade `auth_type=reauthenticate`: obliga a Facebook a volver a pedir
 *  credenciales, que es lo único que ofrece Meta para salir del perfil que el
 *  navegador ya tenía abierto sin cerrar sesión a mano. No garantiza que
 *  aparezca el selector de cuentas, por eso el aviso sigue recomendando
 *  incógnito. */
function dialogUrl(req, brandId, { reauth = false } = {}) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri(req));
  // Facebook Login for Business exige una "configuración" (config_id) que
  // agrupa los permisos; con ella no se pasa `scope`. Si no está definida,
  // caemos al scope clásico (apps con Facebook Login normal).
  if (process.env.META_CONFIG_ID) {
    url.searchParams.set("config_id", process.env.META_CONFIG_ID);
  } else {
    url.searchParams.set("scope", SCOPES);
  }
  if (reauth) url.searchParams.set("auth_type", "reauthenticate");
  url.searchParams.set("state", makeState({ brandId }));
  return url.toString();
}

/** Enlace de vuelta al flujo con los parámetros que haga falta (pick, confirm…). */
function selfUrl(req, brandId, params = {}) {
  const u = new URL(redirectUri(req));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("state", makeState({ brandId }));
  return u.toString();
}

const BOTON = (href, text) =>
  `<a href="${href}" style="display:inline-block;margin-top:14px;padding:12px 26px;border-radius:999px;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:700">${text}</a>`;

async function graphGet(path, params) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Error ${res.status} de la API de Meta.`);
  }
  return data;
}

export function htmlPage(res, status, title, bodyHtml) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — Autopost</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#faf8f4;color:#2c2a26;
       display:flex;min-height:100vh;align-items:center;justify-content:center;line-height:1.6}
  .card{background:#fff;border:1px solid #e5e0d8;border-radius:14px;padding:28px 32px;max-width:440px;
        text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}
  h1{font-size:20px;margin:0 0 8px}
  p{margin:8px 0;font-size:14px;color:#6b675e}
  a.pagelink{display:block;margin:8px 0;padding:10px 14px;border:1px solid #e5e0d8;border-radius:10px;
             text-decoration:none;color:#2c2a26;font-weight:600}
  a.pagelink:hover{border-color:#b98e4e}
  @media (prefers-color-scheme: dark){
    body{background:#191713;color:#eae6de}
    .card{background:#211e19;border-color:#37332b}
    p{color:#9c968a}
    a.pagelink{border-color:#37332b;color:#eae6de}
  }
</style></head><body><div class="card">${bodyHtml}</div></body></html>`);
}

/** Guarda las credenciales de IG en la marca (escritura directa, sin sanitizar
 *  postToFacebook ni pisar otros campos) y limpia el token pendiente. */
async function saveCredentials(
  brandId,
  { igUserId, pageId, pageAccessToken, longLivedUserToken, username, fbUserId, fbUserName }
) {
  await db.collection("brands").doc(brandId).set(
    {
      instagram: {
        igUserId: String(igUserId),
        pageId: String(pageId),
        pageAccessToken,
        longLivedUserToken,
        username: username || "",
        // Perfil de Facebook con el que se autorizó. Es la huella que permite
        // detectar en la próxima reconexión que el navegador entró con otro
        // perfil (así fue como Ámbar y MØLK acabaron en la misma cuenta).
        fbUserId: fbUserId ? String(fbUserId) : "",
        fbUserName: fbUserName || "",
        tokenUpdatedAt: Date.now(),
      },
      pendingOauth: null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

function pagesWithIg(accounts) {
  return (accounts.data || []).filter((p) => p.instagram_business_account?.id);
}

/** El @usuario de la cuenta de IG, para que se vea a quién se conectó de verdad
 *  (el nombre de la Página de Facebook suele no coincidir con el de Instagram). */
async function igUsername(igUserId, pageAccessToken) {
  try {
    const data = await graphGet(`/${igUserId}`, {
      fields: "username",
      access_token: pageAccessToken,
    });
    return data.username || "";
  } catch (_) {
    return ""; // informativo: si falla, no bloquea la conexión
  }
}

/**
 * ¿Otra marca del mismo dueño ya está usando esta cuenta de Instagram?
 * Pasó en agosto de 2026: Ámbar y MOLK quedaron apuntando al mismo igUserId
 * porque el navegador tenía la sesión de un solo perfil de Facebook.
 * Se filtra en memoria para no necesitar un índice compuesto.
 */
async function brandUsingIg(igUserId, ownerUid, exceptBrandId) {
  if (!ownerUid) return null;
  const snap = await db.collection("brands").where("ownerUid", "==", ownerUid).get();
  for (const d of snap.docs) {
    if (d.id === exceptBrandId) continue;
    if (String(d.data()?.instagram?.igUserId || "") === String(igUserId)) {
      return { id: d.id, name: d.data()?.name || d.id };
    }
  }
  return null;
}

async function savePending(brandId, longLivedUserToken, candidates, profile = {}) {
  await db.collection("brands").doc(brandId).set(
    {
      pendingOauth: {
        longLivedUserToken,
        fbUserId: profile.id ? String(profile.id) : "",
        fbUserName: profile.name || "",
        ts: Date.now(),
        pages: candidates.map((p) => ({
          id: p.id,
          name: p.name,
          access_token: p.access_token,
          instagram_business_account: { id: p.instagram_business_account.id },
        })),
      },
    },
    { merge: true }
  );
}

/**
 * Comprueba que Facebook haya concedido de verdad el permiso de publicar.
 * En agosto de 2026 la configuración de Login for Business tenía marcados los
 * permisos de publicidad (ads_*, catalog_management) y ninguno de Instagram: la
 * conexión se veía perfecta y recién fallaba días después, al publicar, con un
 * "(#10) Application does not have permission for this action".
 */
async function faltanPermisos(longLivedUserToken, brand) {
  try {
    const data = await graphGet("/me/permissions", { access_token: longLivedUserToken });
    const ok = new Set(
      (data.data || []).filter((p) => p.status === "granted").map((p) => p.permission)
    );
    const necesarios = ["instagram_basic", "instagram_content_publish"];
    // Solo se exige si la marca además publica en la Página: sin este permiso
    // Facebook responde "(#200) The permission(s) pages_manage_posts are not
    // available" en cada post con destino Facebook.
    if (brand?.instagram?.postToFacebook) necesarios.push("pages_manage_posts");
    return necesarios.filter((p) => !ok.has(p));
  } catch (_) {
    return []; // si no se puede comprobar, no bloqueamos la conexión
  }
}

async function finishWithPage(res, brand, page, pending) {
  const longLivedUserToken = pending.longLivedUserToken;
  const igUserId = page.instagram_business_account.id;
  const username = await igUsername(igUserId, page.access_token);
  const faltan = await faltanPermisos(longLivedUserToken, brand);
  await saveCredentials(brand.id, {
    igUserId,
    pageId: page.id,
    pageAccessToken: page.access_token,
    longLivedUserToken,
    username,
    fbUserId: pending.fbUserId,
    fbUserName: pending.fbUserName,
  });
  const handle = username
    ? `<p style="font-size:22px;font-weight:800;color:#1e3a8a;margin:14px 0 2px">@${username}</p>
       <p>es la cuenta que quedó publicando por <b>${brand.name}</b>.</p>`
    : `<p>La página <b>${page.name}</b> quedó vinculada a la marca <b>${brand.name}</b>.</p>`;
  const perfil = pending.fbUserName
    ? `<p style="font-size:12.5px">Autorizado desde el perfil de Facebook <b>${pending.fbUserName}</b> · página <b>${page.name}</b>.</p>`
    : "";
  const aviso = faltan.length
    ? `<p style="background:#fdf1e7;border:1px solid #e8c9a8;border-radius:10px;padding:12px;margin:14px 0;font-size:13px;color:#8a5a1e">
         <b>⚠️ Conectada, pero no va a poder publicar.</b><br />
         Facebook no concedió: <b>${faltan.join(", ")}</b>. En tu app de Meta, en la
         configuración de Facebook Login for Business, marca esos permisos y vuelve
         a conectar esta marca.</p>`
    : "";
  return htmlPage(
    res,
    200,
    "Instagram conectado",
    `<h1>✅ ¡Instagram conectado!</h1>
     ${handle}
     ${perfil}
     ${aviso}
     ${BOTON("/", "Volver a la plataforma")}`
  );
}

/** Resumen de a quién se va a conectar la marca, antes de guardar nada.
 *  Es la pantalla que evita el enredo de agosto de 2026: el diálogo de Facebook
 *  no pregunta con qué perfil entras, usa en silencio el que tenga sesión
 *  abierta, así que aquí se muestra y se pide confirmación explícita. */
async function confirmPage(res, req, brand, page, pending, extraHtml = "") {
  const igUserId = page.instagram_business_account.id;
  const username = await igUsername(igUserId, page.access_token);
  const perfil = pending.fbUserName || "(perfil desconocido)";
  return htmlPage(
    res,
    200,
    "Confirma la cuenta",
    `<h1>¿Es esta la cuenta de ${brand.name}?</h1>
     ${extraHtml}
     <div style="text-align:left;background:#f6f4ef;border:1px solid #e5e0d8;border-radius:12px;padding:14px 16px;margin:16px 0;font-size:13.5px">
       <div style="margin-bottom:6px">Perfil de Facebook: <b>${perfil}</b></div>
       <div style="margin-bottom:6px">Página: <b>${page.name}</b></div>
       <div>Instagram: <b style="color:#1e3a8a">${username ? "@" + username : "(sin nombre de usuario)"}</b></div>
     </div>
     <p style="font-size:12.5px">Facebook no pregunta con qué perfil entras: usa el que tengas abierto en
     este navegador. Revisa que sea el de <b>${brand.name}</b> antes de continuar.</p>
     <a class="pagelink" href="${selfUrl(req, brand.id, { switch: "1" })}">No, quiero usar otra cuenta</a>
     ${BOTON(selfUrl(req, brand.id, { pick: page.id, confirm: "1" }), "Sí, conectar esta cuenta")}`
  );
}

/** La marca ya se había conectado con OTRO perfil de Facebook. */
async function mismatchPage(res, req, brand, page, pending) {
  const antes = brand.instagram?.fbUserName || "otro perfil";
  return confirmPage(
    res, req, brand, page, pending,
    `<p style="background:#fdf1e7;border:1px solid #e8c9a8;border-radius:10px;padding:12px;margin:14px 0;font-size:13px;color:#8a5a1e">
       <b>⚠️ Ojo:</b> <b>${brand.name}</b> se conectó antes con el perfil de Facebook
       <b>${antes}</b>, y ahora entraste como <b>${pending.fbUserName || "otro"}</b>.
       Si es un error, cambia de cuenta antes de continuar.</p>`
  );
}

/**
 * Guardas antes de escribir en la marca, en orden:
 *   1. ¿entraste con un perfil de Facebook distinto al de la última vez?
 *   2. ¿ese Instagram ya lo usa otra marca del mismo dueño?
 *   3. confirmación explícita, salvo que sea exactamente la misma conexión que ya tenía.
 * `force` (venir del "conectarla igual") salta las tres.
 */
async function proceedWithPage(res, req, brand, page, pending, { force, confirm }) {
  const igUserId = String(page.instagram_business_account.id);
  const antes = brand.instagram || {};
  const mismaDeSiempre =
    String(antes.igUserId || "") === igUserId &&
    String(antes.pageId || "") === String(page.id) &&
    !!antes.fbUserId &&
    String(antes.fbUserId) === String(pending.fbUserId || "");

  if (!force) {
    // El aviso de perfil distinto ya viene incrustado en la pantalla de
    // confirmación, así que `confirm` lo da por leído; el de cuenta repetida
    // NO, ese solo se salta con "conectarla igual".
    if (
      !confirm &&
      antes.fbUserId &&
      pending.fbUserId &&
      String(antes.fbUserId) !== String(pending.fbUserId)
    ) {
      return mismatchPage(res, req, brand, page, pending);
    }
    const other = await brandUsingIg(igUserId, brand.ownerUid, brand.id);
    if (other) return conflictPage(res, req, brand, page, other);
    if (!confirm && !mismaDeSiempre) return confirmPage(res, req, brand, page, pending);
  }
  return finishWithPage(res, brand, page, pending);
}

/** Aviso cuando la cuenta elegida ya la usa otra marca: casi siempre significa
 *  que el navegador tenía abierto el perfil de Facebook equivocado. */
function conflictPage(res, req, brand, page, other) {
  return htmlPage(
    res,
    409,
    "Cuenta repetida",
    `<h1>⚠️ Esa cuenta ya es de otra marca</h1>
     <p>El Instagram de la página <b>${page.name}</b> ya está conectado en
     <b>${other.name}</b>. Si guardamos esto, las dos marcas publicarían en la misma cuenta.</p>
     <p>Lo más probable es que Facebook haya usado el perfil que ya estaba abierto en este
     navegador. Entra con el perfil de <b>${brand.name}</b> y vuelve a intentarlo.</p>
     <a class="pagelink" href="${selfUrl(req, brand.id, { switch: "1" })}">Cambiar de cuenta de Facebook</a>
     <a class="pagelink" href="${selfUrl(req, brand.id, { pick: page.id, force: "1" })}">Es correcta, conectarla igual</a>
     ${BOTON("/", "Volver a la plataforma")}`
  );
}

export async function handleFacebookOauth(req, res) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  // ── 1) Inicio del flujo (desde el panel, autenticado) ──────────────────
  if (req.method === "POST") {
    const user = await checkAuth(req, res);
    if (!user) return;
    if (!appId || !appSecret) {
      return res.status(500).json({
        error:
          "Faltan META_APP_ID y META_APP_SECRET en Vercel. Créalos en tu app de " +
          "Meta (developers.facebook.com → tu app → Settings → Basic).",
      });
    }
    const { brandId } = await readJson(req);
    const brand = await requireBrand(req, res, user, brandId);
    if (!brand) return;

    return res.status(200).json({ url: dialogUrl(req, brandId) });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  // ── Redirecciones del navegador (sin headers de sesión) ────────────────
  const {
    code, state, pick, force, confirm, switch: doSwitch,
    error_description: errDesc, error: fbError,
  } = req.query;
  const payload = verifyState(state);
  if (!payload?.brandId) {
    return htmlPage(res, 400, "Enlace inválido",
      `<h1>Enlace inválido o expirado</h1><p>Vuelve al panel y pulsa «Conectar con Facebook» de nuevo.</p>`);
  }
  const brand = await getBrand(payload.brandId);
  if (!brand) {
    return htmlPage(res, 404, "Marca no encontrada",
      `<h1>Marca no encontrada</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }

  if (fbError) {
    return htmlPage(res, 400, "Permiso denegado",
      `<h1>Facebook no autorizó la conexión</h1><p>${errDesc || fbError}</p>
       <p>Vuelve al panel e inténtalo de nuevo aceptando los permisos.</p>`);
  }

  try {
    // ── 4) "Quiero usar otra cuenta": vuelta al diálogo pidiendo credenciales
    //       otra vez, más las instrucciones por si Facebook no lo respeta.
    if (doSwitch) {
      return htmlPage(res, 200, "Cambiar de cuenta",
        `<h1>Entra con el Facebook de ${brand.name}</h1>
         <p>Facebook conecta el perfil que tengas abierto en este navegador, sin preguntar.
         Para elegir otro:</p>
         <p style="text-align:left;font-size:13px">
           <b>1.</b> Abre una <b>ventana de incógnito</b> (Ctrl+Mayús+N).<br />
           <b>2.</b> Entra a Facebook con el perfil de <b>${brand.name}</b>.<br />
           <b>3.</b> Pega ahí este enlace y autoriza.
         </p>
         <p style="font-size:12.5px;word-break:break-all;background:#f6f4ef;border:1px solid #e5e0d8;border-radius:10px;padding:10px">${dialogUrl(req, brand.id)}</p>
         ${BOTON(dialogUrl(req, brand.id, { reauth: true }), "O reintentar aquí pidiendo la contraseña")}`);
    }

    // ── 3) El usuario eligió una página del selector ─────────────────────
    if (pick) {
      const pending = brand.pendingOauth;
      if (!pending?.longLivedUserToken || Date.now() - (pending.ts || 0) > STATE_TTL_MS) {
        return htmlPage(res, 400, "Sesión expirada",
          `<h1>La conexión expiró</h1><p>Vuelve al panel y pulsa «Conectar con Facebook» de nuevo.</p>`);
      }
      const page = (pending.pages || []).find((p) => p.id === pick);
      if (!page) {
        return htmlPage(res, 400, "Página no válida",
          `<h1>Página no válida</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
      }
      return await proceedWithPage(res, req, brand, page, pending, { force, confirm });
    }

    // ── 2) Callback con el code de Facebook ──────────────────────────────
    if (!code) {
      return htmlPage(res, 400, "Falta el código",
        `<h1>Falta el código de Facebook</h1><p>Vuelve al panel e inténtalo de nuevo.</p>`);
    }

    const shortTok = await graphGet("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri(req),
      code,
    });
    const longTok = await graphGet("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortTok.access_token,
    });
    const longLivedUserToken = longTok.access_token;

    const accounts = await graphGet("/me/accounts", {
      access_token: longLivedUserToken,
      fields: "id,name,access_token,instagram_business_account",
      limit: "100",
    });
    const candidates = pagesWithIg(accounts);
    // Con qué perfil de Facebook se autorizó de verdad: el diálogo no lo
    // pregunta, así que es el dato que hay que enseñar y guardar.
    const profile = await graphGet("/me", { fields: "id,name", access_token: longLivedUserToken })
      .catch(() => ({}));

    if (!candidates.length) {
      return htmlPage(res, 400, "Sin Instagram vinculado",
        `<h1>No encontramos un Instagram profesional</h1>
         <p>Entraste con el perfil de Facebook <b>${profile.name || "(desconocido)"}</b>, y ninguna
         de sus Páginas tiene una cuenta de Instagram Business/Creator vinculada.</p>
         <p>Si ese no es el perfil de <b>${brand.name}</b>, cambia de cuenta. Si sí lo es, vincula
         el Instagram a la Página en Meta Business Suite y vuelve a intentarlo.</p>
         <a class="pagelink" href="${selfUrl(req, brand.id, { switch: "1" })}">Cambiar de cuenta de Facebook</a>`);
    }

    // Se guarda siempre lo pendiente: lo usan el selector y todas las pantallas
    // de aviso (todas vuelven con ?pick=).
    await savePending(payload.brandId, longLivedUserToken, candidates, profile);
    const pending = {
      longLivedUserToken,
      fbUserId: profile.id || "",
      fbUserName: profile.name || "",
    };

    if (candidates.length === 1) {
      return await proceedWithPage(res, req, brand, candidates[0], pending, {});
    }

    // Varias páginas → selector, marcando las que ya usa otra marca.
    const links = [];
    for (const p of candidates) {
      const other = await brandUsingIg(
        p.instagram_business_account.id, brand.ownerUid, brand.id);
      const tag = other
        ? `<div style="font-weight:400;font-size:12px;color:#9c968a">ya conectada en ${other.name}</div>`
        : "";
      links.push(
        `<a class="pagelink" href="${selfUrl(req, brand.id, { pick: p.id })}">${p.name}${tag}</a>`
      );
    }
    return htmlPage(res, 200, "Elige la página",
      `<h1>¿Qué página es de ${brand.name}?</h1>
       <p>Entraste como <b>${profile.name || "(perfil desconocido)"}</b>. Elige la Página de
       Facebook cuyo Instagram debe publicar por esta marca:</p>${links.join("")}
       <a class="pagelink" href="${selfUrl(req, brand.id, { switch: "1" })}">Ninguna: quiero usar otra cuenta</a>`);
  } catch (err) {
    return htmlPage(res, 500, "Error",
      `<h1>Algo salió mal</h1><p>${String(err.message || err)}</p>
       <p>Vuelve al panel e inténtalo de nuevo.</p>`);
  }
}
