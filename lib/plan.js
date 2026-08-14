// lib/plan.js
// Orquesta la generación del plan de contenido (de 1 semana a 3 meses) y su
// publicación en la cola.
//
// Flujo:
//   generatePlan(brandId, opts)  → busca productos (Shopify o web) → la IA arma
//                                  el plan, una llamada por semana en paralelo →
//                                  lo guarda como BORRADOR en `plans`.
//   approvePlan(planId)          → crea los posts en `scheduledPosts` (pending)
//                                  y los emails en `emails` (ready).
//   discardPlan(planId)          → borra el borrador.
//
// El usuario revisa el borrador en el panel antes de aprobar. Nada se publica
// ni se agenda hasta que aprueba.

import { db } from "./firebase-admin.js";
import { getBrand } from "./brands.js";
import { hasShopify, getShopifyProducts } from "./shopify.js";
import { scrapeProducts, claveProducto } from "./scrape.js";
import { generateWeeklyPlan, generateSinglePost } from "./ai.js";
import { buildEmailHtml } from "./email-template.js";

const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || "America/Santiago";

/** Consigue productos de la mejor fuente disponible para la marca. */
export async function sourceProducts(brand, { limit = 20, exclude } = {}) {
  if (hasShopify(brand)) {
    try {
      const r = await getShopifyProducts(brand, { limit, exclude });
      if (r.candidates.length) return r;
    } catch (_) {
      /* si Shopify falla, caemos al scraping */
    }
  }
  if (brand.websiteUrl) {
    const r = await scrapeProducts(brand.websiteUrl, { limit });
    if (exclude && exclude.size) {
      const ex = new Set([...exclude].map(claveProducto));
      const frescos = r.candidates.filter((c) => !ex.has(claveProducto(c.productUrl)));
      if (frescos.length) r.candidates = frescos;
    }
    return r;
  }
  return { source: "none", candidates: [] };
}

/**
 * productUrls ya usados en planes APROBADOS de la marca. Los borradores
 * descartados no cuentan. Sirve para no repetir producto hasta agotar el
 * catálogo ("de más nuevos a más viejos, sin repetir").
 */
async function usedProductUrls(brandId) {
  const snap = await db.collection("plans").where("brandId", "==", brandId).get();
  const used = new Set();
  for (const d of snap.docs) {
    const plan = d.data();
    if (plan.status !== "scheduled") continue;
    for (const p of plan.posts || []) {
      if (p.productUrl) used.add(p.productUrl);
    }
  }
  return used;
}

/** Máximo de semanas que se pueden pedir de una vez (≈3 meses). */
export const MAX_WEEKS = 12;

/**
 * Genera un borrador de plan y lo guarda en `plans`.
 *
 * El plan puede durar de 1 a 12 semanas (pedido de Gina, 14-ago-2026: quería
 * dejar programados varios meses de una, y elegir desde qué fecha arranca).
 * Cada semana es una llamada aparte a la IA — un JSON de tres meses no cabe en
 * la respuesta del modelo — y todas salen EN PARALELO para que el plan largo
 * demore casi lo mismo que uno de una semana y quepa en los 60 s de la función.
 *
 * @returns {Promise<Object>} el documento del plan (con posts y emails resueltos)
 */
