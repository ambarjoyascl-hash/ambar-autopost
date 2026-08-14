// lib/email-template.js
// Construye el HTML de una campaña a partir de las secciones que escribió la IA,
// los productos elegidos y la IDENTIDAD VISUAL de la marca (logo, colores y
// tipografía guardados en `brand.brandKit`, ver lib/brand-kit.js).
//
// Reescrita el 14-ago-2026 por pedido de Gina: la versión anterior salía sin
// logo, con un dorado fijo para todas las marcas y una sola columna de fotos.
//
// Reglas de HTML para correo que explican por qué esto no se parece a una
// página web normal:
//   - Todo va en tablas anidadas con estilos EN LÍNEA. Outlook (motor de Word)
//     ignora float, flex y grid, y Gmail borra los <style> en algunos clientes.
//   - Las media queries van igual en un <style>: donde se respetan, las dos
//     columnas de productos pasan a una sola en el teléfono; donde no, se ven
//     las dos columnas, que también es aceptable.
//   - Las tipografías web casi no cargan en correo. Se pide la fuente de la
//     marca por @import (funciona en Apple Mail y iOS) y SIEMPRE se deja detrás
//     una pila de fuentes de sistema para el resto.
//   - Nada de SVG: Gmail no lo dibuja.

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Precio legible: "$9.990" en pesos, "USD 24.00" en el resto. */
function money(price, currency) {
  if (price === "" || price == null) return "";
  const n = Number(price);
  if (Number.isNaN(n)) return String(price);
  const cur = (currency || "CLP").toUpperCase();
  if (cur === "CLP") return `$${Math.round(n).toLocaleString("es-CL")}`;
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: cur }).format(n);
  } catch (_) {
    return `${cur} ${n.toLocaleString("es-CL")}`;
  }
}

