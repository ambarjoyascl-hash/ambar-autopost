// scripts/marcar-textos-desalineados.mjs
// Marca las campañas cuyo TEXTO no corresponde a su producto, para que el panel
// no las deje enviar hasta reescribirlas.
//
// Regla de Gina (14-ago-2026): "el texto tiene que ser al producto del email,
// no puede no ser, eso es muy malo". Un correo cuyo texto habla de una pieza
// distinta a la de la foto llega a mil clientas y termina en devoluciones.
//
// Se marcan dos casos, los dos comprobables sin IA:
//
//   1. El producto del que hablaba el correo YA NO ESTÁ en la tienda. Al pasar
//      las campañas al diseño nuevo se reemplazó por otro del catálogo, así que
//      el texto quedó hablando de algo que ni siquiera aparece.
//   2. El texto nombra un color que CONTRADICE el del título del producto
//      ("Color violeta para tu día" sobre unas "Argollas con Piedra Azul").
//
// La marca se limpia sola al reescribir el texto desde el panel (ver
// rewriteEmail en lib/plan.js).
//
// Uso:  node scripts/marcar-textos-desalineados.mjs
//       node scripts/marcar-textos-desalineados.mjs --aplicar

import admin from "firebase-admin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const APLICAR = process.argv.includes("--aplicar");

admin.initializeApp({ credential: admin.credential.cert(require("../firebase-service-account.json")) });
const db = admin.firestore();

/** Familias de color. Dos familias distintas en el mismo correo = contradicción. */
const COLORES = {
  violeta: ["violeta", "morado", "morada", "lila", "púrpura", "purpura"],
  azul: ["azul", "zafiro", "celeste"],
  verde: ["verde", "esmeralda"],
  rojo: ["rojo", "roja", "rubí", "rubi", "granate"],
  rosa: ["rosa", "rosado", "rosada"],
  negro: ["negro", "negra", "black", "onix", "ónix"],
  dorado: ["dorado", "dorada", "oro", "gold"],
  plateado: ["plateado", "plateada", "plata", "silver", "rodio"],
};

function familias(txt) {
  const t = String(txt || "").toLowerCase();
  const out = new Set();
  for (const [fam, palabras] of Object.entries(COLORES)) {
    if (palabras.some((p) => new RegExp(`\\b${p}`, "i").test(t))) out.add(fam);
  }
  return out;
}

/** Los links de producto que tenía el HTML original de la campaña. */
function handlesDelHtmlViejo(html = "") {
  const out = [];
  for (const m of html.matchAll(/<a href="([^"]+)" style="text-decoration:none;color:inherit;"/g)) {
    const h = m[1].replace(/&amp;/g, "&").match(/\/products\/([^/?#"]+)/);
    if (h) out.push(decodeURIComponent(h[1]).toLowerCase());
  }
  return out;
}

const snap = await db.collection("emails").get();
console.log(`campañas: ${snap.size}${APLICAR ? "" : "  (simulación)"}\n`);

let marcadas = 0, limpias = 0;
for (const doc of snap.docs) {
  const e = { id: doc.id, ...doc.data() };
  if (e.status === "sent" || !e.bloques) continue;

  const hero = e.bloques.products?.[0];
  if (!hero) continue;
  const motivos = [];

  // 1. ¿Sigue estando el producto del que hablaba el texto?
  const viejos = handlesDelHtmlViejo(e.html || "");
  const actuales = (e.bloques.products || [])
    .map((p) => (String(p.productUrl || "").match(/\/products\/([^/?#]+)/) || [])[1]?.toLowerCase())
    .filter(Boolean);
  // Lo que importa es el PRIMERO: es del que habla el texto. Que sobreviva
  // alguno de los acompañantes no salva nada si el protagonista se cayó.
  if (viejos.length && !actuales.includes(viejos[0])) {
    motivos.push("el producto del que habla el texto ya no está en la tienda");
  }

  // 2. ¿El texto nombra un color que el producto no tiene?
  const texto = `${e.subject} ${e.bloques.heading} ${e.bloques.intro}`;
  const delTexto = familias(texto);
  const delProducto = familias(hero.title);
  const contradice = [...delTexto].filter((f) => delProducto.size && !delProducto.has(f));
  if (contradice.length && delProducto.size) {
    motivos.push(`el texto dice "${contradice.join(", ")}" y el producto es "${hero.title}"`);
  }

  if (!motivos.length) { limpias++; continue; }
  marcadas++;
  console.log(`⚠ ${e.subject}`);
  motivos.forEach((m) => console.log(`    ${m}`));
  if (APLICAR) {
    await doc.ref.set({ textoDesalineado: motivos.join(" · ") }, { merge: true });
  }
}

console.log(`\n${APLICAR ? "marcadas" : "se marcarían"}: ${marcadas} · sin problemas detectados: ${limpias}`);
process.exit(0);
