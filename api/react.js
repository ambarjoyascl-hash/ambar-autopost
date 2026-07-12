// api/react.js — suma reacciones (❤️🔥) a una pieza. Público, sin login.
// Se guardan en un blob aparte para no chocar con el catálogo.
import { getReactions, saveReactions } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  try {
    const b = req.body || {};
    const id = b.id;
    if (!id) return res.status(400).json({ error: "no_id" });
    const heart = Math.max(0, Math.min(100, parseInt(b.heart, 10) || 0));
    const fire = Math.max(0, Math.min(100, parseInt(b.fire, 10) || 0));
    if (!heart && !fire) return res.status(200).json({ ok: true });

    const map = await getReactions();
    const cur = map[id] || { heart: 0, fire: 0 };
    map[id] = { heart: cur.heart + heart, fire: cur.fire + fire };
    await saveReactions(map);
    return res.status(200).json({ ok: true, reactions: map[id] });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