function aRgb(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Luminancia relativa (WCAG). Decide si sobre un color va texto claro u oscuro. */
function luminancia(hex) {
  const c = aRgb(hex);
  if (!c) return 1;
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Texto legible sobre un fondo: no se puede dejar blanco sobre amarillo. */
function textoSobre(hex) {
  return luminancia(hex) > 0.55 ? "#111111" : "#ffffff";
}

/** Aclara un color hacia el blanco (para fondos suaves de la misma familia). */
function aclarar(hex, factor = 0.92) {
  const c = aRgb(hex);
  if (!c) return "#f7f5f2";
  const m = (v) => Math.round(v + (255 - v) * factor);
  return `#${[m(c.r), m(c.g), m(c.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Pila de fuentes: la de la marca primero y detrás las que sí existen en todos
 *  los clientes de correo. Sin esto, un cliente sin la fuente cae en Times. */
function pilaFuente(nombre, tipo = "sans") {
  const respaldo =
    tipo === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const limpio = String(nombre || "").replace(/["']/g, "").trim();
  if (!limpio) return respaldo;
  const pareceSerif = /serif|garamond|georgia|playfair|didot|bodoni|caslon|times|new york|lora|merriweather/i.test(limpio);
  const base = pareceSerif ? "Georgia, 'Times New Roman', serif" : respaldo;
  return `'${limpio}', ${base}`;
}

/** Fuentes de Google que conviene pedir por @import (solo si tienen pinta de
 *  ser de Google: las de sistema no existen ahí y la petición sería inútil). */
function importGoogle(nombres) {
  const sistema = /^(new york|sf pro|helvetica|arial|georgia|times|verdana|tahoma|segoe|roboto|system)/i;
  const fams = [...new Set(nombres.filter(Boolean).map((n) => n.replace(/["']/g, "").trim()))]
    .filter((n) => n && !sistema.test(n))
    .slice(0, 2);
  if (!fams.length) return "";
  const q = fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`).join("&");
  return `@import url('https://fonts.googleapis.com/css2?${q}&display=swap');`;
}

/**
 * Junta la identidad guardada con los valores por defecto. Una marca sin
 * `brandKit` sigue recibiendo un email decente, solo que genérico.
 */
export function resolveKit(brand = {}) {
  const k = brand.brandKit || {};
  const color = k.color || "#b08d57"; // dorado suave: el default de siempre
  const texto = k.colorText || "#1a1a1a";
  // El fondo detectado en casi toda tienda es blanco, y blanco sobre blanco deja
  // la tarjeta del correo sin borde: se ve un bloque de texto suelto. Cuando el
  // fondo es blanco (o no hay) se usa un tinte muy suave del color de la marca,
  // que enmarca el contenido sin competir con las fotos.
  const bgDetectado = k.colorBg || "";
  const casiBlanco = !bgDetectado || luminancia(bgDetectado) > 0.92;
  const bg = casiBlanco ? aclarar(color, 0.9) : bgDetectado;
  return {
    color,
    colorBoton: color,
    textoBoton: textoSobre(color),
    bg,
    panel: "#ffffff",
    texto,
    suave: aclarar(color, 0.94),
    logoUrl: k.logoUrl || "",
    fuenteCuerpo: pilaFuente(k.font, "sans"),
    fuenteTitulo: pilaFuente(k.headingFont || k.font, "serif"),
    importFuentes: importGoogle([k.headingFont, k.font]),
    instagramUrl: k.instagramUrl || "",
    footerNote: k.footerNote || "",
  };
}

/** Botón que aguanta Outlook: el color va en el <td>, no solo en el <a>. */
function boton({ url, texto, kit, ancho = false }) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="${ancho ? "width:100%;" : ""}margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${kit.colorBoton}" style="border-radius:999px;background:${kit.colorBoton};">
        <a href="${esc(url)}" style="display:inline-block;padding:15px 38px;font-family:${kit.fuenteCuerpo};font-size:16px;font-weight:700;line-height:1;color:${kit.textoBoton};text-decoration:none;border-radius:999px;letter-spacing:.3px;">${esc(texto)}</a>
      </td>
    </tr>
  </table>`;
}

/** Ficha de producto para la grilla de dos columnas. */
function fichaProducto(p, kit, currency) {
  const precio = money(p.price, p.currency || currency);
  const url = esc(p.productUrl || "#");
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${kit.panel};border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:0;">
        <a href="${url}" style="text-decoration:none;">
          <img src="${esc(p.imageUrl)}" width="252" alt="${esc(p.title || "")}"
               style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;border-radius:14px 14px 0 0;" />
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 14px 18px 14px;text-align:center;">
        <div style="font-family:${kit.fuenteTitulo};font-size:16px;line-height:1.35;color:${kit.texto};font-weight:600;">${esc(p.title || "")}</div>
        ${precio ? `<div style="font-family:${kit.fuenteCuerpo};font-size:15px;color:${kit.color};margin-top:6px;font-weight:700;">${esc(precio)}</div>` : ""}
        <a href="${url}" style="display:inline-block;margin-top:12px;font-family:${kit.fuenteCuerpo};font-size:13px;font-weight:600;color:${kit.color};text-decoration:none;border:1.5px solid ${kit.color};border-radius:999px;padding:8px 20px;">Ver</a>
      </td>
    </tr>
  </table>`;
}

