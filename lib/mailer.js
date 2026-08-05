// lib/mailer.js
// Envío de las campañas de email por Amazon SES.
//
// Por qué SES y no Shopify Email: Shopify Email no tiene API de envío, solo se
// dispara a mano desde el admin. SES sí tiene API y cobra por uso (centavos al
// mes para esta lista), así que es lo que permite que Sincro mande solo.
//
// Dos límites condicionan el diseño:
//   1. Las funciones de Vercel cortan a los 60 s. Mandar toda la lista de una
//      no cabe, así que el envío guarda por dónde va y sigue en la próxima
//      pasada del cron.
//   2. SES limita los envíos por segundo. Se manda en tandas pequeñas y se
//      respeta ese techo.
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { firmarBaja } from "./unsubscribe.js";

/** Margen de seguridad: cortamos antes de que Vercel mate la función. */
const PRESUPUESTO_MS = 45_000;
/** Envíos simultáneos. SES permite bastante más, pero así no gatillamos throttling. */
const EN_PARALELO = 8;

let cliente = null;
function ses() {
  if (cliente) return cliente;
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Faltan las credenciales de Amazon SES (AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY)."
    );
  }
  cliente = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return cliente;
}

export function remitente(brand) {
  const dir = brand?.email?.from || process.env.EMAIL_FROM;
  if (!dir) {
    throw new Error(
      "Falta el remitente. Configura EMAIL_FROM (ej: \"Ámbar Joyas <ventas@ambarjoyas.cl>\")."
    );
  }
  return dir;
}

/** Un fallo de SES puede ser del destinatario o de la cuenta; solo el segundo
 *  justifica frenar la campaña entera. */
function esFalloDeCuenta(err) {
  const n = err?.name || "";
  const m = String(err?.message || "");
  return (
    /AccountSuspended|SendingPausedException|MessageRejected|AccessDenied|Throttling|TooManyRequests|ExpiredToken|InvalidClientTokenId|SignatureDoesNotMatch|Credential/i.test(
      `${n} ${m}`
    ) || /not verified/i.test(m)
  );
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
/** Asunto con acentos o emojis: hay que codificarlo o llega roto. */
const asuntoMime = (s) => `=?UTF-8?B?${b64(s)}?=`;

/**
 * Se arma el MIME a mano en vez de usar el envío "simple" de SES porque hace
 * falta la cabecera List-Unsubscribe: Gmail y Outlook la piden a quien manda
 * masivo y con ella muestran su propio botón de "cancelar suscripción", que
 * evita que la gente marque el correo como spam para salirse.
 */
function construirMime({ from, to, subject, html, text, urlBaja }) {
  const sep = `=_sincro_${Math.random().toString(36).slice(2)}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${asuntoMime(subject)}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: <${urlBaja}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `Content-Type: multipart/alternative; boundary="${sep}"`,
    "",
    `--${sep}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text),
    `--${sep}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
    `--${sep}--`,
    "",
  ].join("\r\n");
}

async function enviarUno({ from, to, subject, html, text, urlBaja }) {
  const raw = construirMime({ from, to, subject, html, text, urlBaja });
  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: { Raw: { Data: Buffer.from(raw, "utf8") } },
    })
  );
}

/**
 * Manda la campaña a los destinatarios que falten, dentro del presupuesto de
 * tiempo. Devuelve por dónde quedó para que la próxima pasada continúe.
 *
 * @param {Object} opts
 * @param {Object} opts.brand         marca (para el link de baja y el remitente)
 * @param {Object} opts.email         doc de la colección `emails`
 * @param {Array}  opts.destinatarios [{email, firstName}]
 * @param {number} opts.desde         índice desde el que continuar
 * @param {Function} opts.render      (destinatario, urlBaja) => {html, text}
 */
export async function enviarCampana({ brand, email, destinatarios, desde = 0, render }) {
  const from = remitente(brand);
  const t0 = Date.now();
  let i = desde;
  let enviados = 0;
  const fallos = [];

  while (i < destinatarios.length) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;

    const tanda = destinatarios.slice(i, i + EN_PARALELO);
    const salidas = await Promise.allSettled(
      tanda.map(async (d) => {
        const urlBaja = enlaceDeBaja(brand, email, d.email);
        const { html, text } = render(d, urlBaja);
        await enviarUno({ from, to: d.email, subject: email.subject, html, text, urlBaja });
      })
    );

    for (let k = 0; k < salidas.length; k++) {
      const s = salidas[k];
      if (s.status === "fulfilled") { enviados++; continue; }
      fallos.push({ email: tanda[k].email, error: String(s.reason?.message || s.reason) });
      // Si el problema es de la cuenta (credenciales, dominio sin verificar,
      // envío pausado), seguir sería quemar la lista contra el mismo error.
      if (esFalloDeCuenta(s.reason)) {
        return { enviados, siguiente: i + k, fallos, abortado: String(s.reason?.message || s.reason) };
      }
    }
    i += tanda.length;
  }

  return { enviados, siguiente: i, fallos, completo: i >= destinatarios.length };
}

/** URL de baja firmada, única por destinatario. */
export function enlaceDeBaja(brand, email, destinatario) {
  const base = process.env.PUBLIC_URL || "https://social-media-autopost.vercel.app";
  const token = firmarBaja({ brandId: brand.id, emailId: email.id, to: destinatario });
  return `${base}/api/emails/unsubscribe?t=${encodeURIComponent(token)}`;
}
