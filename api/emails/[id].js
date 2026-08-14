// api/emails/[id].js
// GET    /api/emails/:id  → email completo, dibujado con la identidad ACTUAL de
//        la marca (ver renderEmail): así el panel muestra el correo tal como
//        va a salir, no como estaba el día que se generó.
// POST   /api/emails/:id  → {action:"send"}  envía la campaña a la audiencia
//                           {action:"test", to} manda una prueba a una sola
//                           dirección, sin tocar el estado de la campaña
// PUT    /api/emails/:id  → cambia estado (ej. {status:"sent"}) o edita campos
// DELETE /api/emails/:id  → elimina el email
// GET/POST /api/emails/unsubscribe → baja de la lista (id reservado). NO lleva
//        sesión: lo abre el cliente desde su correo, y va firmado.
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { db } from "../../lib/firebase-admin.js";
import { handleUnsubscribe } from "../../lib/unsubscribe.js";
import { getBrand } from "../../lib/brands.js";
import { renderEmail } from "../../lib/email-template.js";
import { procesarCampana, remitente } from "../../lib/mailer.js";

const EDITABLE = ["subject", "previewText", "status"];

export default withErrors(async function handler(req, res) {
  const { id: reservado } = req.query;
  if (reservado === "unsubscribe") return handleUnsubscribe(req, res);

  const user = await checkAuth(req, res);
  if (!user) return;
  const { id } = req.query;
  const ref = db.collection("emails").doc(id);

  const existing = await ref.get();
  if (!existing.exists) return res.status(404).json({ error: "Email no encontrado." });
  if (!(await requireBrand(req, res, user, existing.data().brandId))) return;

  const email = { id: existing.id, ...existing.data() };

  if (req.method === "GET") {
    const brand = await getBrand(email.brandId);
    const dibujo = renderEmail(brand || {}, email);
    // `audiencia` puede traer más de mil direcciones: no tiene para qué viajar
    // al navegador, y de paso son datos de clientes.
    const { audiencia, ...resto } = email;
    return res.status(200).json({
      email: { ...resto, html: dibujo.html, plainText: dibujo.plainText },
      audienciaTotal: (audiencia || []).length,
    });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const accion = body.action;
    const brand = await getBrand(email.brandId);
    if (!brand) return res.status(404).json({ error: "Marca no encontrada." });

    // Antes de intentar nada se comprueba el remitente: si falta, SES rechaza
    // el envío con un error críptico y la campaña queda marcada como fallida.
    try {
      remitente(brand);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (accion === "test") {
      const to = String(body.to || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return res.status(400).json({ error: "Escribe una dirección de correo válida para la prueba." });
      }
      const r = await procesarCampana({ ref, email, brand, soloA: to });
      return res.status(200).json(r);
    }

    if (accion === "send") {
      if (email.status === "sent") {
        return res.status(400).json({ error: "Esta campaña ya se envió." });
      }
      // Enviar a mano una campaña con fecha futura la adelanta a ahora: si no
      // alcanza a terminar dentro del tiempo de la función, el cron solo
      // retoma lo que ya venció, y si no se adelantara quedaría a medias.
      const patch = { status: "ready", error: null };
      if ((email.scheduledFor || 0) > Date.now()) patch.scheduledFor = Date.now();
      await ref.set(patch, { merge: true });
      const r = await procesarCampana({ ref, email: { ...email, ...patch }, brand });
      if (r.error) return res.status(400).json({ error: r.error });
      return res.status(200).json(r);
    }

    return res.status(400).json({ error: "Acción no reconocida." });
  }

  if (req.method === "PUT") {
    const body = await readJson(req);
    const patch = { updatedAt: Date.now() };
    for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return res.status(200).json({ email: { id: snap.id, ...snap.data() } });
  }

  if (req.method === "DELETE") {
    await ref.delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
