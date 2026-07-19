// lib/api-helpers.js
// Utilidades compartidas por las funciones serverless de `api/`:
// autenticación del panel, parseo de body JSON y respuestas uniformes.

/**
 * Protege los endpoints del panel con una contraseña compartida (APP_PASSWORD).
 * El frontend la manda en el header `x-app-password`.
 * Devuelve true si está autorizado; si no, responde y devuelve false.
 */
export function checkAuth(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({
      error:
        "APP_PASSWORD no está configurada. Define esta variable de entorno en " +
        "Vercel para proteger el panel antes de usarlo.",
    });
    return false;
  }
  const provided =
    req.headers["x-app-password"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    res.status(401).json({ error: "No autorizado. Contraseña incorrecta." });
    return false;
  }
  return true;
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
