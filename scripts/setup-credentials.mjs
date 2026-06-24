// scripts/setup-credentials.mjs
//
// Automatiza los pasos 4–7 de scripts/GET_CREDENTIALS.md.
// Tú solo haces la parte interactiva (generar el TOKEN CORTO en el Graph API
// Explorer) y este script hace el resto:
//   4) Intercambia el token corto → long-lived user token (60 días)
//   5) Obtiene la Página y su Page Access Token (no expira)
//   6) Obtiene el IG User ID ligado a esa página
//   7) Guarda todo en Firestore en el doc meta/credentials
//
// ── Requisitos ─────────────────────────────────────────────────────
// Variables de entorno (las mismas del deploy; crea un .env local o expórtalas):
//   META_APP_ID, META_APP_SECRET
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//   GRAPH_VERSION (opcional, por defecto v21.0)
//
// ── Uso ────────────────────────────────────────────────────────────
//   npm install firebase-admin
//   node scripts/setup-credentials.mjs "EAAG...tu-token-corto..."
//
// Opcional: si tienes varias páginas y quieres forzar una en concreto:
//   node scripts/setup-credentials.mjs "EAAG..." --page-id 1029xxxxxxxxxx
//
// El script NO imprime los tokens completos (solo un preview), para no filtrarlos.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v21.0"}`;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function mask(token) {
  if (!token) return "(vacío)";
  return `${token.slice(0, 8)}…${token.slice(-4)} (${token.length} chars)`;
}

// ── Parseo de argumentos ──────────────────────────────────────────
const args = process.argv.slice(2);
const shortToken = args.find((a) => !a.startsWith("--"));
const pageIdFlagIdx = args.indexOf("--page-id");
const forcedPageId = pageIdFlagIdx !== -1 ? args[pageIdFlagIdx + 1] : null;

if (!shortToken) {
  fail(
    'Falta el token corto.\nUso: node scripts/setup-credentials.mjs "TOKEN_CORTO" [--page-id PAGE_ID]'
  );
}

// ── Validación de env ─────────────────────────────────────────────
const required = [
  "META_APP_ID",
  "META_APP_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  fail(`Faltan variables de entorno: ${missing.join(", ")}`);
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }
  return data;
}

async function main() {
  // ── Paso 4: token largo ─────────────────────────────────────────
  console.log("→ Paso 4: intercambiando token corto por long-lived user token…");
  const exchange = await getJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(process.env.META_APP_ID)}` +
      `&client_secret=${encodeURIComponent(process.env.META_APP_SECRET)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`
  );
  const longLivedUserToken = exchange.access_token;
  if (!longLivedUserToken) fail("No se recibió access_token al intercambiar.");
  console.log(`   ✓ long-lived user token: ${mask(longLivedUserToken)}`);

  // ── Paso 5: página + page token ─────────────────────────────────
  console.log("→ Paso 5: obteniendo páginas y page access token…");
  const pages = await getJson(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${longLivedUserToken}`
  );
  const list = pages.data || [];
  if (!list.length) {
    fail(
      "Tu usuario no administra ninguna página. Verifica que seas Admin de la " +
        "Página de Ámbar y que el token tenga el scope pages_show_list."
    );
  }

  let page;
  if (forcedPageId) {
    page = list.find((p) => p.id === forcedPageId);
    if (!page) fail(`No encontré la página ${forcedPageId} entre las que administras.`);
  } else if (list.length === 1) {
    page = list[0];
  } else {
    console.log("\n   Administras varias páginas:");
    for (const p of list) console.log(`     - ${p.name}  (id: ${p.id})`);
    fail(
      "Hay más de una página. Vuelve a correr el script agregando " +
        "--page-id PAGE_ID con la página de Ámbar."
    );
  }

  const pageId = page.id;
  const pageAccessToken = page.access_token;
  console.log(`   ✓ página: ${page.name} (id: ${pageId})`);
  console.log(`   ✓ page access token: ${mask(pageAccessToken)}`);

  // ── Paso 6: IG user id ──────────────────────────────────────────
  console.log("→ Paso 6: obteniendo el IG User ID ligado a la página…");
  const igInfo = await getJson(
    `${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
  );
  const igUserId = igInfo.instagram_business_account?.id;
  if (!igUserId) {
    fail(
      "La página no tiene una cuenta de Instagram profesional vinculada. " +
        "Conecta el IG de Ámbar a esta página en Meta Business Suite y reintenta."
    );
  }
  console.log(`   ✓ igUserId: ${igUserId}`);

  // ── Paso 7: guardar en Firestore ────────────────────────────────
  console.log("→ Paso 7: guardando en Firestore (meta/credentials)…");
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = getFirestore();
  await db.doc("meta/credentials").set(
    {
      igUserId,
      pageId,
      pageAccessToken,
      longLivedUserToken,
      tokenUpdatedAt: Date.now(),
    },
    { merge: true }
  );

  console.log("\n✅ Listo. Credenciales guardadas en meta/credentials.");
  console.log("   Ahora la app ya puede publicar. Haz la prueba de humo del DEPLOY.md.\n");
}

main().catch((err) => fail(String(err.message || err)));
