// api/checkout.js
// Genera el link de pago de las piezas del live con un "draft order" de
// Shopify (se cobra por TU Shopify / Mercado Pago aunque la pieza no esté en
// tu catálogo). El precio se lee del catálogo en Vercel Blob, nunca del navegador.
import { getItems } from "../lib/store.js";

const API_VERSION = "2024-10";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || "ambar-8632.myshopify.com")
    .replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!token) {
    return res.status(500).json({
      error: "not_configured",
      message: "Falta SHOPIFY_ADMIN_TOKEN en Vercel (token con permiso write_draft_orders).",
    });
  }

  try {
    const body = req.body || {};
    const reqItems = Array.isArray(body.items) ? body.items : [];
    if (!reqItems.length) return res.status(400).json({ error: "empty" });

    const all = await getItems();
    const lineItems = [];
    for (const r of reqItems) {
      const it = all.find((x) => x.id === r.id);
      if (!it) continue;
      if (it.sold) return res.status(409).json({ error: "sold", message: `"${it.title}" ya fue vendida.` });
      if (Number(it.price) <= 0) continue;
      lineItems.push({
        title: it.title,
        price: String(it.price),
        quantity: Math.max(1, parseInt(r.qty, 10) || 1),
      });
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
    return res.status(200).json({ invoice_url: data.draft_order.invoice_url, name: data.draft_order.name });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
