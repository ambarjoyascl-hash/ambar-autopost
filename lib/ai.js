// lib/ai.js
// Genera el plan de contenido semana a semana usando la API de Claude
// (Anthropic). Los planes de varios meses son varias de estas llamadas.
// Llama a la Messages API por fetch (sin SDK) para mantener las dependencias al
// mínimo. Requiere la variable de entorno ANTHROPIC_API_KEY.
//
// La IA recibe la voz de la marca + una lista numerada de productos y devuelve
// un plan en JSON estricto (posts de Instagram + emails coordinados). Nunca le
// pasamos las URLs de imagen (para ahorrar tokens): las volvemos a unir por el
// índice del producto en lib/plan.js.

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.CONTENT_MODEL || "claude-sonnet-5";

/** Llamada cruda a la Messages API. Devuelve el texto concatenado. */
async function callClaude({ system, prompt, model = DEFAULT_MODEL, maxTokens = 4000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY.");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      // Sonnet 5 razona por defecto si no se dice nada, y max_tokens cubre el
      // razonamiento MÁS el texto: sin esto el presupuesto se va en pensar y el
      // JSON llega cortado. Aquí la tarea es rellenar una plantilla, así que
      // basta el esfuerzo bajo — y además cabe en los 60 s de la función.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Claude error: ${data.error?.message || JSON.stringify(data)}`);
  }
  // Un corte por tope de tokens deja un JSON a medias; conviene decirlo claro
  // en vez de fallar después con un error de parseo incomprensible.
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      "La IA se quedó sin espacio para terminar el plan. Pide menos posts o emails por semana."
    );
  }
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extrae el primer objeto JSON de un texto (por si la IA agrega prosa). */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("La IA no devolvió JSON.");
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

/**
 * Genera el plan de UNA semana. Los planes de varias semanas (hasta 3 meses) se
 * arman en lib/plan.js llamando a esta función una vez por semana, en paralelo:
 * cada llamada recibe su propio tramo del catálogo y su propia fecha de inicio.
 * Pedirle los tres meses de una sola vez no cabe en la respuesta del modelo.
 *
 * @param {Object} opts
 * @param {Object} opts.brand         marca (con .name y .voice)
 * @param {Array}  opts.products      [{title, price, currency, productUrl, description}]
 * @param {string} opts.startDate     "YYYY-MM-DD" (primer día de ESTA semana)
 * @param {number} opts.postsPerWeek  cuántos posts de IG (default 7)
 * @param {boolean} opts.includeEmails
 * @param {number} opts.emailsPerWeek default 2
 * @param {number} opts.weekIndex     0-based: qué semana del plan es esta
 * @param {number} opts.totalWeeks    cuántas semanas tiene el plan completo
 * @returns {Promise<{posts:Array, emails:Array}>}
 */
