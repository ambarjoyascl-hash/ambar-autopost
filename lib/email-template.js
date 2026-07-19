// lib/email-template.js
// Construye el HTML de un email a partir de las secciones que generó la IA y los
// productos elegidos. Usa HTML con estilos en línea (lo que mejor soportan los
// clientes de correo) para que puedas pegarlo/enviarlo tal cual desde Shopify Email.

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(price, currency) {
  if (!price) return "";
  const n = Number(price);
  const val = Number.isNaN(n) ? price : n.toLocaleString("es-CL");
  return `${currency || ""} ${val}`.trim();
}

/**
 * @param {Object} opts
 * @param {Object} opts.brand
 * @param {Object} opts.email  { subject, previewText, heading, intro, ctaText, ctaUrl, closing }
 * @param {Array}  opts.products [{ title, price, currency, imageUrl, productUrl }]
 * @returns {{ subject, previewText, html, plainText }}
 */
export function buildEmailHtml({ brand, email, products = [] }) {
  const accent = "#b08d57"; // dorado suave; el usuario puede cambiarlo
  const site = brand.websiteUrl || (products[0] && products[0].productUrl) || "#";
  const cta = email.ctaUrl || (products[0] && products[0].productUrl) || site;

  const productCards = products
    .map(
      (p) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr>
          <td style="padding:0;">
            <a href="${esc(p.productUrl || cta)}" style="text-decoration:none;color:inherit;">
              <img src="${esc(p.imageUrl)}" alt="${esc(p.title || "")}" width="560"
                   style="width:100%;max-width:560px;border-radius:12px;display:block;" />
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 4px 0 4px;text-align:center;">
            <div style="font-size:18px;font-weight:600;color:#1a1a1a;">${esc(p.title || "")}</div>
            ${p.price ? `<div style="font-size:16px;color:${accent};margin-top:4px;">${esc(money(p.price, p.currency))}</div>` : ""}
          </td>
        </tr>
      </table>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${esc(brand.voice?.language || "es")}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(email.subject || brand.name)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(email.previewText || "")}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f0;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;text-align:center;border-bottom:1px solid #eee;">
              <div style="font-size:22px;font-weight:700;letter-spacing:1px;color:#1a1a1a;">${esc(brand.name)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 12px 0;font-size:26px;line-height:1.25;color:#1a1a1a;text-align:center;">${esc(email.heading || "")}</h1>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#444;text-align:center;">${esc(email.intro || "")}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              ${productCards}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px 32px;text-align:center;">
              <a href="${esc(cta)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:16px;font-weight:600;">${esc(email.ctaText || "Ver más")}</a>
              ${email.closing ? `<p style="margin:28px 0 0 0;font-size:15px;line-height:1.6;color:#555;">${esc(email.closing)}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#faf8f5;text-align:center;border-top:1px solid #eee;">
              <div style="font-size:13px;color:#999;">${esc(brand.name)} · <a href="${esc(site)}" style="color:#999;">${esc((site || "").replace(/^https?:\/\//, ""))}</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plainText = [
    email.heading,
    "",
    email.intro,
    "",
    ...products.map((p) => `• ${p.title}${p.price ? ` — ${money(p.price, p.currency)}` : ""} ${p.productUrl || ""}`),
    "",
    `${email.ctaText || "Ver más"}: ${cta}`,
    "",
    email.closing || "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return {
    subject: email.subject || brand.name,
    previewText: email.previewText || "",
    html,
    plainText,
  };
}
