// scripts/rehacer-emails.mjs
// Pasa las campañas antiguas al diseño nuevo (logo, colores y tipografía de la
// marca). Pedido de Gina, 14-ago-2026: "arregla todos los emails programados
// para que estén con la cara nueva".
//
// El diseño nuevo no se guarda como HTML: cada campaña guarda sus PIEZAS
// (`bloques`) y el correo se dibuja de nuevo al abrirlo y al enviarlo, con la
// identidad que la marca tenga en ese momento (ver lib/email-template.js).
// Las campañas viejas se generaron antes de que existieran los bloques, así
// que aquí se reconstruyen a partir de lo que sí quedó guardado:
//
//   - encabezado, asunto, texto de vista previa y botón → campos del documento
//   - introducción y cierre                             → del texto plano
//   - productos (foto, título, precio, link)            → del HTML, y luego se
//     refrescan contra Shopify por su "handle", que además corrige los precios
//     que cambiaron y cambia el dominio myshopify.com por el de la marca.
//
// Uso:  node scripts/rehacer-emails.mjs           (muestra lo que haría)
//       node scripts/rehacer-emails.mjs --aplicar (escribe en Firestore)
//
// Requiere firebase-service-account.json en la raíz del repo.

import admin from "firebase-admin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const APLICAR = process.argv.includes("--aplicar");

admin.initializeApp({ credential: admin.credential.cert(require("../firebase-service-account.json")) });
const db = admin.firestore();

