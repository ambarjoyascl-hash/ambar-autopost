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
import { getSubscribedCustomers } from "./shopify.js";
import { renderEmail, pieDeBaja } from "./email-template.js";

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
async function enviarUno({ from, replyTo, to, subject, html, text, urlBaja }) {
  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      // Sin esto, las respuestas de las clientas caen en el buzón del remitente
      // (que suele ser una dirección que nadie lee).
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
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
  const replyTo = (brand?.email?.replyTo || "").trim();
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
        await enviarUno({ from, replyTo, to: d.email, subject: email.subject, html, text, urlBaja });
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

/**
 * Traduce los errores de SES que sí tienen arreglo, para que el panel diga qué
 * hacer en vez de mostrar el mensaje crudo de Amazon.
 */
function explicarFallo(msg, destino = "") {
  const m = String(msg || "");
  if (/not verified/i.test(m)) {
    return (
      `Amazon SES todavía no tiene verificada esa dirección. Mientras la cuenta esté en modo prueba (sandbox) ` +
      `solo se puede escribir a direcciones verificadas${destino ? `, y ${destino} no lo está` : ""}. ` +
      `Verifícala en SES → Identities, o pide el acceso a producción para poder escribirle a tus clientes.`
    );
  }
  if (/AccountSuspended|SendingPaused/i.test(m)) {
    return "Amazon SES tiene el envío pausado en esta cuenta. Revisa el panel de SES antes de reintentar.";
  }
  if (/AccessDenied|SignatureDoesNotMatch|InvalidClientTokenId/i.test(m)) {
    return "Las credenciales de Amazon SES no son válidas. Revisa AWS_SES_ACCESS_KEY_ID y AWS_SES_SECRET_ACCESS_KEY.";
  }
  return m;
}

/**
 * Manda una campaña guardada: congela la audiencia, envía lo que alcance dentro
 * del tiempo de la función y deja anotado por dónde quedó.
 *
 * Es el ÚNICO camino de envío: lo usan igual el cron (cuando llega la hora) y
 * el botón "Enviar ahora" del panel. Tener dos caminos distintos era la forma
 * segura de que uno de los dos se quedara sin el pie de baja o sin el corte por
 * tiempo.
 *
 * @param {Object} opts
 * @param {Object} opts.ref    referencia Firestore del email
 * @param {Object} opts.email  documento del email (con id)
 * @param {Object} opts.brand  marca dueña
 * @param {string} [opts.soloA] si viene, se manda SOLO a esa dirección (prueba)
 *                 y no se toca el estado ni la audiencia de la campaña.
 */
export async function procesarCampana({ ref, email, brand, soloA = "" }) {
  // El correo se vuelve a dibujar aquí con la identidad actual de la marca, no
  // con la que tenía el día que se generó (ver renderEmail).
  const dibujo = renderEmail(brand, email);
  const render = (_dest, urlBaja) =>
    pieDeBaja({ html: dibujo.html, plainText: dibujo.plainText, brand, urlBaja });

  if (soloA) {
    const r = await enviarCampana({
      brand,
      email: { ...email, subject: `[Prueba] ${dibujo.subject || email.subject}` },
      destinatarios: [{ email: soloA, firstName: "" }],
      desde: 0,
      render,
    });
    if (r.fallos.length) throw new Error(explicarFallo(r.fallos[0].error, soloA));
    return { prueba: true, enviados: r.enviados, a: soloA };
  }

  // La audiencia se congela en el primer pase: si se recalculara en cada pase,
  // un cliente nuevo correría los índices y alguien recibiría dos veces el
  // mismo correo (o ninguno).
  let audiencia = email.audiencia;
  if (!audiencia) {
    const { destinatarios, revisados } = await getSubscribedCustomers(brand);
    audiencia = destinatarios;
    await ref.set(
      { audiencia, audienciaDe: revisados, status: "sending", enviados: 0, cursor: 0 },
      { merge: true }
    );
  }
  if (!audiencia.length) {
    await ref.set({ status: "error", error: "No hay clientes suscritos a los que enviar." }, { merge: true });
    return { error: "sin destinatarios" };
  }

  const r = await enviarCampana({
    brand,
    email,
    destinatarios: audiencia,
    desde: email.cursor || 0,
    render,
  });

  const enviados = (email.enviados || 0) + r.enviados;
  const patch = {
    enviados,
    cursor: r.siguiente,
    ultimoIntento: Date.now(),
    fallos: [...(email.fallos || []), ...r.fallos].slice(-50),
  };
  if (r.abortado) {
    // Fallo de la cuenta (dominio sin verificar, claves malas, envío pausado):
    // no seguir quemando la lista contra el mismo error.
    patch.status = "error";
    patch.error = explicarFallo(r.abortado);
  } else if (r.completo) {
    patch.status = "sent";
    patch.sentAt = Date.now();
    patch.error = null;
  } else {
    patch.status = "sending";
  }
  await ref.set(patch, { merge: true });
  return { enviados: r.enviados, total: audiencia.length, estado: patch.status, error: patch.error || null };
}
