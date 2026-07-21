// lib/ai.js
// Genera el plan de contenido de la semana usando la API de Claude (Anthropic).
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
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Claude error: ${data.error?.message || JSON.stringify(data)}`);
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
 * Genera el plan semanal.
 * @param {Object} opts
 * @param {Object} opts.brand         marca (con .name y .voice)
 * @param {Array}  opts.products      [{title, price, currency, productUrl, description}]
 * @param {string} opts.startDate     "YYYY-MM-DD" (primer día del plan)
 * @param {number} opts.postsPerWeek  cuántos posts de IG (default 7)
 * @param {boolean} opts.includeEmails
 * @param {number} opts.emailsPerWeek default 2
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
      return `${i}. ${p.title || "(sin título)"}${price}${desc}`;
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
${goal ? `Objetivo de la semana (priorízalo en TODO el contenido): ${goal}.` : ""}
${inspo ? `Cuentas de Instagram que inspiran el estilo de la marca (imita su tipo de contenido y tono, sin copiarlas): ${inspo}.` : ""}
Hashtags base de la marca: ${hashtags || "(ninguno, propón relevantes)"}.
Moneda: ${currency}.

Catálogo disponible (usa el índice para referenciar cada producto):
${productList || "(sin productos; propón contenido de marca genérico y usa productIndex: -1)"}

Crea un plan de contenido para 7 días a partir del ${startDate}.
- ${postsPerWeek} posts de Instagram (uno por día si son 7), variando el tipo de contenido:
  producto destacado, educativo/tips, testimonio/estilo de vida, detrás de cámara, y promoción.
- ${includeEmails ? `${emailsPerWeek} emails` : "0 emails"} para Shopify Email, coordinados con los posts
  (mismo producto/tema el mismo día o cercano), para reforzar el mensaje en ambos canales.

Reglas de captions de Instagram:
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

  const text = await callClaude({ system, prompt, maxTokens: 4500 });
  const parsed = extractJson(text);
  return {
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    emails: Array.isArray(parsed.emails) ? parsed.emails : [],
  };
}
