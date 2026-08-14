// api/cron/[task].js
// Una sola función para ambas tareas programadas (límite de funciones del plan Hobby):
//   POST /api/cron/publish        (cada 5 min) publica los posts "pending" cuya hora llegó
//   POST /api/cron/refresh-token  (semanal)    refresca los tokens de Meta de todas las marcas
import { db } from "../../lib/firebase-admin.js";
import { publishPost } from "../../lib/publish.js";
import { getBrandCredentials, getPublishingLimit, refreshBrandToken } from "../../lib/meta.js";
import { refreshPinterestToken } from "../../lib/pinterest.js";
import { listBrands, getBrand } from "../../lib/brands.js";
import { checkCron } from "../../lib/api-helpers.js";
import { procesarCampana } from "../../lib/mailer.js";

export default async function handler(req, res) {
  if (!checkCron(req, res)) return;

  const { task } = req.query;
  if (task === "publish") return publishDue(res);
  if (task === "refresh-token") return refreshTokens(res);
  return res.status(404).json({ error: "Tarea desconocida." });
}

async function publishDue(res) {
  const now = Date.now();
  const snap = await db
    .collection("scheduledPosts")
    .where("status", "==", "pending")
    .where("scheduledFor", "<=", now)
    .orderBy("scheduledFor")
    .limit(10)
    .get();

  const results = [];
  const limitCache = new Map(); // brandId → ¿cuota agotada?

  for (const doc of snap.docs) {
    const post = doc.data();

    // Cortafuegos de rate limit por marca.
    try {
      if (!limitCache.has(post.brandId)) {
        const creds = await getBrandCredentials(post.brandId);
        const limit = await getPublishingLimit(creds);
        const reached =
          limit && limit.config && limit.quota_usage >= limit.config.quota_total;
        limitCache.set(post.brandId, !!reached);
      }
      if (limitCache.get(post.brandId)) {
        results.push({ id: doc.id, skipped: "rate_limit" });
        continue;
      }
    } catch (_) {
      // si no se pudo leer el límite, seguimos e intentamos publicar
    }

    // Lock optimista para evitar doble publicación.
    try {
      await doc.ref.update({ status: "publishing", lockedAt: now });
    } catch (_) {
      continue;
    }

    try {
      const out = await publishPost(post);
      await doc.ref.update({
        status: "published",
        publishedAt: Date.now(),
        error: [
          out.fbError && `Facebook: ${out.fbError}`,
          out.pinError && `Pinterest: ${out.pinError}`,
        ].filter(Boolean).join(" · ") || null,
        igMediaId: out.igMediaId || null,
        fbPostId: out.fbPostId || null,
        pinId: out.pinId || null,
      });
      results.push({ id: doc.id, ok: true });
    } catch (err) {
      // Un fallo pasajero (token caído, cuota, red) NO debe quemar el post: se
      // deja en pending para reintentar cuando el problema se arregle. Solo se
      // marca error lo que no tiene arreglo solo, o lo que ya llegó demasiado
      // tarde como para publicarlo (un "solo por hoy" cinco días después, no).
      const msg = String(err.message || err);
      // Los permisos que faltan también son pasajeros: se arreglan en la app de
      // Meta y el post vuelve a servir. Quemarlo obliga a rehacerlo a mano.
      const pasajero =
        /access token|session has been invalidated|rate limit|too many|quota|timeout|ETIMEDOUT|ECONNRESET|fetch failed|socket|temporarily|does not have permission|\(#10\)|\(#200\)|\b5\d\d\b/i.test(msg);
      const intentos = (post.attempts || 0) + 1;
      const tardeMs = Date.now() - (post.scheduledFor || 0);
      const demasiadoTarde = tardeMs > 48 * 3600 * 1000;

      if (pasajero && !demasiadoTarde) {
        await doc.ref.update({
          status: "pending",
          attempts: intentos,
          error: msg,
          lastTriedAt: Date.now(),
        });
        results.push({ id: doc.id, retry: true, attempts: intentos, error: msg });
      } else {
        await doc.ref.update({
          status: "error",
          attempts: intentos,
          error: demasiadoTarde
            ? `No se pudo publicar dentro de las 48 h siguientes a su horario. Último fallo: ${msg}`
            : msg,
        });
        results.push({ id: doc.id, ok: false, error: msg });
      }
    }
  }

  // El mismo pase manda los correos que llegaron a su hora, para no depender de
  // otro workflow que haya que configurar aparte.
  let emails = [];
  try {
    emails = await sendDueEmails(now);
  } catch (err) {
    emails = [{ error: String(err.message || err) }];
  }

  return res.status(200).json({ processed: results.length, results, emails });
}

/**
 * Manda las campañas cuya hora llegó.
 *
 * Solo envía si la marca tiene el envío activado (`brand.email.enabled`). Es a
 * propósito: sin ese interruptor, activar SES dispararía de golpe todos los
 * correos que ya estaban en "listo", a toda la base. Hay que encenderlo a mano
 * por marca.
 *
 * El envío es reanudable: guarda la lista de destinatarios y por dónde va, así
 * que si no alcanza a terminar dentro del tiempo de la función, el siguiente
 * pase del cron continúa donde quedó.
 */
/** Después de esto una campaña ya no sale sola (mismas 48 h que los posts). */
const VENCE_MS = 48 * 3600 * 1000;

async function sendDueEmails(now) {
  const snap = await db
    .collection("emails")
    .where("scheduledFor", "<=", now)
    .orderBy("scheduledFor")
    .limit(10)
    .get();

  const out = [];
  for (const doc of snap.docs) {
    const email = { id: doc.id, ...doc.data() };
    if (!["ready", "sending"].includes(email.status)) continue;

    const brand = await getBrand(email.brandId);
    if (!brand) continue;
    if (!brand.email?.enabled) {
      out.push({ id: doc.id, skipped: "envio-desactivado" });
      continue;
    }

    // Una campaña muy vencida NO se manda. Al 14-ago-2026 había 15 campañas en
    // "listo" con fechas de días anteriores, esperando a que se encendiera el
    // envío: encenderlo habría soltado todas juntas a la lista completa, con
    // promociones de la semana pasada. Es la misma regla de 48 h que ya tenían
    // los posts de Instagram.
    const atraso = Date.now() - (email.scheduledFor || 0);
    if (email.status === "ready" && atraso > VENCE_MS) {
      const dias = Math.floor(atraso / 864e5);
      await doc.ref.set({
        status: "expired",
        error: `No se envió a tiempo: su fecha era hace ${dias} día${dias === 1 ? "" : "s"}. ` +
          `Si todavía la quieres mandar, ábrela y usa "Enviar a toda la lista".`,
      }, { merge: true });
      out.push({ id: doc.id, skipped: "vencida" });
      continue;
    }

    try {
      // Todo el envío (audiencia, reanudación, pie de baja, redibujado con la
      // identidad actual de la marca) vive en lib/mailer.js, compartido con el
      // botón "Enviar ahora" del panel.
      const r = await procesarCampana({ ref: doc.ref, email, brand });
      out.push({ id: doc.id, ...r });
    } catch (err) {
      await doc.ref.set({ status: "error", error: String(err.message || err) }, { merge: true });
      out.push({ id: doc.id, error: String(err.message || err) });
    }
  }
  return out;
}

async function refreshTokens(res) {
  // admin:true — el cron debe ver TODAS las marcas (multi-cliente).
  const brands = await listBrands({ redacted: false, admin: true });
  const results = [];
  for (const brand of brands) {
    if (brand.instagram?.longLivedUserToken) {
      try {
        await refreshBrandToken(brand.id);
        results.push({ brand: brand.name, meta: true });
      } catch (err) {
        results.push({ brand: brand.name, meta: false, error: String(err.message || err) });
      }
    }
    if (brand.pinterest?.refreshToken) {
      try {
        await refreshPinterestToken(brand.id);
        results.push({ brand: brand.name, pinterest: true });
      } catch (err) {
        results.push({ brand: brand.name, pinterest: false, error: String(err.message || err) });
      }
    }
  }
  return res.status(200).json({ ok: true, refreshedAt: Date.now(), results });
}
