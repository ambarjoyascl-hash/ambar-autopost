// lib/brand-kit.js
// Lee la identidad visual de una marca desde su propia web: logo, colores y
// tipografía. Sirve para que los emails salgan con la cara de la marca sin que
// nadie tenga que copiar códigos de color a mano (pedido de Gina, 14-ago-2026:
// "los emails son muy básicos, sin el logo ni los colores ni la font").
//
// Es detección con heurísticas, no magia: devuelve lo que encuentra y el panel
// lo muestra para confirmar o corregir antes de guardarlo. Todo lo detectado
// pasa igual por los sanitizadores de lib/brands.js.
//
// Las tiendas Shopify son el caso fácil y el más común aquí: los temas dejan
// las variables CSS (`--color-button`, `--font-heading-family`) en un <style>
// del <head>, así que se leen sin bajar la hoja de estilos.

import { fetchText, normalizeBase, absolutize, attr } from "./scrape.js";

/** Grises, blancos y negros: son fondo y texto, nunca el color de la marca. */
function esNeutro(hex) {
  const { r, g, b } = aRgb(hex) || {};
  if (r == null) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18) return true; // gris
  return max < 26 || min > 236; // casi negro / casi blanco
}

function aRgb(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function aHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Shopify guarda los colores como "18,18,18" para poder hacer rgba(var(--x), .5). */
function tripleteAHex(valor) {
  const m = String(valor).trim().match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  return m ? aHex(m[1], m[2], m[3]) : "";
}

function normalizaColor(valor) {
  const v = String(valor || "").trim();
  const hex = v.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgb = v.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return aHex(rgb[1], rgb[2], rgb[3]);
  return tripleteAHex(v);
}

/** Valor de una variable CSS (--x: valor) en cualquier parte del texto. */
function variableCss(texto, nombres) {
  for (const n of nombres) {
    const re = new RegExp(`--${n}\\s*:\\s*([^;}]+)`, "i");
    const m = texto.match(re);
    if (m) {
      const c = normalizaColor(m[1]);
      if (c) return c;
    }
  }
  return "";
}

/** Primera familia con nombre propio de un font-family (ignora las genéricas). */
function primeraFamilia(valor) {
  const genericas = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|inherit|initial|unset|-apple-system|blinkmacsystemfont|segoe ui|helvetica|helvetica neue|arial|roboto|times|times new roman|georgia|courier\w*)$/i;
  for (const parte of String(valor || "").split(",")) {
    const f = parte.replace(/["']/g, "").trim();
    if (!f || genericas.test(f)) continue;
    if (/^var\(|^\$/.test(f)) continue;
    return f;
  }
  return "";
}

function familiaCss(texto, nombres) {
  for (const n of nombres) {
    const m = texto.match(new RegExp(`--${n}\\s*:\\s*([^;}]+)`, "i"));
    if (m) {
      const f = primeraFamilia(m[1]);
      if (f) return f;
    }
  }
  return "";
}

/** Tipografías que se piden a Google Fonts: el nombre está en la propia URL. */
function fuentesDeGoogle(html) {
  const out = [];
  const re = /fonts\.googleapis\.com\/css2?\?([^"'>]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    const q = m[1].replace(/&amp;/g, "&");
    for (const fam of q.matchAll(/family=([^&:]+)/g)) {
      const nombre = decodeURIComponent(fam[1]).replace(/\+/g, " ").trim();
      if (nombre) out.push(nombre);
    }
  }
  return [...new Set(out)];
}

/** El <style> del <head> y los style="" sueltos, todo junto. */
function estilosEmbebidos(html) {
  const trozos = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) trozos.push(m[1]);
  return trozos.join("\n").slice(0, 400_000);
}

/**
 * El logo. Se prueban las pistas de más fiable a menos, y se prefiere PNG/JPG:
 * Gmail no dibuja SVG, así que un logo SVG en un email sale como un hueco.
 */
function buscarLogo(html, origin) {
  const candidatos = [];
  const add = (src, peso, motivo) => {
    const u = absolutize(String(src || "").trim(), origin);
    if (!u || !/^https?:\/\//.test(u)) return;
    if (/\.svg(\?|$)/i.test(u)) peso -= 50; // Gmail no lo muestra
    if (/sprite|placeholder|blank|1x1|pixel/i.test(u)) return;
    candidatos.push({ url: u, peso, motivo });
  };

  // 1. JSON-LD de la organización: es el dato declarado por la propia tienda.
  //    Se parsea como JSON de verdad y no con una expresión regular, porque la
  //    URL viene escapada al estilo JSON ("\/cdn\/...&#92;u0026width=500") y sacarla
  //    en crudo dejaba barras dobles y un "&" en vez del "&".
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let url = "";
    try {
      const buscar = (n) => {
        if (!n || typeof n !== "object") return "";
        if (typeof n.logo === "string") return n.logo;
        if (n.logo && typeof n.logo.url === "string") return n.logo.url;
        for (const v of Array.isArray(n) ? n : Object.values(n)) {
          const r = buscar(v);
          if (r) return r;
        }
        return "";
      };
      url = buscar(JSON.parse(m[1].trim()));
    } catch (_) {
      const crudo = m[1].match(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*"url"\s*:\s*"([^"]+)")/i);
      url = (crudo?.[1] || crudo?.[2] || "").replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
    }
    if (url) add(url, 100, "json-ld");
  }
  // 2. Etiquetas <img> con pinta de logo (el caso normal en temas de Shopify).
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, "src") || attr(tag, "data-src");
    if (!src) continue;
    const pistas = `${tag}`.toLowerCase();
    if (!/logo/.test(pistas)) continue;
    const enCabecera = /header|site-?header|nav/.test(pistas);
    add(src, enCabecera ? 90 : 70, "img[logo]");
  }
  // 3. Iconos declarados: cuadrados y pequeños, pero siempre son la marca.
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") || "").toLowerCase();
    if (!/apple-touch-icon|^icon$|shortcut icon/.test(rel)) continue;
    add(attr(tag, "href"), /apple-touch/.test(rel) ? 50 : 40, `link[${rel}]`);
  }
  // 4. Último recurso: la imagen social. Suele ser una foto, no el logo.
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) add(og[1], 20, "og:image");

  candidatos.sort((a, b) => b.peso - a.peso);
  return candidatos[0] || null;
}

