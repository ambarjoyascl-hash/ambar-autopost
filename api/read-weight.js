// api/read-weight.js
// Lee el peso (gramos) que muestra una pesa/balanza digital en la foto, usando
// visión de Claude. Requiere ANTHROPIC_API_KEY en Vercel. Si no está, no falla:
// simplemente no autocompleta y la vendedora escribe el peso a mano.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ grams: null, note: "not_configured" });

  try {
    const b = req.body || {};
    const imageBase64 = b.imageBase64;
    const mediaType = b.mediaType || "image/jpeg";
    if (!imageBase64) return res.status(400).json({ error: "no_image" });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.VISION_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              {
                type: "text",
                text:
                  "En esta foto puede aparecer una pesa o balanza digital mostrando un peso en gramos. " +
                  "Devuelve SOLO el número de gramos que se ve en la pantalla (por ejemplo: 10.2). " +
                  "Si no se ve ninguna pesa o número de peso, devuelve exactamente 0.",
              },
            ],
          },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(200).json({ grams: null, error: d?.error?.message || "vision_error" });

    const text = (d?.content?.[0]?.text || "").replace(",", ".");
    const m = text.match(/\d+(\.\d+)?/);
    const grams = m ? parseFloat(m[0]) : 0;
    return res.status(200).json({ grams: grams > 0 ? grams : null, raw: text });
  } catch (e) {
    return res.status(200).json({ grams: null, error: String(e?.message || e) });
  }
}
