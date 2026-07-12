// api/items.js — catálogo público del live (para la tienda).
import { getItems } from "../lib/store.js";

export default async function handler(req, res) {
  const items = await getItems();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ items: items.filter((i) => i.visible !== false) });
}