/** El hex que más se repite en los estilos, ignorando grises y blancos. */
function colorMasUsado(css) {
  const cuenta = new Map();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = `#${m[1].toLowerCase()}`;
    const norm = hex.length === 4 ? `#${hex.slice(1).split("").map((c) => c + c).join("")}` : hex;
    if (esNeutro(norm)) continue;
    cuenta.set(norm, (cuenta.get(norm) || 0) + 1);
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  return orden.length ? orden[0][0] : "";
}

/**
 * Detecta la identidad visual de una web.
 * @param {string} websiteUrl
 * @returns {Promise<{logoUrl, color, colorBg, colorText, font, headingFont, instagramUrl, fuentes, avisos}>}
 */
export async function detectBrandKit(websiteUrl) {
  let { origin, href } = normalizeBase(websiteUrl);
  let r = await fetchText(href, { timeoutMs: 12000 });
  // ambarjoyas.cl sin www entra en un bucle de redirecciones y la petición
  // muere; con www responde perfecto (y al revés pasa en otros dominios). Antes
  // de rendirse se prueba la otra forma del dominio.
  if (!r.ok || !r.body) {
    const alterno = /^https?:\/\/www\./i.test(href)
      ? href.replace(/^(https?:\/\/)www\./i, "$1")
      : href.replace(/^(https?:\/\/)/i, "$1www.");
    const r2 = await fetchText(alterno, { timeoutMs: 12000 });
    if (r2.ok && r2.body) {
      r = r2;
      ({ origin } = normalizeBase(alterno));
      href = alterno;
    }
  }
  if (!r.ok || !r.body) {
    throw new Error(
      `No se pudo leer ${origin}${r.status ? ` (respondió ${r.status})` : ""}. Revisa la dirección de la web de la marca.`
    );
  }
  const html = r.body;
  const avisos = [];

  let css = estilosEmbebidos(html);
  // Si el tema no dejó variables en el <head>, se baja la primera hoja de
  // estilos propia. Una sola: es una petición más, no un rastreo del sitio.
  if (!/--color|--font/i.test(css)) {
    const link = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .find((t) => /stylesheet/i.test(attr(t, "rel") || "") && absolutize(attr(t, "href"), origin)?.startsWith(origin));
    if (link) {
      const hoja = await fetchText(absolutize(attr(link, "href"), origin), { timeoutMs: 8000 });
      if (hoja.ok) css += `\n${hoja.body.slice(0, 400_000)}`;
    }
  }

  const logo = buscarLogo(html, origin);
  if (logo && /\.svg(\?|$)/i.test(logo.url)) {
    avisos.push("El logo del sitio es un SVG y Gmail no dibuja SVG en los correos. Sube un PNG en Identidad visual.");
  }

  const themeColor = (html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) || [])[1];

  const color =
    variableCss(css, ["color-primary", "color-brand", "brand-color", "colorPrimary", "color-accent", "color-base-accent-1", "color-button"]) ||
    (themeColor && !esNeutro(normalizaColor(themeColor)) ? normalizaColor(themeColor) : "") ||
    colorMasUsado(css);

  const colorBg = variableCss(css, ["color-background", "color-base-background-1", "colorBackground", "background-color"]) || "";
  const colorText = variableCss(css, ["color-foreground", "color-text", "color-base-text", "colorText"]) || "";

  const google = fuentesDeGoogle(html);
  const headingFont =
    familiaCss(css, ["font-heading-family", "font-family-heading", "heading-font-family", "fontHeading"]) ||
    google[0] || "";
  const font =
    familiaCss(css, ["font-body-family", "font-family-body", "body-font-family", "fontBody"]) ||
    google[1] || google[0] || "";

  const ig = (html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i) || [])[0] || "";

  if (!logo) avisos.push("No se encontró el logo en la portada. Puedes subirlo o pegar su dirección a mano.");
  if (!color) avisos.push("No se detectó un color de marca claro; se usa el dorado por defecto.");

  return {
    logoUrl: logo?.url || "",
    logoMotivo: logo?.motivo || "",
    color: color || "",
    colorBg: colorBg && !esNeutro(colorBg) ? "" : colorBg, // el fondo SÍ debe ser neutro
    colorText: colorText || "",
    font: font || "",
    headingFont: headingFont || font || "",
    instagramUrl: ig,
    fuentes: google,
    avisos,
  };
}
