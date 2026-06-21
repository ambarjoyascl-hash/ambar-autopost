// api/cron/refresh-token.js
// Cron (semanal): refresca el long-lived user token y re-deriva el page token.
import { refreshLongLivedToken } from "../../lib/meta.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    await refreshLongLivedToken();
    return res.status(200).json({ ok: true, refreshedAt: Date.now() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
