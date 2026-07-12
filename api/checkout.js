// api/checkout.js
// Genera el link de pago para las piezas del live, usando un "draft order"
// de Shopify (así se cobra por TU Shopify / Mercado Pago, aunque las piezas
// no estén en tu catálogo). Los precios se validan leyendo el ítem desde
// Firestore (lectura pública), nunca se confía en el precio que manda el navegador.

const API_VERSION = "2024-10";

// Lee un ítem del live desde la API REST pública de Firestore.
async function readItem(projectId, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/liveItems/${encodeURIComponent(id)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const doc = await r.json();
  const f = doc.fields || {};
  const price = f.price
    ? parseInt(f.price.integerValue ?? f.price.doubleValue ?? "0", 10)
    : 0;
  return {
    title: f.title?.stringValue || "Pieza de oro",
    price,
    sold: f.sold?.booleanValue === true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || "ambar-8632.myshopify.com")
    .replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!token) {
    return res.status(500).json({
      error: "not_configured",
      message: "Falta SHOPIFY_ADMIN_TOKEN en Vercel (token de Shopify con permiso write_draft_orders).",
    });
  }

  try {
    const body = req.body || {};
    const projectId = body.projectId;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!projectId) return res.status(400).json({ error: "missing_project" });
    if (!items.length) return res.status(400).json({ error: "empty" });

    const lineItems = [];
    for (const it of items) {
      if (!it || !it.id) continue;
      const item = await readItem(projectId, it.id);
      if (!item) continue;
      if (item.sold) return res.status(409).json({ error: "sold", message: `"${item.title}" ya fue vendida.` });
      if (item.price <= 0) continue;
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      lineItems.push({ title: item.title, price: String(item.price), quantity: qty });
    }
    if (!lineItems.length) return res.status(400).json({ error: "no_valid_items" });

    const r = await fetch(`https://${domain}/admin/api/${API_VERSION}/draft_orders.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_order: { line_items: lineItems, tags: "live-oro", note: "Compra desde el live de oro" },
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.draft_order?.invoice_url) {
      return res.status(502).json({ error: "shopify_error", detail: data });
    }

    return res.status(200).json({
      invoice_url: data.draft_order.invoice_url,
      name: data.draft_order.name,
    });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