export async function generateWeeklyPlan({
  brand,
  products = [],
  startDate,
  postsPerWeek = 7,
  includeEmails = true,
  emailsPerWeek = 2,
  goal = "",
  tone = "",
  weekIndex = 0,
  totalWeeks = 1,
}) {
  const voice = brand.voice || {};
  const lang = voice.language || "es";
  const currency = voice.currency || "CLP";
  const effectiveTone = tone || voice.tone || "cálido, cercano y aspiracional";
  const inspo = (voice.inspo || []).join(" ");

  const productList = products
    .map((p, i) => {
      const price = p.price ? ` — precio: ${p.price} ${p.currency || currency}` : "";
      const desc = p.description ? ` — ${p.description}` : "";
      const nPhotos = (p.images || []).length || 1;
      const cat = p.category ? ` [${p.category}]` : "";
      return `${i}.${cat} ${p.title || "(sin título)"}${price} — fotos disponibles: ${nPhotos}${desc}`;
    })
    .join("\n");

  const system =
    `Eres una experta en marketing de contenidos y community management para ` +
    `marcas de e-commerce (especialmente joyería y accesorios). Escribes en ` +
    `${lang === "es" ? "español de Chile" : lang}, con un tono ${effectiveTone}. ` +
    `Tu público objetivo: ${voice.audience || "mujeres 25-45 que aman los accesorios"}. ` +
    `Creas planes de contenido coordinados entre Instagram y email marketing. ` +
    `Devuelves SIEMPRE y ÚNICAMENTE JSON válido, sin texto adicional, sin markdown.`;

  const hashtags = (voice.hashtags || []).join(" ");

  const prompt = `Marca: "${brand.name}".
${goal ? `Objetivo ${totalWeeks > 1 ? "del plan completo" : "de la semana"} (priorízalo en TODO el contenido): ${goal}.` : ""}
${inspo ? `Cuentas de Instagram que inspiran el estilo de la marca (imita su tipo de contenido y tono, sin copiarlas): ${inspo}.` : ""}
Hashtags base de la marca: ${hashtags || "(ninguno, propón relevantes)"}.
Moneda: ${currency}.

Catálogo disponible (usa el índice para referenciar cada producto; los ítems
marcados como "foto subida por la marca" son fotos propias sin producto asociado
— úsalas para posts de lifestyle, marca o comunidad, sin inventar precios):
${productList || "(sin productos; propón contenido de marca genérico y usa productIndex: -1)"}

${totalWeeks > 1 ? `Este es el tramo ${weekIndex + 1} de ${totalWeeks} de un plan largo (${totalWeeks} semanas
seguidas). Los otros tramos los escribe otra persona en paralelo y cada uno tiene
SU PROPIO tramo del catálogo, así que no te preocupes por repetir productos: no
puedes ver los demás. Lo que sí tienes que hacer es que esta semana no se sienta
calcada de las otras: elige un ángulo propio para el tramo ${weekIndex + 1}
(por ejemplo, si es un tramo temprano presenta y educa; si es más adelante,
profundiza, muestra combinaciones o apunta a la ocasión de compra), y varía los
ganchos y las estructuras de caption.

` : ""}Crea un plan de contenido para 7 días a partir del ${startDate}.
- ${postsPerWeek} posts de Instagram (uno por día si son 7), variando el tipo de contenido:
  producto destacado, educativo/tips, testimonio/estilo de vida, detrás de cámara, y promoción.
- MEZCLA OBLIGATORIA: de cada ${postsPerWeek} posts, al menos ${Math.max(2, Math.round(postsPerWeek / 3))}
  NO pueden ser vitrina de un producto. Son posts de marca o de tienda: cómo elegir
  la talla o el tono, cómo cuidar y guardar las piezas, en qué ocasión va cada estilo,
  responder dudas frecuentes, o el detrás de cámara del negocio. Igual llevan
  productIndex (se usa su foto), pero el texto habla de la marca, no del precio.
  Usa "theme": "educativo", "testimonio" o "detras-de-camara" en esos.
- ORDEN DEL CATÁLOGO: la lista YA VIENE ROTADA ENTRE CATEGORÍAS (anillo, aro,
  collar, pulsera…), del producto más nuevo al más viejo dentro de cada una, y
  ya excluye los publicados en semanas anteriores. Asigna los productos en ese
  mismo orden a lo largo de la semana (el índice 0 va primero): así la semana
  alterna de categoría sola. NO agrupes por categoría ni saltes índices para
  juntar productos parecidos, y NO repitas el mismo producto en más de un post
  de la semana.
- ${includeEmails ? `${emailsPerWeek} emails` : "0 emails"} para Shopify Email, coordinados con los posts
  (mismo producto/tema el mismo día o cercano), para reforzar el mensaje en ambos canales.

Reglas de captions de Instagram:
- NO INVENTES DATOS DE LA TIENDA. En los posts de marca o tienda está prohibido
  afirmar plazos de envío, despacho gratis, cambios y devoluciones, dirección,
  horarios, stock, materiales o medidas que no aparezcan arriba en el catálogo.
  Si no tienes el dato, escribe el post sin él o invita a preguntar por mensaje.
  Un dato inventado termina en una devolución y en una clienta enojada.
- VARIEDAD VISUAL obligatoria: alterna el campo "imageStyle" entre "producto"
  (foto limpia del producto, fondo blanco) y "lifestyle" (foto del producto en uso,
  puesto, en contexto). Nunca dos posts seguidos con el mismo estilo si el producto
  tiene más de 1 foto. Así el feed no se ve monótono.
- Prefiere productos con varias fotos disponibles para los posts de marca o tienda,
  y marca esos como "lifestyle": son los que rompen la monotonía del feed.
- Gancho fuerte en la primera línea. 2-5 líneas. Emojis con moderación.
- Termina con 8-12 hashtags que TÚ generas para cada post: mezcla de nicho específico
  del producto, de la categoría, y 2-3 populares del rubro; en el idioma del público.
  ${hashtags ? "Incluye siempre además estos de la marca: " + hashtags + "." : "La marca no tiene hashtags fijos: propónlos tú, incluyendo uno con el nombre de la marca."}
  No repitas el mismo set de hashtags entre posts; varíalos según el contenido.
- Incluye un llamado a la acción suave (guardar, comentar, ver link).

Reglas de emails:
- subject corto y atractivo (máx ~50 caracteres), previewText complementario.
- heading, intro (2-3 frases), y un cierre. ctaText y ctaUrl (usa el productUrl del producto principal).

Devuelve EXACTAMENTE este JSON:
{
  "posts": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "productIndex": 0,
      "type": "image",
      "imageStyle": "producto|lifestyle",
      "theme": "producto|educativo|testimonio|detras-de-camara|promo",
      "caption": "texto con saltos de línea \\n y hashtags al final",
      "altText": "descripción breve de la imagen para accesibilidad"
    }
  ],
  "emails": [
    {
      "day": 3,
      "date": "YYYY-MM-DD",
      "subject": "...",
      "previewText": "...",
      "heading": "...",
      "intro": "...",
      "productIndexes": [0, 2],
      "ctaText": "Ver colección",
      "ctaUrl": "https://...",
      "closing": "..."
    }
  ]
}`;

  // Tokens de salida proporcionales al contenido pedido (7 emails diarios
  // necesitan bastante más que 2). El presupuesto también cubre el
  // razonamiento del modelo, así que va holgado: quedarse corto corta el JSON.
  const maxTokens = Math.min(16000, 6000 + postsPerWeek * 260 + emailsPerWeek * 520);
  const text = await callClaude({ system, prompt, maxTokens });
  const parsed = extractJson(text);
  return {
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    emails: Array.isArray(parsed.emails) ? parsed.emails : [],
  };
}
/**
 * Genera UN post suelto para un día concreto. Es el motor del botón "Generar
 * otro post" del calendario (pedido de Gina, 10-ago-2026): sirve para cambiar
 * el post de un día que no convence, sin rehacer la semana entera ni tocar los
 * otros días.
 *
 * Diferencias con el plan semanal, todas a propósito:
 *  - La lista de productos que llega ya excluye lo publicado Y lo que está en
 *    la cola, así que el índice 0 es la mejor opción y siempre es un producto
 *    distinto al que tenía el post.
 *  - `avoid` son los otros posts de la semana (título y tema). Se le pasan para
 *    que el reemplazo no termine siendo un clon del post del día siguiente.
 *  - `instruction` es lo que la usuaria escribió en la cajita ("que sea de
 *    aros", "algo de marca, sin precio"). Manda sobre el resto, salvo la regla
 *    de no inventar datos.
 *
 * @returns {Promise<{productIndex:number, imageStyle:string, theme:string, caption:string, altText:string}>}
 */
