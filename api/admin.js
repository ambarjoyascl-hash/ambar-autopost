// api/admin.js — operaciones del panel (protegidas por contraseña).
// action: "list" | "save" | "sold" | "delete"
import { getItems, saveItems, deleteMedia } from "../lib/store.js";

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const body = req.body || {};
  if (!process.env.ADMIN_PASSWORD || body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    let items = await getItems();
    const action = body.action;

    if (action === "list") return res.status(200).json({ ok: true, items });

    if (action === "save") {
      const it = body.item || {};
      const price = Math.max(0, parseInt(it.price, 10) || 0);
      if (!it.mediaUrl || price <= 0) return res.status(400).json({ error: "invalid_item" });
      const item = {
        id: it.id || newId(),
        title: (it.title || "Pieza de oro").slice(0, 120),
        price,
        desc: (it.desc || "").slice(0, 300),
        mediaUrl: it.mediaUrl,
        mediaType: it.mediaType === "video" ? "video" : "image",
        sold: !!it.sold,
        visible: it.visible !== false,
        createdAt: it.createdAt || Date.now(),
      };
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items[idx] = item;
      else items.unshift(item);
      await saveItems(items);
      return res.status(200).json({ ok: true, item, items });
    }

    if (action === "sold") {
      const it = items.find((x) => x.id === body.id);
      if (it) it.sold = !!body.sold;
      await saveItems(items);
      return res.status(200).json({ ok: true, items });
    }

    if (action === "delete") {
      const it = items.find((x) => x.id === body.id);
      items = items.filter((x) => x.id !== body.id);
      await saveItems(items);
      if (it?.mediaUrl) await deleteMedia(it.mediaUrl);
      return res.status(200).json({ ok: true, items });
    }

    return res.status(400).json({ error: "bad_action" });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
