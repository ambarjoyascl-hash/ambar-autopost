// api/chat.js — chat en vivo del live (mensajes públicos, guardados en Blob).
import { getChat, saveChat } from "../lib/store.js";

const MAX_KEEP = 200;   // guardamos los últimos 200
const MAX_SHOW = 100;   // devolvemos los últimos 100

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[<>]/g, "").slice(0, max).trim();
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const m = await getChat();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ messages: m.slice(-MAX_SHOW) });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const text = clean(b.text, 240);
      const name = clean(b.name, 24) || "Invitada";
      if (!text) return res.status(400).json({ error: "empty" });
      const m = await getChat();
      m.push({ n: name, t: text, at: Date.now(), admin: b.admin === true });
      const trimmed = m.slice(-MAX_KEEP);
      await saveChat(trimmed);
      return res.status(200).json({ ok: true, messages: trimmed.slice(-MAX_SHOW) });
    }
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
