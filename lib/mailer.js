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

/**
 * Se manda con el contenido "simple" de SES más cabeceras propias.
 *
 * La cabecera List-Unsubscribe es obligatoria en la práctica: Gmail y Outlook
 * la exigen a quien manda masivo, y con ella muestran su propio botón de
 * "cancelar suscripción" — lo que evita que la gente se salga marcando el
 * correo como spam, que sí hunde la reputación del dominio.
 *
 * Antes esto obligaba a armar el MIME a mano y mandarlo como Raw, pero eso usa
 * el permiso `ses:SendRawEmail`, que la clave `sincro-ses-sender` no tiene
 * (6-ago-2026: "is not authorized to perform ses:SendRawEmail"). SESv2 acepta
 * cabeceras sobre el contenido simple, así que se consigue lo mismo con el
 * permiso `ses:SendEmail` que la clave sí tiene, y sin construir MIME.
 */
async function enviarUno({ from, to, subject, html, text, urlBaja }) {
  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            Html: { Data: html, Charset: "UTF-8" },
          },
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${urlBaja}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        },
      },
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
