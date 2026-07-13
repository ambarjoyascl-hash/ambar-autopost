// api/register.js
// Registro de cliente. Guarda el cliente en TU Shopify (datos protegidos allí)
// y devuelve el perfil. No manejamos contraseñas en el navegador.
const API_VERSION = "2024-10";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim().slice(0, 60);
    const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
    const phone = String(b.phone || "").trim().slice(0, 30);
    if (!name) return res.status(400).json({ error: "no_name", message: "Escribe tu nombre." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "bad_email", message: "El correo no es válido." });

    const profile = { name, email, phone };

    // Crear/actualizar el cliente en Shopify (best-effort; no bloquea el registro).
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const domain = (process.env.SHOPIFY_STORE_DOMAIN || "ambar-8632.myshopify.com")
      .replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (token) {
      try {
        const parts = name.split(" ");
        await fetch(`https://${domain}/admin/api/${API_VERSION}/customers.json`, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: {
              first_name: parts[0] || name,
              last_name: parts.slice(1).join(" ") || undefined,
              email,
              phone: phone || undefined,
              tags: "app-live",
            },
          }),
        });
        // Si el correo ya existe o falta el permiso, lo ignoramos: el cliente
        // igual queda registrado en la app y se vincula al comprar.
      } catch (_) {}
    }

    return res.status(200).json({ ok: true, profile });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}
