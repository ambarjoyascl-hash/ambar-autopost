// api/mp-webhook.js
// Recibe las notificaciones de Mercado Pago y actualiza el estado de la orden
// en Firestore. MP puede notificar por query (?type=payment&data.id=...) o body.
import { db } from "../lib/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

const MP_API = "https://api.mercadopago.com";

const STATUS_MAP = {
  approved: "paid",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
  in_process: "pending",
  in_mediation: "pending",
  pending: "pending",
  authorized: "pending",
};

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const b = req.body || {};
    const type = q.type || q.topic || b.type || b.topic;
    const paymentId = q["data.id"] || b?.data?.id || q.id || b.id;

    // Solo nos interesan las notificaciones de pagos.
    if (type !== "payment" || !paymentId) {
      return res.status(200).json({ ignored: true });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(200).json({ error: "mp_not_configured" });
    }

    const mpRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const pay = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(200).json({ error: "cannot_fetch_payment", detail: pay });
    }

    const orderId = pay.external_reference;
    if (!orderId) return res.status(200).json({ ignored: "no_reference" });

    const status = STATUS_MAP[pay.status] || pay.status;

    await db.doc(`orders/${orderId}`).set(
      {
        status,
        mpPaymentId: String(paymentId),
        mpStatus: pay.status,
        mpStatusDetail: pay.status_detail || null,
        paidAt: pay.status === "approved" ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, order: orderId, status });
  } catch (e) {
    // Respondemos 200 igual: si devolvemos error, MP reintenta en bucle.
    return res.status(200).json({ error: String(e?.message || e) });
  }
}
