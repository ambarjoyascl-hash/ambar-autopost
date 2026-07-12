// api/items.js — catálogo público del live (para la tienda), con reacciones.
import { getItems, getReactions } from "../lib/store.js";

export default async function handler(req, res) {
  const [items, reactions] = await Promise.all([getItems(), getReactions()]);
  const out = items
    .filter((i) => i.visible !== false)
    .map((i) => ({ ...i, reactions: reactions[i.id] || { heart: 0, fire: 0 } }));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ items: out });
}