/** Los productos de a dos por fila; en el teléfono se apilan (ver media query). */
function grillaProductos(products, kit, currency) {
  if (!products.length) return "";
  const filas = [];
  for (let i = 0; i < products.length; i += 2) {
    const izq = products[i];
    const der = products[i + 1];
    filas.push(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td class="col" width="50%" valign="top" style="padding:0 7px 14px 0;">${fichaProducto(izq, kit, currency)}</td>
        <td class="col" width="50%" valign="top" style="padding:0 0 14px 7px;">${der ? fichaProducto(der, kit, currency) : ""}</td>
      </tr>
    </table>`);
  }
  return filas.join("");
}

/**
 * @param {Object} opts
 * @param {Object} opts.brand
 * @param {Object} opts.email  { subject, previewText, heading, intro, ctaText, ctaUrl, closing }
 * @param {Array}  opts.products [{ title, price, currency, imageUrl, productUrl }]
 * @returns {{ subject, previewText, html, plainText }}
 */
export function buildEmailHtml({ brand, email, products = [] }) {
  const kit = resolveKit(brand);
  const currency = brand.voice?.currency || "CLP";
  const site = brand.websiteUrl || (products[0] && products[0].productUrl) || "#";
  const cta = email.ctaUrl || (products[0] && products[0].productUrl) || site;
  const ctaText = email.ctaText || "Ver la colección";
  const lang = brand.voice?.language || "es";

  // El primero manda: va grande arriba como imagen de portada y el resto va en
  // la grilla. Un email que abre con una foto grande se lee mucho mejor que uno
  // que abre con una lista.
  const [portada, ...resto] = products;

  const cabecera = kit.logoUrl
    ? `<img src="${esc(kit.logoUrl)}" alt="${esc(brand.name)}" height="42"
           style="display:block;margin:0 auto;max-height:42px;width:auto;max-width:230px;border:0;" />`
    : `<div style="font-family:${kit.fuenteTitulo};font-size:24px;font-weight:700;letter-spacing:2px;color:${kit.texto};text-transform:uppercase;">${esc(brand.name)}</div>`;

  const dominio = String(site || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${esc(lang)}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${esc(email.subject || brand.name)}</title>
  <style>
    ${kit.importFuentes}
    body { margin:0 !important; padding:0 !important; width:100% !important; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    /* Outlook no entiende border-radius: al menos que no rompa el ancho. */
    table { border-collapse:collapse !important; }
    @media only screen and (max-width:620px) {
      /* table-layout:fixed es la clave: sin él, la tabla no puede encogerse por
         debajo del ancho de la foto de portada (600 px) y en el teléfono el
         texto se salía cortado por el borde derecho. La tabla tiene una sola
         columna en cada fila, así que el reparto fijo no cambia nada más. */
      .caja { width:100% !important; max-width:100% !important; table-layout:fixed !important; }
      .caja img { max-width:100% !important; height:auto !important; }
      .pad { padding-left:20px !important; padding-right:20px !important; }
      /* Dos columnas de producto pasan a una sola en el teléfono. */
      .col { display:block !important; width:100% !important; padding:0 0 14px 0 !important; }
      .h1 { font-size:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${kit.bg};">
  <!-- Texto de vista previa: lo que se lee en la bandeja antes de abrir. Los
       caracteres invisibles del final evitan que la bandeja rellene el resto
       con el primer párrafo del cuerpo. -->
  <div style="display:none;font-size:1px;color:${kit.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(email.previewText || "")}
    ${"&#8203;&nbsp;".repeat(60)}
  </div>

  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${kit.bg};">
    <tr>
      <td align="center" style="padding:26px 12px 34px 12px;">
        <table role="presentation" class="caja" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${kit.panel};border-radius:18px;overflow:hidden;">

          <!-- Franja del color de la marca -->
          <tr><td style="height:5px;background:${kit.color};line-height:5px;font-size:0;">&nbsp;</td></tr>

          <!-- Logo -->
          <tr>
            <td class="pad" align="center" style="padding:26px 32px 16px 32px;">
              <a href="${esc(site)}">${cabecera}</a>
            </td>
          </tr>

          ${portada?.imageUrl ? `<!-- Portada -->
          <tr>
            <td style="padding:0;">
              <a href="${esc(portada.productUrl || cta)}">
                <img src="${esc(portada.imageUrl)}" width="600" alt="${esc(portada.title || brand.name)}"
                     style="display:block;width:100%;max-width:100%;height:auto;border:0;" />
              </a>
            </td>
          </tr>` : ""}

          <!-- Título e introducción -->
          <tr>
            <td class="pad" style="padding:30px 40px 6px 40px;text-align:center;">
              <h1 class="h1" style="margin:0 0 14px 0;font-family:${kit.fuenteTitulo};font-size:29px;line-height:1.22;color:${kit.texto};font-weight:700;">${esc(email.heading || "")}</h1>
              <p style="margin:0;font-family:${kit.fuenteCuerpo};font-size:16px;line-height:1.65;color:#4a4a4a;">${esc(email.intro || "")}</p>
            </td>
          </tr>

          <!-- Llamado a la acción principal -->
          <tr>
            <td class="pad" align="center" style="padding:26px 40px 6px 40px;">
              ${boton({ url: cta, texto: ctaText, kit })}
            </td>
          </tr>

          ${resto.length ? `<!-- Productos -->
          <tr>
            <td class="pad" style="padding:30px 33px 8px 33px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr><td style="padding:0 0 16px 0;text-align:center;">
                  <span style="display:inline-block;font-family:${kit.fuenteCuerpo};font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${kit.color};background:${kit.suave};padding:7px 16px;border-radius:999px;">${lang === "en" ? "For you" : "Para ti"}</span>
                </td></tr>
              </table>
              ${grillaProductos(resto, kit, currency)}
            </td>
          </tr>` : ""}

          ${email.closing ? `<tr>
            <td class="pad" style="padding:14px 40px 0 40px;text-align:center;">
              <p style="margin:0;font-family:${kit.fuenteCuerpo};font-size:15px;line-height:1.7;color:#5a5a5a;">${esc(email.closing)}</p>
            </td>
          </tr>` : ""}

          <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>

          <!-- Pie -->
          <tr>
            <td class="pad" style="padding:26px 40px 30px 40px;background:${kit.suave};text-align:center;">
              <div style="font-family:${kit.fuenteTitulo};font-size:15px;font-weight:700;color:${kit.texto};letter-spacing:1px;">${esc(brand.name)}</div>
              <div style="margin-top:8px;font-family:${kit.fuenteCuerpo};font-size:13px;color:#7a7a7a;">
                <a href="${esc(site)}" style="color:#7a7a7a;text-decoration:underline;">${esc(dominio)}</a>
                ${kit.instagramUrl ? ` &nbsp;·&nbsp; <a href="${esc(kit.instagramUrl)}" style="color:#7a7a7a;text-decoration:underline;">Instagram</a>` : ""}
              </div>
              ${kit.footerNote ? `<div style="margin-top:10px;font-family:${kit.fuenteCuerpo};font-size:12px;line-height:1.6;color:#9a9a9a;">${esc(kit.footerNote)}</div>` : ""}
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
    ...products.map((p) => `• ${p.title}${p.price ? ` — ${money(p.price, p.currency || currency)}` : ""}${p.productUrl ? `\n  ${p.productUrl}` : ""}`),
    "",
    `${ctaText}: ${cta}`,
    "",
    email.closing || "",
    "",
    `${brand.name} · ${dominio}`,
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

/**
 * Dibuja un email guardado usando la identidad ACTUAL de la marca.
 *
 * Los correos se generan con semanas o meses de anticipación. Si el HTML se
 * congelara en el momento de generarlo, cambiar el logo o el color obligaría a
 * regenerar los tres meses de campañas. Por eso cada email guarda además sus
 * piezas sueltas (`bloques`) y se vuelve a dibujar al abrirlo y al enviarlo.
 *
 * Los emails viejos, de antes de que existieran los bloques, no tienen con qué
 * redibujarse: se devuelve su HTML tal como se guardó.
 *
 * @param {Object} brand
 * @param {Object} emailDoc  documento de la colección `emails`
 * @returns {{ subject, previewText, html, plainText, redibujado: boolean }}
 */
export function renderEmail(brand, emailDoc = {}) {
  const b = emailDoc.bloques;
  if (!b || !Array.isArray(b.products)) {
    return {
      subject: emailDoc.subject || brand?.name || "",
      previewText: emailDoc.previewText || "",
      html: emailDoc.html || "",
      plainText: emailDoc.plainText || "",
      redibujado: false,
    };
  }
  const built = buildEmailHtml({
    brand,
    email: {
      subject: emailDoc.subject,
      previewText: emailDoc.previewText,
      heading: b.heading,
      intro: b.intro,
      closing: b.closing,
      ctaText: b.ctaText,
      ctaUrl: b.ctaUrl,
    },
    products: b.products,
  });
  return { ...built, redibujado: true };
}

/**
 * Pie con el enlace de baja. Se añade al enviar y no al generar, porque el
 * enlace es distinto para cada destinatario (va firmado con su dirección).
 *
 * Es obligatorio: sin una forma visible de darse de baja, la gente marca el
 * correo como spam para salirse, y eso arruina la reputación del dominio.
 */
export function pieDeBaja({ html, plainText, brand, urlBaja }) {
  const kit = resolveKit(brand);
  const pie = `
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${kit.bg};">
    <tr>
      <td align="center" style="padding:4px 16px 30px 16px;">
        <table role="presentation" class="caja" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
          <tr>
            <td style="text-align:center;font-family:${kit.fuenteCuerpo};color:#9aa1ab;font-size:12px;line-height:1.7;">
              Recibes este correo porque compraste o te suscribiste en ${esc(brand.name)}.<br />
              <a href="${urlBaja}" style="color:#9aa1ab;text-decoration:underline;">Cancelar suscripción</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  const conPie = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${pie}\n</body>`)
    : html + pie;

  return {
    html: conPie,
    text: `${plainText}\n\n—\nRecibes este correo porque compraste o te suscribiste en ${brand.name}.\nCancelar suscripción: ${urlBaja}\n`,
  };
}