/** El "handle" del producto: lo último de la URL. Es la única parte estable. */
function handleDe(url) {
  const m = String(url || "").match(/\/products\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toLowerCase() : "";
}

/** "CLP 25.830" → 25830. Los precios viejos se guardaron ya formateados. */
function precioDeTexto(txt) {
  const solo = String(txt || "").replace(/[^\d]/g, "");
  return solo ? Number(solo) : "";
}

/** Introducción y cierre, sacados del texto plano de la plantilla antigua. */
function textosDelPlano(plain = "") {
  const lineas = String(plain).split("\n");
  const intro = (lineas[2] || "").trim();
  // El cierre es la última línea con contenido, salvo que sea un producto o la
  // línea del botón ("Ver la colección: https://…").
  let cierre = "";
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = (lineas[i] || "").trim();
    if (!l) continue;
    if (l.startsWith("•") || /^[^:]{1,60}:\s*https?:\/\//.test(l)) break;
    cierre = l;
    break;
  }
  return { intro, cierre: cierre === intro ? "" : cierre };
}

/** Productos rescatados del HTML de la plantilla antigua. */
function productosDelHtml(html = "") {
  const fotos = [...html.matchAll(/<img src="([^"]+)"\s+alt="([^"]*)"\s+width="560"/g)];
  const links = [...html.matchAll(/<a href="([^"]+)" style="text-decoration:none;color:inherit;"/g)];
  const titulos = [...html.matchAll(/font-weight:600;color:#1a1a1a;">([^<]+)</g)];
  const precios = [...html.matchAll(/color:#b08d57;margin-top:4px;">([^<]+)</g)];
  const n = Math.max(fotos.length, links.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const imageUrl = fotos[i]?.[1]?.replace(/&amp;/g, "&") || "";
    const productUrl = links[i]?.[1]?.replace(/&amp;/g, "&") || "";
    const title = (titulos[i]?.[1] || fotos[i]?.[2] || "").trim();
    if (!imageUrl && !productUrl) continue;
    out.push({ title, price: precioDeTexto(precios[i]?.[1]), currency: "CLP", imageUrl, productUrl });
  }
  return out;
}

/** Cuántos productos queremos que muestre cada campaña. Las viejas traían UNO
 *  solo: un correo de "llegó lo nuevo" con una sola pieza da muy poco que
 *  mirar y menos donde hacer clic. El texto sigue hablando del principal; el
 *  resto va abajo, en la grilla, como piezas que también pueden gustar. */
const PRODUCTOS_POR_CORREO = 4;

/** Catálogo vigente de la marca, indexado por handle. */
async function catalogoDe(brand) {
  const s = brand.shopify || {};
  if (!s.storeDomain || !s.adminToken) return { mapa: new Map(), origen: "" };
  const ver = s.apiVersion || "2024-04";
  const mapa = new Map();
  let url = `https://${s.storeDomain}/admin/api/${ver}/products.json?limit=250&status=active`;
  for (let pagina = 0; pagina < 8 && url; pagina++) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": s.adminToken } });
    if (!res.ok) break;
    const data = await res.json();
    for (const p of data.products || []) {
      const ficha = {
        title: p.title,
        price: p.variants?.[0]?.price != null ? Number(p.variants[0].price) : "",
        imageUrl: p.image?.src || p.images?.[0]?.src || "",
        handle: p.handle,
        creado: p.created_at,
      };
      if (!ficha.imageUrl) continue; // sin foto no sirve para un correo
      mapa.set(String(p.handle).toLowerCase(), ficha);
    }
    const link = res.headers.get("link") || "";
    const sig = link.match(/<([^>]+)>;\s*rel="next"/);
    url = sig ? sig[1] : "";
  }
  // El dominio público de la marca: los links de los correos no deben salir a
  // ambar-8632.myshopify.com.
  let origen = `https://${s.storeDomain}`;
  try {
    if (brand.websiteUrl) origen = new URL(brand.websiteUrl).origin;
  } catch (_) { /* si está mal escrita, se queda el de Shopify */ }
  // Del más nuevo al más viejo: es el orden con que se rellenan los correos
  // que quedaron cortos.
  const nuevos = [...mapa.values()].sort((a, b) => new Date(b.creado) - new Date(a.creado));
  return { mapa, origen, nuevos };
}

const marcas = new Map();
async function marcaDe(id) {
  if (!marcas.has(id)) {
    const d = await db.collection("brands").doc(id).get();
    const brand = { id, ...d.data() };
    marcas.set(id, { brand, catalogo: await catalogoDe(brand) });
  }
  return marcas.get(id);
}

const snap = await db.collection("emails").get();
console.log(`campañas en la base: ${snap.size}${APLICAR ? "" : "  (simulación: no se escribe nada)"}\n`);

let rehechas = 0, saltadas = 0, sinProductos = 0;
for (const doc of snap.docs) {
  const e = { id: doc.id, ...doc.data() };
  if (e.bloques) { saltadas++; continue; }
  if (e.status === "sent") { saltadas++; continue; }

  const { brand, catalogo } = await marcaDe(e.brandId);
  const { intro, cierre } = textosDelPlano(e.plainText);
  const crudos = productosDelHtml(e.html || "");

  // Se prefiere el dato vigente de Shopify: precios actualizados, foto actual y
  // el link con el dominio de la marca.
  const products = crudos.map((p) => {
    const h = handleDe(p.productUrl);
    const vivo = catalogo.mapa.get(h);
    return {
      title: vivo?.title || p.title,
      price: vivo?.price ?? p.price,
      currency: "CLP",
      imageUrl: vivo?.imageUrl || p.imageUrl,
      productUrl: h ? `${catalogo.origen}/products/${h}` : p.productUrl,
      // Marca si el producto ya no está activo en la tienda: mandar un correo
      // que lleva a un producto borrado es peor que no mandarlo.
      _vigente: !!vivo,
    };
  });

  const perdidos = products.filter((p) => !p._vigente).map((p) => p.title);

  // Un producto que ya no está en la tienda se saca: el correo llevaría a una
  // página caída. Y si la campaña queda corta, se completa con lo más nuevo
  // del catálogo que no esté ya incluido.
  const vigentes = products.filter((p) => p._vigente);
  const yaEstan = new Set(vigentes.map((p) => handleDe(p.productUrl)));
  const ficha = (v) => ({
    title: v.title,
    price: v.price,
    currency: "CLP",
    imageUrl: v.imageUrl,
    productUrl: `${catalogo.origen}/products/${v.handle}`,
  });
  const rellenados = [];
  for (const v of catalogo.nuevos || []) {
    if (vigentes.length + rellenados.length >= PRODUCTOS_POR_CORREO) break;
    const h = String(v.handle).toLowerCase();
    if (yaEstan.has(h)) continue;
    yaEstan.add(h);
    rellenados.push(ficha(v));
  }
  const finales = [...vigentes.map(({ _vigente, ...p }) => p), ...rellenados];
  if (!finales.length) sinProductos++;

  const bloques = {
    heading: e.heading || "",
    intro,
    closing: cierre,
    ctaText: e.ctaText || "Ver más",
    ctaUrl: e.ctaUrl || brand.websiteUrl || "",
    products: finales,
  };

  console.log(`${e.status.padEnd(7)} ${new Date(e.scheduledFor).toLocaleDateString("es-CL")} · ${String(e.subject).slice(0, 46)}`);
  console.log(`   productos: ${finales.length} (${vigentes.length} del correo original + ${rellenados.length} del catálogo)` +
    `${perdidos.length ? `  ⚠ sacados por no estar ya en la tienda: ${perdidos.join(", ")}` : ""}`);
  if (!intro) console.log("   ⚠ sin introducción recuperable");

  if (APLICAR) {
    await doc.ref.set({ bloques, rehechoEl: Date.now() }, { merge: true });
  }
  rehechas++;
}

console.log(`\n${APLICAR ? "rehechas" : "se reharían"}: ${rehechas} · ya estaban al día: ${saltadas} · sin productos recuperables: ${sinProductos}`);
process.exit(0);
