// api/status.js
// GET /api/status → indica qué está configurado en el entorno (sin exponer
// secretos). Sirve para que el panel muestre avisos útiles.
import { checkAuth, withErrors } from "../lib/api-helpers.js";

export default withErrors(async function handler(req, res) {
  if (!(await checkAuth(req, res))) return;
  return res.status(200).json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    meta: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    firebase: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY),
    cron: !!process.env.CRON_SECRET,
    contentModel: process.env.CONTENT_MODEL || "claude-sonnet-5",
    timezone: process.env.DEFAULT_TIMEZONE || "America/Santiago",
  });
});