export async function generatePlan(brandId, opts = {}) {
  const brand = await getBrand(brandId);
  if (!brand) throw new Error("Marca no encontrada.");

  const startDate = normalizeStartDate(opts.startDate);
  const weeks = clampWeeks(opts.weeks);
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

  // Un plan de 12 semanas con 7 posts necesita 84 productos distintos, no los
  // 20 de un plan de una semana: el catálogo se pide del porte del plan. Se
  // piden algunos de más por semana (ANCHO) para que la IA tenga de dónde
  // elegir y no quede amarrada a un producto por día.
  const needed = postsPerWeek * weeks;
  const ANCHO = postsPerWeek + 4;

  let catalog, source;
  let brandPhotos = [];
  if (imageMode === "uploads") {
    if (!uploads.length) throw new Error("No hay fotos subidas en esta marca. Sube fotos o elige otro origen de imágenes.");
    catalog = uploads;
    source = "fotos-subidas";
  } else {
    const exclude = await usedProductUrls(brandId);
    const r = await sourceProducts(brand, { limit: opts.productLimit || Math.max(20, ANCHO * weeks), exclude });
    catalog = r.candidates;
    brandPhotos = imageMode === "mix" ? uploads : [];
    source = imageMode === "mix" && uploads.length ? `${r.source}+subidas` : r.source;
  }
  const products = [...catalog, ...brandPhotos];

  // Cada semana recibe SU tramo del catálogo. Así dos semanas no compiten por
  // el mismo producto y el texto de la IA siempre calza con la foto que le toca
  // (si dos semanas eligieran el mismo, el desempate de más abajo cambiaría la
  // foto y el caption quedaría hablando de otra pieza). Las fotos propias de la
  // marca sí van en todas las semanas: no son de un producto en particular.
  const fotoIdx = brandPhotos.map((_, i) => catalog.length + i).slice(0, 6);
  // El tramo se angosta hasta donde alcance el catálogo: con 100 productos y 12
  // semanas son 8 por semana, no 11 — así los tramos no se pisan. Nunca baja de
  // los posts que tiene la semana, porque entonces sí o sí habría repetidos.
  const ancho = Math.min(ANCHO, Math.max(postsPerWeek, Math.floor(catalog.length / weeks)), catalog.length || 1);
  const ventanaDe = (w) => {
    const idx = [];
    for (let i = 0; i < ancho && catalog.length; i++) {
      idx.push(((w * ancho) + i) % catalog.length);
    }
    return [...idx, ...fotoIdx];
  };
  const goal = (opts.goal || "").slice(0, 500);
  const tone = (opts.tone || "").slice(0, 120);

  // Las semanas se generan EN PARALELO: 12 llamadas a la vez demoran lo que la
  // más lenta (~30 s), en serie no cabrían en el tiempo de la función.
  const tramos = await Promise.all(
    [...Array(weeks)].map((_, w) => {
      const win = ventanaDe(w);
      const weekStart = addDays(startDate, w * 7);
      return generateWeeklyPlan({
        brand,
        products: win.map((i) => products[i]),
        startDate: weekStart,
        postsPerWeek,
        includeEmails,
        emailsPerWeek,
        goal,
        tone,
        weekIndex: w,
        totalWeeks: weeks,
      })
        .then((ai) => ({ w, weekStart, win, ai }))
        .catch((error) => ({ w, weekStart, win, error }));
    })
  );

  // Se juntan los tramos en un solo plan. Si una semana falló, el resto se
  // guarda igual (perder 12 semanas por una llamada caída sería peor) y el
  // aviso queda en el plan para mostrarlo en el panel.
  const warnings = [];
  const ai = { posts: [], emails: [] };
  for (const tramo of tramos) {
    const { w, weekStart, win } = tramo;
    if (tramo.error) {
      warnings.push(`La semana ${w + 1} (desde el ${weekStart}) no se pudo generar: ${tramo.error.message}`);
      continue;
    }
    // El índice que devuelve la IA es relativo a SU ventana; aquí vuelve a ser
    // un índice del catálogo completo.
    const global = (i) => (Number.isInteger(i) && i >= 0 && i < win.length ? win[i] : -1);
    // Y la fecha se verifica contra los 7 días del tramo: una fecha inventada
    // mandaría el post a otro mes.
    const diasValidos = new Set([...Array(7)].map((_, i) => addDays(weekStart, i)));
    const fecha = (x) => (diasValidos.has(x.date) ? x.date : addDays(weekStart, Math.min(6, Math.max(0, (Number(x.day) || 1) - 1))));

    for (const p of tramo.ai.posts || []) {
      ai.posts.push({ ...p, productIndex: global(p.productIndex), date: fecha(p), day: w * 7 + (Number(p.day) || 1) });
    }
    for (const e of tramo.ai.emails || []) {
      ai.emails.push({
        ...e,
        productIndexes: (e.productIndexes || []).map(global).filter((i) => i >= 0),
        date: fecha(e),
        day: w * 7 + (Number(e.day) || 1),
      });
    }
  }
  if (!ai.posts.length && !ai.emails.length) {
    throw new Error(warnings[0] || "La IA no devolvió contenido. Inténtalo de nuevo.");
  }
  // Que el calendario y el borrador salgan en orden cronológico y no por tramo.
  ai.posts.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || "").localeCompare(String(b.time || "")));
  ai.emails.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const tz = brand.voice?.timezone || DEFAULT_TZ;
  const platform = brand.instagram?.postToFacebook ? "both" : "instagram";
  const toPinterest = !!(opts.pinterest && brand.pinterest?.accessToken);

  // ── Resolver posts: unir texto de la IA con imagen/link del producto ──
  // Variedad visual del feed. La foto 0 de cada producto es la portada de
  // catálogo (fondo limpio); las siguientes suelen ser detalle, escala o el
  // producto puesto. Dejarle la decisión a la IA no funcionó: pedía "producto"
  // casi siempre y el feed quedaba como una vitrina, todas las fotos iguales
  // (reportado por Gina el 6-ago-2026). Ahora la alternancia es determinista:
  // los posts en posición par tiran a portada y los impares a secundarias, y
  // "lifestyle" de la IA fuerza secundaria aunque toque posición par. Dentro de
  // cada grupo se rota para no repetir foto en el mismo plan.
  const usedImages = new Set();
  let seq = 0;
  /** @returns {{url: string, style: "producto"|"lifestyle"}} */
  const pickImage = (prod, style) => {
    const imgs = (prod?.images?.length ? prod.images : [prod?.imageUrl]).filter(Boolean);
    if (!imgs.length) return { url: "", style: "producto" };
    const secundarias = imgs.slice(1);
    const quiereSecundaria = style === "lifestyle" || seq % 2 === 1;
    const n = seq++;
    // Si el producto no tiene secundarias, no hay nada que alternar: portada.
    const base = quiereSecundaria && secundarias.length ? secundarias : imgs;
    // Rotamos el punto de partida para que en los productos con 4 o 6 fotos no
    // caiga siempre la misma secundaria.
    const corte = n % base.length;
    const preferidas = [...base.slice(corte), ...base.slice(0, corte)];
    const choice =
      preferidas.find((u) => !usedImages.has(u)) ||
      imgs.find((u) => !usedImages.has(u)) ||
      preferidas[0];
    usedImages.add(choice);
    // El estilo guardado es el de la foto que realmente quedó, no el que pidió
    // la IA: así el calendario muestra la verdad.
    return { url: choice, style: choice === imgs[0] ? "producto" : "lifestyle" };
  };

  // Ningún producto puede salir dos veces en el mismo plan. Al prompt ya se le
  // pide, pero pedirlo no es garantizarlo: si la IA repite un índice (o manda
  // uno que no existe), aquí se cambia por el siguiente producto sin usar de la
  // lista, que ya viene rotada por categoría desde lib/shopify.js.
  const usados = new Set();
  let cambiados = 0; // el caption quedó hablando de otro producto
  let repetidos = 0; // el producto sale dos veces, pero el caption calza
  const tomarProducto = (i) => {
    if (products[i] && !usados.has(i)) {
      usados.add(i);
      return products[i];
    }
    for (let j = 0; j < products.length; j++) {
      if (!usados.has(j)) {
        // Ojo: el caption ya venía escrito para el producto que pidió la IA, así
        // que aquí la foto y el texto quedan hablando de piezas distintas. Se
        // cuenta para avisarlo en el panel en vez de que se publique así.
        cambiados++;
        usados.add(j);
        return products[j];
      }
    }
    // Catálogo agotado: se repite el producto que pidió la IA. El texto calza,
    // solo que la pieza ya salió antes en el mismo plan.
    repetidos++;
    return products[i] || null;
  };

  const posts = (ai.posts || []).map((p) => {
    const prod = tomarProducto(p.productIndex);
    const img = pickImage(prod, p.imageStyle);
    return {
      day: p.day,
      date: p.date,
      time: p.time || "19:00",
      theme: p.theme || "producto",
      imageStyle: img.style,
      type: p.type === "carousel" ? "image" : "image", // MVP: imagen simple
      platform,
      pinterest: toPinterest,
      caption: p.caption || "",
      altText: p.altText || (prod ? prod.title : ""),
      imageUrl: img.url,
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
      // Las piezas sueltas del correo se guardan además del HTML ya armado.
      // Con ellas el email se vuelve a dibujar en el momento de enviarlo, así
      // que cambiar el logo o el color de la marca actualiza también lo que ya
      // estaba agendado — con tres meses de correos por delante, volver a
      // generarlo todo por un cambio de color no tendría sentido.
      bloques: bloquesDeEmail(e, prods),
      scheduledFor: zonedToEpoch(e.date, "09:00", tz),
    };
  });

  if (cambiados) {
    warnings.push(
      `En ${cambiados} post${cambiados > 1 ? "s" : ""} la foto quedó de otro producto distinto al que menciona el texto ` +
        `(la IA pidió dos veces la misma pieza). Revísalos antes de agendar y usa "Generar otro post" en los que no calcen.`
    );
  }
  if (repetidos) {
    warnings.push(
      `El plan necesita ${needed} productos y quedan ${catalog.length} sin publicar en la tienda, así que ${repetidos} ` +
        `post${repetidos > 1 ? "s repiten" : " repite"} una pieza que ya sale antes en el mismo plan. ` +
        `Para evitarlo, genera un plan más corto.`
    );
  }

  const now = Date.now();
  const planDoc = {
    brandId,
    brandName: brand.name,
    startDate,
    endDate: addDays(startDate, weeks * 7 - 1),
    weeks,
    source,
    productCount: products.length,
    status: "draft",
    warnings,
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
      // El producto viaja con el post a la cola. Antes se quedaba en el plan, y
      // sin él "Generar otro post" no podía saber qué productos ya están
      // agendados para no repetirlos (ver regeneratePost).
      productUrl: post.productUrl || "",
      productTitle: post.productTitle || "",
      theme: post.theme || "producto",
      imageStyle: post.imageStyle || "producto",
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
      bloques: email.bloques || null,
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

/**
 * Reemplaza el contenido de UN post de la cola por uno nuevo, dejando intactos
 * el día y la hora. Es el botón "Generar otro post" del calendario (pedido de
 * Gina, 10-ago-2026, cuando una semana entera salió con anillos): permite
 * arreglar un día suelto sin rehacer el plan ni tocar los demás.
 *
 * El post nuevo se escribe ENCIMA del anterior (mismo documento): el calendario
 * mantiene un solo post por horario y no hay que ir borrando descartes. Lo que
 * no se toca nunca es `scheduledFor`, así que la hora agendada se respeta.
 *
 * @param {string} postId
 * @param {{instruction?: string}} opts  instruction = lo que la usuaria escribió
 * @returns {Promise<{post: Object}>}
 */
export async function regeneratePost(postId, { instruction = "" } = {}) {
  const ref = db.collection("scheduledPosts").doc(postId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Post no encontrado.");
  const post = { id: snap.id, ...snap.data() };

  // Un post ya publicado no se puede "cambiar": la foto y el texto están en
  // Instagram. Y uno en pleno envío se pisaría con el cron.
  if (post.status === "published") {
    throw new Error("Ese post ya se publicó en Instagram, no se puede cambiar. Bórralo si no lo quieres en el feed.");
  }
  if (post.status === "publishing") {
    throw new Error("Ese post se está publicando en este momento. Espera a que termine.");
  }

  const brand = await getBrand(post.brandId);
  if (!brand) throw new Error("Marca no encontrada.");

  // Qué NO puede volver a salir: lo de planes ya agendados + todo lo que está
  // hoy en la cola, incluido el producto de este mismo post (por eso el
  // reemplazo siempre trae un producto distinto). Y de paso reunimos los otros
  // posts de la marca para que la IA no clone a un vecino, y sus fotos para no
  // repetir imagen.
  const exclude = await usedProductUrls(post.brandId);
  const usedImages = new Set();
  const vecinos = [];
  const cola = await db.collection("scheduledPosts").where("brandId", "==", post.brandId).get();
  for (const d of cola.docs) {
    const p = d.data();
    if (p.productUrl) exclude.add(p.productUrl);
    if (d.id === postId) continue;
    if (p.imageUrl) usedImages.add(p.imageUrl);
    vecinos.push({ title: p.productTitle || "", theme: p.theme || "" });
  }
  if (post.productUrl) exclude.add(post.productUrl);

  const r = await sourceProducts(brand, { limit: 20, exclude });
  const products = r.candidates || [];
  if (!products.length) {
    throw new Error(
      "No se encontraron productos para armar el post. Revisa que la tienda o la web de la marca estén conectadas."
    );
  }

  const tz = brand.voice?.timezone || DEFAULT_TZ;
  const cuando = epochToZoned(post.scheduledFor || Date.now(), tz);

  const gen = await generateSinglePost({
    brand,
    products,
    date: cuando.date,
    time: cuando.time,
    instruction: String(instruction || "").slice(0, 300),
    avoid: vecinos,
  });

  const prod = products[gen.productIndex] || products[0];

  // Misma idea que en el plan semanal: la foto 0 es la portada de catálogo y
  // las siguientes son detalle o producto puesto. Aquí no hay secuencia que
  // alternar, así que manda el estilo que pidió la IA, y entre las candidatas
  // se prefiere una que no esté ya usada en otro día de la semana.
  const imgs = (prod.images?.length ? prod.images : [prod.imageUrl]).filter(Boolean);
  const secundarias = imgs.slice(1);
  const base = gen.imageStyle === "lifestyle" && secundarias.length ? secundarias : imgs;
  const imageUrl =
    base.find((u) => !usedImages.has(u)) || imgs.find((u) => !usedImages.has(u)) || base[0] || "";

  const patch = {
    caption: gen.caption || post.caption || "",
    altText: gen.altText || prod.title || "",
    imageUrl,
    productUrl: prod.productUrl || "",
    productTitle: prod.title || "",
    theme: gen.theme,
    // Como en el plan: se guarda el estilo de la foto que quedó de verdad, no
    // el que pidió la IA, para que el calendario muestre la verdad.
    imageStyle: imageUrl === imgs[0] ? "producto" : "lifestyle",
    // Un post que había fallado vuelve a la cola limpio, sin el error viejo.
    status: "pending",
    error: null,
    attempts: 0,
    regeneratedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await ref.set(patch, { merge: true });
  return { post: { ...post, ...patch } };
}

/** Las piezas con las que se puede volver a dibujar un email desde cero. */
function bloquesDeEmail(e, prods) {
  return {
    heading: e.heading || "",
    intro: e.intro || "",
    closing: e.closing || "",
    ctaText: e.ctaText || "Ver más",
    ctaUrl: e.ctaUrl || "",
    products: prods.map((p) => ({
      title: p.title || "",
      price: p.price ?? "",
      currency: p.currency || "",
      imageUrl: p.imageUrl || "",
      productUrl: p.productUrl || "",
    })),
  };
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

/** Suma días a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD".
 *  Va por UTC a propósito: sumar días sobre la hora local se salta (o repite)
 *  un día cuando en el medio hay cambio de horario de verano. */
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

/** Semanas pedidas, acotadas a 1..MAX_WEEKS. */
function clampWeeks(n) {
  const w = Math.round(Number(n));
  if (!Number.isFinite(w) || w < 1) return 1;
  return Math.min(w, MAX_WEEKS);
}

/**
 * Valida la fecha de inicio que eligió la usuaria. Se acepta cualquier día de
 * hoy en adelante; una fecha pasada agendaría posts que el cron publicaría
 * todos de golpe apenas se aprueba el plan.
 */
function normalizeStartDate(value) {
  const hoy = todayInTz(DEFAULT_TZ);
  if (!value) return hoy;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("La fecha de inicio no es válida. Usa el formato AAAA-MM-DD.");
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error("Esa fecha no existe en el calendario.");
  }
  if (s < hoy) throw new Error("La fecha de inicio no puede ser anterior a hoy.");
  return s;
}

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

/** El inverso de zonedToEpoch: epoch ms → { date: "YYYY-MM-DD", time: "HH:MM" }
 *  en la zona horaria dada. Lo usa regeneratePost para decirle a la IA qué día
 *  y hora está escribiendo, tal como los ve la usuaria en el calendario. */
export function epochToZoned(ms, tz) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(new Date(ms))
    .reduce((a, x) => ((a[x.type] = x.value), a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
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
