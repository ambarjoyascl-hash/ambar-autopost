// lib/unsubscribe.js
// Enlace de baja de las campañas.
//
// El link va firmado y lleva dentro a quién dar de baja, así que no hace falta
// sesión: lo abre el cliente desde su correo. Va firmado justamente para que
// nadie pueda dar de baja a terceros cambiando el email en la URL.
//
// La baja se registra en Shopify (fuente de verdad del consentimiento), no en
// una lista aparte: así se respeta también en los correos que la propia tienda
// envíe por su cuenta.
import crypto from "crypto";
import { getBrand } from "./brands.js";
import { unsubscribeCustomer } from "./shopify.js";

function secreto() {
  const s = process.env.CRON_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error("Falta CRON_SECRET para firmar los enlaces de baja.");
  return s;
}

const b64u = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");

export function firmarBaja(payload) {
  const cuerpo = b64u(payload);
  const mac = crypto.createHmac("sha256", secreto()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${mac}`;
}

export function verificarBaja(token = "") {
  const [cuerpo, mac] = String(token).split(".");
  if (!cuerpo || !mac) return null;
  const esperado = crypto.createHmac("sha256", secreto()).update(cuerpo).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  // Sin caducidad a propósito: un enlace de baja tiene que funcionar siempre,
  // aunque el cliente abra el correo meses después.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function pagina(res, codigo, titulo, cuerpo) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(codigo).send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${titulo}</title>
     <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:12vh auto;padding:0 24px;text-align:center;color:#1f2937">
       ${cuerpo}
     </div>`
  );
}

/**
 * GET  /api/emails/unsubscribe?t=...  → el cliente pulsó el enlace del correo.
 * POST /api/emails/unsubscribe?t=...  → baja en un clic de Gmail/Outlook
 *      (cabecera List-Unsubscribe-Post); no debe devolver HTML ni pedir nada.
 */
export async function handleUnsubscribe(req, res) {
  const datos = verificarBaja(req.query.t);
  if (!datos?.brandId || !datos?.to) {
    if (req.method === "POST") return res.status(400).json({ error: "enlace inválido" });
    return pagina(res, 400, "Enlace inválido", "<h2>Enlace inválido</h2><p>Escríbenos y te damos de baja a mano.</p>");
  }

  try {
    const brand = await getBrand(datos.brandId);
    if (!brand) throw new Error("marca no encontrada");
    await unsubscribeCustomer(brand, datos.to);

    if (req.method === "POST") return res.status(200).json({ ok: true });
    return pagina(
      res,
      200,
      "Listo",
      `<h2>Listo, no te escribimos más ✓</h2>
       <p style="color:#6b7280;line-height:1.6">Diste de baja a <b>${datos.to}</b> de los correos de ${brand.name}.
       El cambio ya quedó registrado; puede que aún recibas algo que estuviera saliendo en este momento.</p>`
    );
  } catch (err) {
    // Nunca dejar al cliente sin salida: si algo falla, se le dice cómo seguir.
    if (req.method === "POST") return res.status(500).json({ error: String(err.message || err) });
    return pagina(
      res,
      500,
      "No pudimos completarlo",
      `<h2>No pudimos completar la baja</h2>
       <p style="color:#6b7280;line-height:1.6">Respóndenos el correo con la palabra <b>BAJA</b> y te sacamos de la lista a mano.</p>`
    );
  }
}
