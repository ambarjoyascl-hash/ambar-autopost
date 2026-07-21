// lib/api-helpers.js
// Utilidades compartidas por las funciones serverless de `api/`:
// autenticación del panel, parseo de body JSON y respuestas uniformes.

import "./firebase-admin.js";
import { getAuth } from "firebase-admin/auth";

/**
 * Protege los endpoints del panel. Acepta dos formas de autenticación:
 * 1. Sesión de Firebase Auth (email/contraseña o Google): el frontend manda el
 *    ID token en `Authorization: Bearer <token>`. Si ALLOWED_EMAILS está
 *    definida (emails separados por coma), solo esas cuentas tienen acceso.
 * 2. Contraseña compartida (APP_PASSWORD) en el header `x-app-password` —
 *    se mantiene para scripts y pruebas con curl.
 * Devuelve true si está autorizado; si no, responde y devuelve false.
 */
export async function checkAuth(req, res) {
  const pw = req.headers["x-app-password"];
  if (pw && process.env.APP_PASSWORD && pw === process.env.APP_PASSWORD) {
    return true;
  }

  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (bearer) {
    try {
      const decoded = await getAuth().verifyIdToken(bearer);
      const allowed = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const email = (decoded.email || "").toLowerCase();
      if (!allowed.length || allowed.includes(email)) return true;
      res.status(401).json({
        error:
          `La cuenta ${decoded.email || "(sin email)"} no tiene acceso a este panel. ` +
          "Para autorizarla, agrega su email a la variable ALLOWED_EMAILS en Vercel.",
      });
      return false;
    } catch (_) {
      // Token inválido o expirado → cae al 401 genérico.
    }
  }
  res.status(401).json({ error: "No autorizado. Inicia sesión de nuevo." });
  return false;
}

/** Igual que checkAuth pero para los crons (usa CRON_SECRET). */
export function checkCron(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

/** Lee el body JSON de la request (compatible con el runtime Node de Vercel). */
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  // Fallback: leer el stream manualmente.
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

/** Envuelve un handler para capturar errores y responder JSON uniforme. */
export function withErrors(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err.message || err) });
      }
    }
  };
}