export async function generateSinglePost({
  brand,
  products = [],
  date,
  time = "19:00",
  instruction = "",
  avoid = [],
}) {
  if (!products.length) throw new Error("No hay productos disponibles para generar el post.");

  const voice = brand.voice || {};
  const lang = voice.language || "es";
  const currency = voice.currency || "CLP";
  const effectiveTone = voice.tone || "cálido, cercano y aspiracional";
  const hashtags = (voice.hashtags || []).join(" ");
  const inspo = (voice.inspo || []).join(" ");

  const productList = products
    .map((p, i) => {
      const price = p.price ? ` — precio: ${p.price} ${p.currency || currency}` : "";
      const desc = p.description ? ` — ${p.description}` : "";
      const nPhotos = (p.images || []).length || 1;
      const cat = p.category ? ` [${p.category}]` : "";
      return `${i}.${cat} ${p.title || "(sin título)"}${price} — fotos disponibles: ${nPhotos}${desc}`;
    })
    .join("\n");

  const vecinos = avoid
    .filter((a) => a.title || a.theme)
    .map((a) => `  - ${a.title || "(sin producto)"}${a.theme ? ` (tema: ${a.theme})` : ""}`)
    .join("\n");

  const system =
    `Eres una experta en marketing de contenidos y community management para ` +
    `marcas de e-commerce (especialmente joyería y accesorios). Escribes en ` +
    `${lang === "es" ? "español de Chile" : lang}, con un tono ${effectiveTone}. ` +
    `Tu público objetivo: ${voice.audience || "mujeres 25-45 que aman los accesorios"}. ` +
    `Devuelves SIEMPRE y ÚNICAMENTE JSON válido, sin texto adicional, sin markdown.`;

  const prompt = `Marca: "${brand.name}".
${inspo ? `Cuentas de Instagram que inspiran el estilo de la marca (imita su tipo de contenido y tono, sin copiarlas): ${inspo}.` : ""}
Hashtags base de la marca: ${hashtags || "(ninguno, propón relevantes)"}.
Moneda: ${currency}.

Catálogo disponible (usa el índice para referenciar el producto; los ítems
marcados como "foto subida por la marca" son fotos propias sin producto asociado
— úsalas para posts de lifestyle, marca o comunidad, sin inventar precios):
${productList}

Crea UN SOLO post de Instagram para el ${date} a las ${time}.
${instruction ? `\nINSTRUCCIÓN DE LA USUARIA, es lo más importante de todo y manda sobre las
demás preferencias (salvo la regla de no inventar datos): "${instruction}"\n` : ""}
- ELIGE EL PRODUCTO de la lista de arriba. La lista ya viene ordenada: rotada
  entre categorías y de lo más nuevo a lo más viejo, y ya excluye todo lo que la
  marca publicó o tiene agendado. Prefiere los índices bajos (el 0 es la mejor
  opción) salvo que la instrucción de la usuaria pida otra cosa, por ejemplo una
  categoría concreta: en ese caso toma el índice más bajo que la cumpla.
${vecinos ? `- ESTE POST REEMPLAZA A OTRO. Los demás posts de esa semana ya son:
${vecinos}
  El tuyo tiene que verse distinto de todos ellos: otro producto, otra
  categoría si se puede, y otro enfoque de texto. No repitas su tema.
` : ""}
Reglas del caption:
- NO INVENTES DATOS. Está prohibido afirmar plazos de envío, despacho gratis,
  cambios y devoluciones, dirección, horarios, stock, materiales o medidas que
  no aparezcan arriba en el catálogo. Prohibido también prometer cómo se
  comporta la pieza con el uso: que resiste el uso diario, que no se pone negra,
  que no destiñe, que sirve para la ducha o el mar, que es hipoalergénica o
  antialérgica, o cuánto dura el baño. Nada de eso está confirmado. Si no
  tienes el dato, escribe el post sin él o invita a preguntar por mensaje. Un
  dato inventado termina en una devolución y en una clienta enojada.
- Gancho fuerte en la primera línea. 2-5 líneas. Emojis con moderación.
- Termina con 8-12 hashtags que TÚ generas: mezcla de nicho específico del
  producto, de la categoría, y 2-3 populares del rubro; en el idioma del público.
  ${hashtags ? "Incluye siempre además estos de la marca: " + hashtags + "." : "La marca no tiene hashtags fijos: propónlos tú, incluyendo uno con el nombre de la marca."}
- Incluye un llamado a la acción suave (guardar, comentar, ver link).
- "imageStyle": "producto" para la foto limpia de catálogo, "lifestyle" para la
  pieza puesta o en contexto. Elige "lifestyle" si el producto tiene más de una
  foto y el texto habla de la marca más que del precio.
- "theme": uno de "producto", "educativo", "testimonio", "detras-de-camara" o "promo".

Devuelve EXACTAMENTE este JSON, sin nada más:
{
  "productIndex": 0,
  "imageStyle": "producto|lifestyle",
  "theme": "producto|educativo|testimonio|detras-de-camara|promo",
  "caption": "texto con saltos de línea \\n y hashtags al final",
  "altText": "descripción breve de la imagen para accesibilidad"
}`;

  const text = await callClaude({ system, prompt, maxTokens: 4000 });
  const p = extractJson(text);
  const idx = Number.isInteger(p.productIndex) ? p.productIndex : 0;
  return {
    productIndex: idx >= 0 && idx < products.length ? idx : 0,
    imageStyle: p.imageStyle === "lifestyle" ? "lifestyle" : "producto",
    theme: String(p.theme || "producto"),
    caption: String(p.caption || ""),
    altText: String(p.altText || ""),
  };
}
