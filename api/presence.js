// api/presence.js — cuenta cuánta gente está viendo el live ahora.
// Cada visitante manda un "latido" cada ~20s; contamos los vistos en 60s.
import { getPresence, savePresence } from "../lib/store.js";

const WINDOW = 60000; // 60s

export default async function handler(req, res) {
  try {
    const now = Date.now();
    const map = await getPresence();
    // Quitar a quienes ya no están (sin latido en 60s).
    for (const k of Object.keys(map)) {
      if (now - (map[k] || 0) > WINDOW) delete map[k];
    }
    if (req.method === "POST") {
      const id = String((req.body || {}).id || "").slice(0, 40);
      if (id) {
        map[id] = now;
        await savePresence(map);
      }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ count: Object.keys(map).length });
  } catch (e) {
    return res.status(200).json({ count: 0 });
  }
}
