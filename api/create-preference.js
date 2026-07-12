// api/create-preference.js
// Crea una preferencia de pago de Mercado Pago (Checkout Pro) para el carrito.
// Los precios se recalculan SIEMPRE desde Firestore (nunca se confía en el
// cliente) y se registra la orden en la colección `orders`.
import { db } from "../lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

const MP_API = "https://api.mercadopago.com";
const CURRENCY = process.env.MP_CURRENCY || "CLP";

// URL pública del sitio (para back_urls y webhook). En Vercel la derivamos
// de los headers; se puede forzar con PUBLIC_BASE_URL.
function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!process.env.MP_ACCESS_TOKEN) {
    return res.status(500).json({
      error: "mp_not_configured",
      message: "Falta la variable MP_ACCESS_TOKEN en Vercel.",
    });
  }

  try {
    const body = req.body || {};
    const cartItems = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    if (!cartItems.length) {
      return res.status(400).json({ error: "empty_cart" });
    }

    // Recalcular precios reales desde Firestore.
    const mpItems = [];
    const orderItems = [];
    let total = 0;

    for (const it of cartItems) {
      if (!it || !it.id) continue;
      const snap = await db.doc(`products/${it.id}`).get();
      if (!snap.exists) continue;
      const p = snap.data();
      if (p.available === false) continue;
      const price = Number(p.price) || 0;
      if (price <= 0) continue; // productos "a cotizar" no se pagan en línea
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      total += price * qty;
      mpItems.push({
        id: it.id,
        title: (p.name || "Producto").slice(0, 250),
        quantity: qty,
        unit_price: price,
        currency_id: CURRENCY,
      });
      orderItems.push({
        id: it.id,
        name: p.name || "Producto",
        price,
        qty,
        karat: p.karat || null,
      });
    }

    if (!mpItems.length) {
      return res.status(400).json({ error: "no_payable_items" });
    }

    // Registrar la orden (pending) antes de enviar a pagar.
    const orderRef = await db.collection("orders").add({
      items: orderItems,
      total,
      currency: CURRENCY,
      status: "pending",
      uid: customer.uid || null,
      customerName: customer.name || null,
      customerEmail: customer.email || null,
      customerCity: customer.city || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const base = baseUrl(req);
    const preference = {
      items: mpItems,
      external_reference: orderRef.id,
      back_urls: {
        success: `${base}/?status=success&order=${orderRef.id}`,
        failure: `${base}/?status=failure&order=${orderRef.id}`,
        pending: `${base}/?status=pending&order=${orderRef.id}`,
      },
      auto_return: "approved",
      notification_url: `${base}/api/mp-webhook`,
      statement_descriptor: "AMBAR JOYAS",
      metadata: { orderId: orderRef.id },
    };
    if (customer.email) {
      preference.payer = { email: customer.email, name: customer.name || undefined };
    }

    const mpRes = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preference),
    });
    const mp = await mpRes.json();

    if (!mpRes.ok) {
      await orderRef.update({ status: "error", mpError: mp });
      return res.status(502).json({ error: "mp_error", detail: mp });
    }

    await orderRef.update({ mpPreferenceId: mp.id });

    return res.status(200).json({
      orderId: orderRef.id,
      init_point: mp.init_point,
      sandbox_init_point: mp.sandbox_init_point,
    });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
