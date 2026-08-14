// public/app.js — Sincro
// SPA sin dependencias que implementa el diseño Postia.dc: landing pública,
// login (email/Google) y panel multi-marca con dashboard, generador de plan IA,
// calendario, cola, analíticas, precios, conexiones y ajustes.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWOTFFnh9kyiPbgr9PssYNakdBUA-f0O4",
  authDomain: "ambar-autopost.firebaseapp.com",
  projectId: "ambar-autopost",
  appId: "1:3976211763:web:b60cd8e2fbfadffa786246",
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

/* ── i18n ─────────────────────────────────────────────────────────────── */
const I18N = {
  es: {
    tagline: "Un mensaje, todas tus redes", brand: "Marca activa", addBrand: "Añadir marca",
    newPlan: "Crear nuevo calendario de publicaciones", add: "Añadir", moreLabel: "Más", logout: "Salir",
    nav: { dashboard: "Panel", create: "Crear plan", calendar: "Calendario", queue: "Cola", analytics: "Analíticas", pricing: "Planes", connections: "Conexiones", settings: "Ajustes" },
    subs: { dashboard: "Contenido coordinado de", create: "Genera el contenido con IA", calendar: "Instagram y emails agendados", queue: "Todas las piezas de contenido", analytics: "Actividad de tu contenido", pricing: "Planes de Sincro", connections: "Cuentas conectadas de", settings: "Marcas y preferencias" },
    land: {
      menu: { what: "Qué es", how: "Cómo funciona", features: "Funciones", pricing: "Precios" },
      enter: "Entrar a la app", heroBadge: "Marketing en sincronía", heroTitle: "Todas tus redes, un solo mensaje.",
      heroSub: "Sincro coordina Instagram, Facebook y tus emails para cada marca. Pídele a la IA el plan de la semana, toma las fotos de tu web y publica en todos tus canales a la vez.",
      heroCta: "Prueba gratis", heroCta2: "Ver cómo funciona", mockTitle: "Semana coordinada",
      mockRows: [["Instagram", "Lun 09:00", "Post de producto destacado"], ["Email", "Mié 08:00", "Email de campaña"], ["Instagram", "Vie 19:00", "Testimonios de clientas"]],
      strip: "Conecta tus canales y plataformas favoritas",
      whatTitle: "¿Qué es Sincro?", whatSub: "Una sola herramienta para que todas tus redes y emails digan lo mismo, al mismo tiempo.",
      what: [["Integra todos tus canales", "Instagram, Facebook y email conectados en un solo lugar, por cada una de tus marcas."], ["Un mensaje coordinado", "La IA crea posts y emails alineados para que tu marca diga lo mismo en todos lados."], ["Guía a tus clientes", "Del primer post al email de compra: acompaña a tu cliente por todos tus canales."]],
      howTitle: "Cómo funciona", howSub: "De la idea al contenido publicado en tres pasos.",
      how: [["01", "Conecta tus canales", "Vincula Instagram, Facebook, tu web y tu tienda."], ["02", "Pide tu plan a la IA", "Describe tu objetivo de la semana y Sincro genera posts y emails con fotos de tu web."], ["03", "Publica en sincronía", "Revisa el calendario y publica coordinado, a la hora ideal."]],
      featTitle: "Todo lo que tu marca necesita",
      feats: [["Multi-marca", "Gestiona varias marcas, cada una con sus canales."], ["IG + email coordinados", "Tus redes y tu email siempre alineados."], ["Fotos desde tu web", "Sincro toma las imágenes directo de tu sitio."], ["Cuentas de inspiración", "La IA aprende el estilo de las cuentas que elijas."]],
      ctaTitle: "Empieza a publicar en sincronía", ctaSub: "Coordina todas tus redes y emails desde un solo lugar.", seePlans: "Ver planes",
      footer: "© 2026 Sincro · Un mensaje, todas tus redes.",
    },
    auth: { login: "Entrar", signup: "Crear cuenta", email: "Email", pw: "Contraseña", pw2: "Repite la contraseña", pwMin: "Contraseña (mínimo 6 caracteres)", google: "Continuar con Google", first: "¿Primera vez aquí?", have: "¿Ya tienes cuenta?", forgot: "¿Olvidaste tu contraseña?", welcome: "Cuenta creada ✓ ¡Bienvenida!" },
    dash: { statsWeek: "Piezas esta semana", published: "Publicados", pending: "En cola", emails: "Emails listos", upcoming: "Próximo contenido coordinado", viewCalendar: "Ver calendario", channels: "Canales de la marca", manage: "Gestionar canales", inspiration: "Cuentas de inspiración", inspirationHint: "La IA estudia estas cuentas para inspirar el tono y estilo de cada marca.", nothing: "Nada agendado aún. Genera tu primer plan ✦" },
    create: { title: "Generar plan de contenido", subtitle: "Describe tu objetivo y la IA creará posts de Instagram y emails coordinados, con imágenes tomadas de tu web.", goalLabel: "¿Qué quieres lograr con este plan?", goalPh: "Ej: promocionar la nueva colección de plata con enfoque en regalos…", period: "¿Cuánto contenido?", startLabel: "¿Desde qué día?", startHint: "El plan arranca ese día. Puedes dejarlo programado con meses de anticipación.", tone: "Tono", channels: "Canales a generar", imageSource: "Origen de las imágenes", pullWeb: "Tomar fotos desde mi web", connected: "Conectado", notConnected: "Configura la web o Shopify en Conexiones", generate: "Generar plan", generating: "Generando plan… (~30 s)", prev: "Planes anteriores", open: "Abrir", soon: "pronto", periods: ["1 semana", "2 semanas", "1 mes", "2 meses", "3 meses"], until: "Hasta el", tones: ["Cercano y cálido", "Profesional", "Divertido", "Inspirador", "Minimalista"] },
    draft: { banner: "¡Plan generado! {n} piezas coordinadas listas para revisar.", approve: "✔ Aprobar y agendar", discard: "Descartar", back: "← Volver", scheduled: "Agendado", igTitle: "📸 Instagram", emTitle: "✉️ Campañas de email", approved: "Agendado: {p} posts y {e} emails" },
    queue: { all: "Todo", ig: "Instagram", email: "Email", published: "Publicados", publishNow: "Publicar ahora", view: "Ver / Enviar", del: "Eliminar", empty: "No hay contenido todavía. Genera un plan para llenar la cola." },
    regen: { btn: "✦ Generar otro post", title: "Generar otro post", hint: "Se reemplaza el post de ese día por uno nuevo, con un producto distinto. El día y la hora no cambian.", label: "¿Algo en particular? (opcional)", ph: "ej: que sea de aros o collares, o algo de marca sin precio", cancel: "Cancelar", go: "Generar ✦", working: "Generando…", done: "✅ Listo, tienes un post nuevo para ese día." },
    ana: { published: "Publicados (total)", queue: "En cola", emailsReady: "Emails listos", errors: "Con error", activity: "Actividad de los últimos 7 días", top: "Últimas publicaciones", soon: "Las métricas de alcance e interacción de Instagram llegarán pronto.", none: "Aún no hay publicaciones." },
    pricing: { title: "Elige tu plan", subtitle: "Todos los planes incluyen Instagram, Facebook y email coordinados con IA. Solo cambia cuántas marcas puedes gestionar.", perMonth: "/mes", popular: "Más popular", choose: "Elegir plan", brands1: "1 marca", brandsN: "{n} marcas", soon: "Muy pronto podrás contratar tu plan desde aquí. Escríbenos para partir hoy.", features: ["Posts de Instagram con IA", "Emails coordinados", "Fotos desde tu web o Shopify", "Publicación automática", "Soporte por email"] },
    conn: { social: "Redes sociales", socialHint: "Conecta las cuentas donde Sincro publicará el contenido de esta marca.", store: "Email y tienda", storeHint: "Desde dónde se toman los productos y se preparan los emails.", connect: "Conectar", reconnect: "Reconectar", connected: "Conectado", notConnected: "Sin conectar", soon: "Próximamente", igDetail: "publica tus posts automáticamente", change: "Cambiar cuenta", fbDetail: "publica también en tu Página (usa la conexión de Instagram)", pinDetail: "pines automáticos de tus productos", shopifyDetail: "productos y precios exactos", webDetail: "fotos y productos de tu sitio", inspoLong: "Añade cuentas de Instagram de referencia. La IA analiza su estilo, tono y formatos para generar contenido alineado con esta marca.", inspoPh: "@usuario_de_instagram", activate: "Activar", advanced: "Opciones avanzadas (credenciales manuales de Instagram)", guide: "📖 Ver guía paso a paso", fbNote: "Facebook usará el perfil que tengas abierto en este navegador: revisa el resumen antes de confirmar." },
    settings: { brands: "Mis marcas", prefs: "Preferencias", lang: "Idioma", langHint: "Idioma de la interfaz", auto: "Aprobar automáticamente", autoHint: "Publica sin revisión manual", edit: "Editar", newBrand: "Nueva marca", name: "Nombre de la marca", web: "Página web", webSub: "de donde se sacan fotos y productos", voice: "Voz de la marca", tone: "Tono", audience: "Público", currency: "Moneda", language: "Idioma del contenido", hashtags: "Hashtags fijos", hashtagsSub: "opcional — la IA genera los de cada post", save: "Guardar cambios", createBrand: "Crear marca", delete: "Eliminar marca", saved: "Cambios guardados ✓", created: "Marca creada ✓" },
    common: { soon: "Próximamente", loading: "Cargando…", confirmDel: "¿Eliminar definitivamente?", today: "Hoy" },
  },
  en: {
    tagline: "One message, every channel", brand: "Active brand", addBrand: "Add brand",
    newPlan: "Create new posting calendar", add: "Add", moreLabel: "More", logout: "Log out",
    nav: { dashboard: "Dashboard", create: "Create plan", calendar: "Calendar", queue: "Queue", analytics: "Analytics", pricing: "Plans", connections: "Connections", settings: "Settings" },
    subs: { dashboard: "Coordinated content for", create: "Generate your content with AI", calendar: "Instagram + email this week", queue: "All content pieces", analytics: "Your content activity", pricing: "Sincro plans", connections: "Connected accounts for", settings: "Brands and preferences" },
    land: {
      menu: { what: "What it is", how: "How it works", features: "Features", pricing: "Pricing" },
      enter: "Open the app", heroBadge: "Marketing in sync", heroTitle: "Every channel, one message.",
      heroSub: "Sincro coordinates Instagram, Facebook and your emails for each brand. Ask AI for your weekly plan, pull photos from your site and publish everywhere at once.",
      heroCta: "Try it free", heroCta2: "See how it works", mockTitle: "Coordinated week",
      mockRows: [["Instagram", "Mon 09:00", "Featured product post"], ["Email", "Wed 08:00", "Campaign email"], ["Instagram", "Fri 19:00", "Customer testimonials"]],
      strip: "Connect your favorite channels and platforms",
      whatTitle: "What is Sincro?", whatSub: "One tool that makes all your social channels and emails say the same thing, at the same time.",
      what: [["Integrate every channel", "Instagram, Facebook and email connected in one place, for each of your brands."], ["One coordinated message", "AI creates aligned posts and emails so your brand says the same thing everywhere."], ["Guide your customers", "From the first post to the purchase email: walk your customer across every channel."]],
      howTitle: "How it works", howSub: "From idea to published content in three steps.",
      how: [["01", "Connect your channels", "Link Instagram, Facebook, your site and your store."], ["02", "Ask AI for a plan", "Describe your weekly goal and Sincro generates posts and emails with photos from your site."], ["03", "Publish in sync", "Review the calendar and publish everywhere, at the perfect time."]],
      featTitle: "Everything your brand needs",
      feats: [["Multi-brand", "Manage several brands, each with its own channels."], ["IG + email in sync", "Your socials and email always aligned."], ["Photos from your site", "Sincro pulls images straight from your website."], ["Inspiration accounts", "AI learns the style of the accounts you pick."]],
      ctaTitle: "Start publishing in sync", ctaSub: "Coordinate all your channels and emails from one place.", seePlans: "See plans",
      footer: "© 2026 Sincro · One message, every channel.",
    },
    auth: { login: "Log in", signup: "Create account", email: "Email", pw: "Password", pw2: "Repeat password", pwMin: "Password (min. 6 characters)", google: "Continue with Google", first: "First time here?", have: "Already have an account?", forgot: "Forgot your password?", welcome: "Account created ✓ Welcome!" },
    dash: { statsWeek: "Pieces this week", published: "Published", pending: "Queued", emails: "Emails ready", upcoming: "Upcoming coordinated content", viewCalendar: "View calendar", channels: "Brand channels", manage: "Manage channels", inspiration: "Inspiration accounts", inspirationHint: "AI studies these accounts to inspire each brand's tone and style.", nothing: "Nothing scheduled yet. Generate your first plan ✦" },
    create: { title: "Generate content plan", subtitle: "Describe your goal and AI will create coordinated Instagram posts and emails, with images pulled from your website.", goalLabel: "What do you want to achieve with this plan?", goalPh: "e.g. promote the new silver collection with a gifting angle…", period: "How much content?", startLabel: "Starting when?", startHint: "The plan starts that day. You can schedule it months ahead.", tone: "Tone", channels: "Channels to generate", imageSource: "Image source", pullWeb: "Pull photos from my website", connected: "Connected", notConnected: "Set up your website or Shopify in Connections", generate: "Generate plan", generating: "Generating plan… (~30 s)", prev: "Previous plans", open: "Open", soon: "soon", periods: ["1 week", "2 weeks", "1 month", "2 months", "3 months"], until: "Through", tones: ["Warm & friendly", "Professional", "Playful", "Inspiring", "Minimalist"] },
    draft: { banner: "Plan generated! {n} coordinated pieces ready to review.", approve: "✔ Approve & schedule", discard: "Discard", back: "← Back", scheduled: "Scheduled", igTitle: "📸 Instagram", emTitle: "✉️ Email campaigns", approved: "Scheduled: {p} posts and {e} emails" },
    queue: { all: "All", ig: "Instagram", email: "Email", published: "Published", publishNow: "Publish now", view: "View / Send", del: "Delete", empty: "No content yet. Generate a plan to fill the queue." },
    regen: { btn: "✦ Generate another post", title: "Generate another post", hint: "That day's post is replaced with a new one, using a different product. Day and time stay the same.", label: "Anything specific? (optional)", ph: "e.g. make it earrings or necklaces, or a brand post with no price", cancel: "Cancel", go: "Generate ✦", working: "Generating…", done: "✅ Done, that day has a new post." },
    ana: { published: "Published (total)", queue: "Queued", emailsReady: "Emails ready", errors: "Errored", activity: "Last 7 days of activity", top: "Latest publications", soon: "Instagram reach and engagement metrics coming soon.", none: "No publications yet." },
    pricing: { title: "Choose your plan", subtitle: "Every plan includes AI-coordinated Instagram, Facebook and email. Only the number of brands changes.", perMonth: "/mo", popular: "Most popular", choose: "Choose plan", brands1: "1 brand", brandsN: "{n} brands", soon: "Soon you'll be able to subscribe right here. Contact us to start today.", features: ["AI Instagram posts", "Coordinated emails", "Photos from your site or Shopify", "Automatic publishing", "Email support"] },
    conn: { social: "Social channels", socialHint: "Connect the accounts where Sincro will publish this brand's content.", store: "Email & store", storeHint: "Where products come from and emails are prepared.", connect: "Connect", reconnect: "Reconnect", connected: "Connected", notConnected: "Not connected", soon: "Coming soon", igDetail: "publishes your posts automatically", change: "Change account", fbDetail: "also publish to your Page (uses the Instagram connection)", pinDetail: "automatic product pins", shopifyDetail: "exact products and prices", webDetail: "photos and products from your site", inspoLong: "Add reference Instagram accounts. AI analyzes their style, tone and formats to generate aligned content.", inspoPh: "@instagram_handle", activate: "Enable", advanced: "Advanced options (manual Instagram credentials)", guide: "📖 Step-by-step guide", fbNote: "Facebook will use whichever profile is open in this browser: check the summary before confirming." },
    settings: { brands: "My brands", prefs: "Preferences", lang: "Language", langHint: "Interface language", auto: "Auto-approve", autoHint: "Publish without manual review", edit: "Edit", newBrand: "New brand", name: "Brand name", web: "Website", webSub: "where photos and products come from", voice: "Brand voice", tone: "Tone", audience: "Audience", currency: "Currency", language: "Content language", hashtags: "Fixed hashtags", hashtagsSub: "optional — AI generates per-post hashtags", save: "Save changes", createBrand: "Create brand", delete: "Delete brand", saved: "Saved ✓", created: "Brand created ✓" },
    common: { soon: "Coming soon", loading: "Loading…", confirmDel: "Delete permanently?", today: "Today" },
  },
};

/* ── Estado ───────────────────────────────────────────────────────────── */
const state = {
  lang: localStorage.getItem("lang") || "es",
  autoApprove: localStorage.getItem("autoApprove") !== "0",
  generating: false,
  screen: "landing",
  brands: [], brandId: localStorage.getItem("brandId") || null,
  posts: [], emails: [], plans: [], dataFor: null,
  draft: null, justApproved: false,
  queueFilter: "all",
  calWeek: 0,
  menus: {},
};
const t = () => I18N[state.lang] || I18N.es;
const root = document.getElementById("root");
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const CHAN = {
  ig: { label: "Instagram", glyph: "IG", bg: "var(--ig-bg)", ink: "var(--ig-ink)", accent: "#e858a0" },
  email: { label: "Email", glyph: "@", bg: "var(--em-bg)", ink: "var(--em-ink)", accent: "#4aa3c7" },
  fb: { label: "Facebook", glyph: "f", bg: "var(--fb-bg)", ink: "var(--fb-ink)", accent: "#3b5998" },
  pin: { label: "Pinterest", glyph: "P", bg: "var(--pin-bg)", ink: "var(--pin-ink)", accent: "#e0404a" },
};
const STATUS = {
  pending: ["accent", { es: "Programado", en: "Scheduled" }],
  publishing: ["warn", { es: "Publicando", en: "Publishing" }],
  published: ["ok", { es: "Publicado", en: "Published" }],
  error: ["err", { es: "Error", en: "Error" }],
  ready: ["warn", { es: "Listo", en: "Ready" }],
  sent: ["ok", { es: "Enviado", en: "Sent" }],
  sending: ["warn", { es: "Enviando", en: "Sending" }],
  expired: ["muted", { es: "Vencida", en: "Expired" }],
  draft: ["muted", { es: "Borrador", en: "Draft" }],
  scheduled: ["ok", { es: "Agendado", en: "Scheduled" }],
};

/* ── Utilidades ───────────────────────────────────────────────────────── */
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function fmtDate(ms) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(state.lang === "en" ? "en-US" : "es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
/* ── Fechas del plan ──────────────────────────────────────────────────────
 * Las fechas del plan son días sueltos ("2026-08-14"), no instantes: se tratan
 * como texto y se arman a mano. Pasarlas por `new Date("2026-08-14")` las lee
 * como UTC y en Chile muestran el día anterior.
 * PERIODS son las semanas detrás de los botones de periodo (1 mes = 4 semanas);
 * el tope de 12 es el mismo MAX_WEEKS del servidor.                          */
const PERIODS = [1, 2, 4, 8, 12];
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysStr(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
/** Cuántas semanas de calendario separan un instante del lunes de esta semana.
 *  Es el desplazamiento que necesita el calendario para mostrarlo. */
function semanasDesdeHoy(ms) {
  const lunes = new Date(); lunes.setHours(0, 0, 0, 0);
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const d = new Date(ms);
  // La resta va sobre días de calendario, no sobre milisegundos: con el cambio
  // de hora una semana no dura 7 × 24 h y el cálculo se corría un día.
  const dias = Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(lunes.getFullYear(), lunes.getMonth(), lunes.getDate())) / 864e5
  );
  return Math.floor(dias / 7);
}
/** Días enteros entre dos fechas "YYYY-MM-DD" (b - a). */
function daysApart(a, b) {
  const [ay, am, ad] = String(a).split("-").map(Number);
  const [by, bm, bd] = String(b).split("-").map(Number);
  if (!ay || !by) return 0;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}
function fmtDay(dateStr, withYear = false) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y) return "—";
  return new Date(y, m - 1, d).toLocaleDateString(state.lang === "en" ? "en-US" : "es-CL",
    { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}
/** "84 posts · 24 emails · 15 ago → 6 nov": lo que va a salir antes de generar. */
function planSummary(o) {
  const wk = o.weeks || 1;
  const posts = 7 * wk;
  const emails = o.emailOn ? (o.emailsPerWeek || 2) * wk : 0;
  const end = addDaysStr(o.startDate, wk * 7 - 1);
  const en = state.lang === "en";
  return `${posts} posts${emails ? ` · ${emails} emails` : ""} · ${fmtDay(o.startDate)} → ${fmtDay(end, true)}` +
    (wk >= 8 ? ` · ${en ? "generating takes about a minute" : "generarlo demora cerca de un minuto"}` : "");
}
function toast(msg, isErr = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => (el.className = "toast"), 3400);
}
function statusBadge(s) {
  const [cls, labels] = STATUS[s] || ["muted", { es: s, en: s }];
  return `<span class="badge ${cls}">${esc(labels[state.lang] || labels.es)}</span>`;
}
function chanChip(id, size = 24) {
  const c = CHAN[id] || CHAN.ig;
  return `<span class="chip" style="width:${size}px;height:${size}px;background:${c.bg};color:${c.ink};font-size:${Math.round(size * 0.45)}px">${c.glyph}</span>`;
}
function logo(size = 34) {
  return `<img src="/assets/sincro-logo.png" alt="Sincro" style="width:${size}px;height:${size}px;border-radius:10px;object-fit:cover" />`;
}

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function authErrorMsg(err) {
  const map = {
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/wrong-password": "Email o contraseña incorrectos.",
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese email.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "Ese email no es válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/unauthorized-domain": "Dominio no autorizado en Firebase.",
  };
  return map[err?.code] || err?.message || "No se pudo iniciar sesión.";
}

function currentBrand() { return state.brands.find((b) => b.id === state.brandId) || null; }
function firstLine(s = "") { return String(s).split("\n")[0].slice(0, 80); }
function brandGradient(i) {
  const g = ["linear-gradient(135deg,#1e3a8a,#3b6fb5)", "linear-gradient(135deg,#e8890c,#f0b429)", "linear-gradient(135deg,#0f9b8e,#3fc7b4)", "linear-gradient(135deg,#c02e7a,#e858a0)"];
  return g[Math.max(0, i) % g.length];
}

/* ── Navegación ───────────────────────────────────────────────────────── */
function go(screen) {
  state.screen = screen;
  state.menus = {};
  render();
}
function setLang(l) {
  state.lang = l;
  localStorage.setItem("lang", l);
  render();
}

async function loadBrands() {
  const { brands } = await api("/api/brands");
  state.brands = brands;
  if (!brands.find((b) => b.id === state.brandId)) state.brandId = brands[0]?.id || null;
  if (state.brandId) localStorage.setItem("brandId", state.brandId);
  api("/api/status").then((s) => { state.sub = s.subscription || null; }).catch(() => {});
}
async function loadBrandData(force = false) {
  const id = state.brandId;
  if (!id) { state.posts = []; state.emails = []; state.plans = []; return; }
  if (!force && state.dataFor === id) return;
  const [p, e, pl] = await Promise.all([
    api(`/api/posts?brandId=${id}`).catch(() => ({ posts: [] })),
    api(`/api/emails?brandId=${id}`).catch(() => ({ emails: [] })),
    api(`/api/plans?brandId=${id}`).catch(() => ({ plans: [] })),
  ]);
  state.posts = p.posts || [];
  state.emails = e.emails || [];
  state.plans = pl.plans || [];
  state.dataFor = id;
}
const refresh = () => loadBrandData(true).then(render);

/* ── LANDING ──────────────────────────────────────────────────────────── */
function renderLanding() {
  const L = t().land;
  const pills = [["IG", "Instagram", CHAN.ig], ["f", "Facebook", CHAN.fb], ["@", "Email", CHAN.email], ["S", "Shopify", { bg: "#e9f6ef", ink: "#1f7a52" }], ["P", "Pinterest", CHAN.pin]];
  root.innerHTML = `
  <div>
    <nav class="land-nav">
      <div class="logo-lockup">${logo(36)}<div class="name">Sincro</div></div>
      <div class="links">
        <a href="#what">${L.menu.what}</a><a href="#how">${L.menu.how}</a>
        <a href="#features">${L.menu.features}</a><a href="#pricing">${L.menu.pricing}</a>
      </div>
      <button class="btn ghost sm" data-lang-toggle>🌐 ${state.lang.toUpperCase()}</button>
      <button class="btn primary" data-go-app>${L.enter}</button>
    </nav>

    <header class="hero">
      <div class="hero-grid">
        <div>
          <span class="kicker">${L.heroBadge}</span>
          <h1>${L.heroTitle}</h1>
          <p class="sub">${L.heroSub}</p>
          <div class="btn-row" style="margin-top:34px">
            <button class="btn lg white" data-go-app>${L.heroCta}</button>
            <a href="#how" class="btn lg outline">${L.heroCta2}</a>
          </div>
        </div>
        <div class="mock">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div style="font-weight:800;font-size:15px">${L.mockTitle}</div>
            <span class="badge ok"><span style="width:7px;height:7px;border-radius:50%;background:var(--ok-ink)"></span>live</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:11px">
            ${L.mockRows.map(([ch, when, label]) => {
              const c = ch === "Email" ? CHAN.email : CHAN.ig;
              return `<div class="mock-row" style="border-left:3px solid ${c.accent}">
                <div class="ph-img thumb"></div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                    <span class="badge" style="background:${c.bg};color:${c.ink}">${ch}</span>
                    <span style="font-size:11px;color:var(--muted);font-weight:600">${when}</span>
                  </div>
                  <div style="font-size:13px;font-weight:600">${label}</div>
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>
    </header>

    <section style="padding:30px 44px;background:#fff;border-bottom:1px solid var(--line)">
      <p style="text-align:center;margin:0 0 16px;font-size:12.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-2)">${L.strip}</p>
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px">
        ${pills.map(([g, n, c]) => `<span style="display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:700;padding:9px 16px;border-radius:20px;background:var(--bg);border:1px solid var(--line)"><span class="chip" style="width:22px;height:22px;background:${c.bg};color:${c.ink};font-size:11px">${g}</span>${n}</span>`).join("")}
      </div>
    </section>

    <section id="what" class="land-section">
      <h2>${L.whatTitle}</h2><p class="lead">${L.whatSub}</p>
      <div class="grid-auto">
        ${L.what.map(([tt, d], i) => `<div class="card"><span style="display:block;width:44px;height:44px;border-radius:13px;background:${brandGradient(i)};margin-bottom:16px"></span><h3 style="margin:0 0 8px;font-size:17px;font-weight:800">${tt}</h3><p style="margin:0;font-size:14px;color:#7a7264;line-height:1.6">${d}</p></div>`).join("")}
      </div>
    </section>

    <section id="how" class="land-section alt">
      <h2>${L.howTitle}</h2><p class="lead">${L.howSub}</p>
      <div class="grid-auto">
        ${L.how.map(([n, tt, d]) => `<div style="padding:8px 4px"><div style="font-size:34px;font-weight:800;color:#c3d0ec;letter-spacing:-.02em;margin-bottom:10px">${n}</div><h3 style="margin:0 0 8px;font-size:18px;font-weight:800">${tt}</h3><p style="margin:0;font-size:14px;color:#7a7264;line-height:1.6">${d}</p></div>`).join("")}
      </div>
    </section>

    <section id="features" class="land-section">
      <h2 style="margin-bottom:44px">${L.featTitle}</h2>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px">
        ${L.feats.map(([tt, d], i) => `<div class="card" style="display:flex;gap:14px;align-items:flex-start;border-radius:16px"><span style="width:36px;height:36px;border-radius:10px;flex-shrink:0;background:${brandGradient(i)}"></span><div><h3 style="margin:0 0 5px;font-size:15px;font-weight:800">${tt}</h3><p style="margin:0;font-size:13px;color:#7a7264;line-height:1.55">${d}</p></div></div>`).join("")}
      </div>
    </section>

    <section id="pricing" class="land-section alt">
      <h2>${t().pricing.title}</h2>
      <p class="lead">${t().pricing.subtitle}</p>
      ${pricingCardsHtml(null, true)}
    </section>

    <section class="land-cta">
      <h2>${L.ctaTitle}</h2>
      <p style="font-size:16.5px;color:rgba(255,255,255,.85);margin:0 auto 30px;max-width:520px;line-height:1.6">${L.ctaSub}</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn lg" style="background:#fff;color:var(--accent)" data-go-app>${L.heroCta}</button>
        <button class="btn lg" style="background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.5)" data-see-plans>${L.seePlans}</button>
      </div>
    </section>
    <footer class="land-footer">${L.footer}</footer>
  </div>`;

  $$("[data-go-app]").forEach((b) => b.addEventListener("click", () => go(auth.currentUser ? "dashboard" : "auth")));
  $("[data-see-plans]").addEventListener("click", () => go(auth.currentUser ? "pricing" : "auth"));
  $("[data-lang-toggle]").addEventListener("click", () => setLang(state.lang === "es" ? "en" : "es"));
}

/* ── AUTH ─────────────────────────────────────────────────────────────── */
const GOOGLE_SVG = `<svg width="16" height="16" viewBox="0 0 48 48" style="vertical-align:-3px"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
const OR = `<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--muted);font-size:12px"><span style="flex:1;height:1px;background:var(--line)"></span>o<span style="flex:1;height:1px;background:var(--line)"></span></div>`;

function renderAuth(mode = "login") {
  const A = t().auth;
  const isReg = mode === "register";
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo-lockup" data-go-landing style="cursor:pointer">${logo(40)}</div>
      <h1>Sincro</h1>
      <p>${isReg ? A.signup : t().tagline}</p>
      <form id="authForm">
        <div class="field"><input type="email" id="emailInput" placeholder="${A.email}" autocomplete="email" autofocus /></div>
        <div class="field"><input type="password" id="pwInput" placeholder="${isReg ? A.pwMin : A.pw}" autocomplete="${isReg ? "new" : "current"}-password" /></div>
        ${isReg ? `<div class="field"><input type="password" id="pw2Input" placeholder="${A.pw2}" autocomplete="new-password" /></div>` : ""}
        <button class="btn primary block" type="submit">${isReg ? A.signup : A.login}</button>
      </form>
      ${OR}
      <button class="btn ghost block" id="googleBtn">${GOOGLE_SVG} ${A.google}</button>
      <p style="margin-top:18px;font-size:13px">${isReg ? A.have : A.first} <a href="#" id="swapMode"><b>${isReg ? A.login : A.signup}</b></a></p>
      ${isReg ? "" : `<p style="margin-top:8px;font-size:12px"><a href="#" id="forgotLink" style="color:inherit">${A.forgot}</a></p>`}
    </div>
  </div>`;

  $("[data-go-landing]").addEventListener("click", () => go("landing"));
  $("#swapMode").addEventListener("click", (e) => { e.preventDefault(); renderAuth(isReg ? "login" : "register"); });
  $("#googleBtn").addEventListener("click", async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { toast(authErrorMsg(err), true); }
  });
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#emailInput").value.trim(), pw = $("#pwInput").value;
    if (!email || !pw) return toast("Completa el email y la contraseña.", true);
    try {
      if (isReg) {
        if (pw.length < 6) return toast(authErrorMsg({ code: "auth/weak-password" }), true);
        if (pw !== $("#pw2Input").value) return toast("Las contraseñas no coinciden.", true);
        await createUserWithEmailAndPassword(auth, email, pw);
        toast(A.welcome);
      } else {
        await signInWithEmailAndPassword(auth, email, pw);
      }
    } catch (err) { toast(authErrorMsg(err), true); }
  });
  const fl = $("#forgotLink");
  if (fl) fl.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#emailInput").value.trim();
    if (!email) return toast("Escribe tu email arriba primero.", true);
    try { await sendPasswordResetEmail(auth, email); toast("Te enviamos un email para restablecer la contraseña."); }
    catch (err) { toast(authErrorMsg(err), true); }
  });
}

/* ── SHELL ────────────────────────────────────────────────────────────── */
function renderShell(contentHtml, afterMount) {
  const T = t();
  const brand = currentBrand();
  const bi = state.brands.indexOf(brand);
  const nav1 = ["dashboard", "create", "calendar", "queue"];
  const nav2 = ["analytics", "pricing", "connections", "settings"];
  const navBtn = (id) => `
    <button class="nav-item ${state.screen === id ? "active" : ""}" data-nav="${id}">
      <span class="dot"></span>${T.nav[id]}
    </button>`;
  const email = auth.currentUser?.email || "";
  const subKey = ["connections", "dashboard"].includes(state.screen) ? `${T.subs[state.screen]} ${brand ? esc(brand.name) : ""}` : T.subs[state.screen] || "";

  root.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="side-logo" data-go-landing>${logo(34)}<div><div class="name">Sincro</div><div class="tag">${T.tagline}</div></div></div>
      <div class="brand-switch">
        <button data-brand-menu>
          <span class="brand-dot" style="background:${brandGradient(bi)}"></span>
          <span style="flex:1;min-width:0"><span class="bname">${brand ? esc(brand.name) : "—"}</span><span class="bsub">${T.brand}</span></span>
          <span style="color:var(--muted);font-size:11px">▼</span>
        </button>
        ${state.menus.brand ? `<div class="menu-pop">
          ${state.brands.map((b, i) => `<button data-pick-brand="${b.id}" class="${b.id === state.brandId ? "active" : ""}"><span class="brand-dot" style="width:22px;height:22px;background:${brandGradient(i)}"></span>${esc(b.name)}${b.id === state.brandId ? ' <span style="margin-left:auto;font-weight:800">✓</span>' : ""}</button>`).join("")}
          <button data-new-brand style="color:var(--accent);border-top:1px solid var(--line-soft);border-radius:0;margin-top:4px">+ ${T.addBrand}</button>
        </div>` : ""}
      </div>
      ${nav1.map(navBtn).join("")}
      <div class="nav-label">${T.moreLabel}</div>
      ${nav2.map(navBtn).join("")}
      <div class="side-foot">
        <div style="display:flex;align-items:center;gap:10px;padding:4px 6px">
          <span class="avatar">${esc((email[0] || "S").toUpperCase())}</span>
          <span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(email)}</span>
          <span style="display:flex;gap:8px;align-items:center"><span style="font-size:11px;color:var(--muted)">${state.sub ? esc(state.sub.planName) : ""}</span>
          <a href="#" data-logout style="font-size:11.5px">${T.logout}</a></span></span>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div style="flex:1"><h1>${T.nav[state.screen] || ""}</h1><p class="sub">${subKey}</p></div>
        <button class="btn ghost sm" data-lang-toggle>🌐 ${state.lang.toUpperCase()}</button>
        <button class="btn primary" data-nav="create">${state.generating ? `<span class="spinner"></span> ${state.lang === "en" ? "Generating…" : "Generando…"}` : `✦ ${T.newPlan}`}</button>
      </header>
      <div class="content" id="content">${contentHtml}</div>
    </main>
  </div>`;

  $$("[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));
  $("[data-go-landing]").addEventListener("click", () => go("landing"));
  $("[data-logout]").addEventListener("click", (e) => { e.preventDefault(); signOut(auth).catch(() => {}); });
  $("[data-lang-toggle]").addEventListener("click", () => setLang(state.lang === "es" ? "en" : "es"));
  $("[data-brand-menu]").addEventListener("click", () => { state.menus.brand = !state.menus.brand; render(); });
  $$("[data-pick-brand]").forEach((b) => b.addEventListener("click", () => {
    state.brandId = b.dataset.pickBrand;
    localStorage.setItem("brandId", state.brandId);
    state.menus = {}; state.dataFor = null;
    loadBrandData().then(render);
  }));
  const nb = $("[data-new-brand]");
  if (nb) nb.addEventListener("click", () => { state.editBrand = null; go("brandForm"); });
  if (afterMount) afterMount();
}

/* ── DASHBOARD ────────────────────────────────────────────────────────── */
function renderDashboard() {
  const T = t(); const D = T.dash;
  const brand = currentBrand();
  const now = Date.now();
  const weekAgo = now - 7 * 864e5, weekAhead = now + 7 * 864e5;
  const pieces = [...state.posts.map((p) => ({ ...p, _ch: "ig" })), ...state.emails.map((e) => ({ ...e, _ch: "email" }))];
  const thisWeek = pieces.filter((p) => (p.scheduledFor || 0) >= weekAgo && (p.scheduledFor || 0) <= weekAhead).length;
  const published = state.posts.filter((p) => p.status === "published").length + state.emails.filter((e) => e.status === "sent").length;
  const pending = state.posts.filter((p) => p.status === "pending").length;
  const emailsReady = state.emails.filter((e) => e.status !== "sent").length;
  const upcoming = pieces.filter((p) => (p.scheduledFor || 0) >= now - 864e5 && !["published", "sent"].includes(p.status))
    .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0)).slice(0, 4);
  const ig = brand?.instagram || {}, shop = brand?.shopify || {};
  const channels = [
    { ch: "ig", name: "Instagram", detail: ig.connected ? T.conn.connected : T.conn.notConnected, on: !!ig.connected },
    { ch: "fb", name: "Facebook", detail: ig.postToFacebook ? T.conn.connected : T.conn.notConnected, on: !!ig.postToFacebook },
    { ch: "email", name: "Shopify / Email", detail: shop.connected ? T.conn.connected : T.conn.notConnected, on: !!shop.connected },
    { ch: "pin", name: "Pinterest", detail: brand?.pinterest?.connected ? `@${brand.pinterest.username}` : T.conn.notConnected, on: !!brand?.pinterest?.connected },
  ];
  const inspo = brand?.voice?.inspo || [];

  const html = `
    <div class="stat-grid">
      ${[[D.statsWeek, thisWeek], [D.published, published], [D.pending, pending], [D.emails, emailsReady]]
        .map(([l, v]) => `<div class="stat"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("")}
    </div>
    <div class="dash-grid">
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h2 style="margin:0">${D.upcoming}</h2>
          <a href="#" data-nav2="calendar" style="font-size:13px;font-weight:700">${D.viewCalendar} →</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${upcoming.length ? upcoming.map((p) => `
            <div class="list-item">
              <div class="thumb-img" style="width:52px;height:52px;${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}"></div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span class="badge" style="background:${CHAN[p._ch].bg};color:${CHAN[p._ch].ink}">${CHAN[p._ch].label}</span>
                  <span style="font-size:12px;color:var(--muted)">${fmtDate(p.scheduledFor)}</span>
                </div>
                <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.subject || p.productTitle || firstLine(p.caption))}</div>
              </div>
              ${statusBadge(p.status)}
            </div>`).join("") : `<div class="empty" style="padding:30px 10px">${D.nothing}</div>`}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="card">
          <h2>${D.channels}</h2>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${channels.map((c) => `
              <button data-nav2="connections" style="display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;border-radius:10px;padding:7px 8px;margin:-4px 0;cursor:pointer;text-align:left;font-family:inherit;transition:background .12s"
                onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
                ${chanChip(c.ch, 30)}
                <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;color:var(--ink)">${c.name}</div><div style="font-size:11px;color:var(--muted)">${c.detail}</div></div>
                <span style="width:9px;height:9px;border-radius:50%;background:${c.on ? "var(--ok-ink)" : "#d8d1c7"};flex-shrink:0"></span>
                <span style="color:var(--muted-2);font-size:12px">›</span>
              </button>`).join("")}
          </div>
          <button class="btn soft block sm" style="margin-top:16px" data-nav2="connections">${D.manage}</button>
        </div>
        <div class="inspo-card">
          <h2>${D.inspiration}</h2>
          <p style="margin:0 0 14px;font-size:12.5px;color:#5a6478;line-height:1.5">${D.inspirationHint}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${inspo.map((h) => `<span class="inspo-chip">${esc(h)}</span>`).join("")}
            <button class="inspo-chip" data-nav2="connections" style="background:transparent;border-style:dashed;color:#6b7793;cursor:pointer">+ ${T.add}</button>
          </div>
        </div>
      </div>
    </div>`;

  renderShell(html, () => {
    $$("[data-nav2]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); go(b.dataset.nav2); }));
  });
}

/* ── CREATE ───────────────────────────────────────────────────────────── */
function renderCreate() {
  const T = t(); const C = T.create;
  const brand = currentBrand();
  if (!brand) return renderNoBrand();
  const shop = brand.shopify || {};
  const hasSource = !!(brand.websiteUrl || shop.connected);
  state.createOpts = state.createOpts || { emailOn: true, fbOn: !!brand.instagram?.postToFacebook, pinOn: !!brand.pinterest?.connected, tone: "", weeks: 1 };
  const o = state.createOpts;
  // Una fecha de ayer (la pestaña quedó abierta de un día para otro) haría que
  // el servidor rechace el plan: se corrige sola al volver a esta pantalla.
  if (!o.startDate || o.startDate < todayStr()) o.startDate = todayStr();

  const chanToggle = (id, name, on, enabled = true) => `
    <button class="btn ${on ? "" : "ghost"}" data-chan="${id}" ${enabled ? "" : "disabled"}
      style="${on ? `background:${CHAN[id].bg};color:${CHAN[id].ink};border:1.5px solid ${CHAN[id].ink}33` : ""}">
      ${chanChip(id)} ${name} ${enabled ? (on ? "✓" : "") : `<span class="badge muted">${C.soon}</span>`}
    </button>`;

  const html = `
    <div style="max-width:760px">
      <div class="card" style="padding:30px;border-radius:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span class="chip" style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#1e3a8a,#3b6fb5);color:#fff;font-size:20px">✦</span>
          <h2 style="margin:0;font-size:20px">${C.title}</h2>
        </div>
        <p style="margin:0 0 24px;color:var(--muted);font-size:13.5px;line-height:1.55">${C.subtitle}</p>

        <div class="field"><label>${C.goalLabel}</label>
          <textarea id="goalInput" placeholder="${C.goalPh}">${esc(o.goal || "")}</textarea></div>

        <div class="field"><label>${C.period}</label>
          <div style="display:flex;gap:6px;background:var(--bg);border:1px solid #e2dcd2;border-radius:11px;padding:4px;flex-wrap:wrap">
            ${PERIODS.map((wk, i) => `<button class="btn sm ${o.weeks === wk ? "primary" : "ghost"}" data-weeks="${wk}" style="flex:1;min-width:80px">${C.periods[i]}</button>`).join("")}
          </div>
          <div class="hint" style="margin-top:7px">${planSummary(o)}</div>
        </div>

        <div class="row">
          <div class="field"><label>${C.startLabel}</label>
            <input type="date" id="startInput" value="${esc(o.startDate)}" min="${todayStr()}" max="${addDaysStr(todayStr(), 365)}" />
            <div class="hint">${C.startHint}</div>
          </div>
          <div class="field"><label>${C.tone}</label>
            <select id="toneInput">${C.tones.map((tn) => `<option ${o.tone === tn ? "selected" : ""}>${tn}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><label>${state.lang === "en" ? "Emails per week" : "Emails por semana"}</label>
          <div style="display:flex;gap:6px;background:var(--bg);border:1px solid #e2dcd2;border-radius:11px;padding:4px;max-width:280px">
            ${[2, 3, 7].map((n) => `<button class="btn sm ${(o.emailsPerWeek || 2) === n ? "primary" : "ghost"}" data-epw="${n}" style="flex:1">${n === 7 ? (state.lang === "en" ? "Daily" : "Diario") : n}</button>`).join("")}
          </div>
        </div>

        <div class="field"><label>${C.channels}</label>
          <div class="btn-row">
            ${chanToggle("ig", "Instagram", true)}
            ${chanToggle("email", "Email", o.emailOn)}
            ${chanToggle("fb", "Facebook", o.fbOn, !!brand.instagram?.connected)}
            ${chanToggle("pin", "Pinterest", !!o.pinOn, !!brand.pinterest?.connected)}
          </div>
        </div>

        <div class="field"><label>${C.imageSource}</label>
          <div style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e2dcd2;border-radius:13px;background:var(--bg);margin-bottom:10px">
            <span class="chip" style="width:34px;height:34px;background:var(--ok-bg);color:var(--ok-ink)">◉</span>
            <div style="flex:1"><div style="font-weight:700;font-size:13px">${C.pullWeb}</div>
              <div style="font-size:12px;color:var(--muted)">${esc(shop.connected ? shop.storeDomain : brand.websiteUrl || "—")}</div></div>
            <span class="badge ${hasSource ? "ok" : "warn"}">${hasSource ? C.connected : C.notConnected}</span>
          </div>

          <div id="dropzone" style="border:2px dashed #cdd6ea;border-radius:13px;padding:22px;text-align:center;cursor:pointer;background:var(--bg);transition:border-color .15s">
            <div style="font-size:22px">📷🎬</div>
            <div style="font-weight:700;font-size:13.5px;margin:6px 0 2px">${state.lang === "en" ? "Drag photos or videos here, or click to upload" : "Arrastra fotos o videos aquí, o haz clic para subir"}</div>
            <div class="hint">${state.lang === "en" ? "Your own photos, not on your website" : "Fotos tuyas que no están en la página web"}</div>
            <input type="file" id="fileInput" accept="image/*,video/*" multiple style="display:none" />
          </div>
          <div id="uploadProgress" class="hint" style="margin:8px 0 0"></div>

          ${(brand.media || []).length ? `
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px">
            ${(brand.media || []).map((m, i) => `
              <div style="position:relative;width:74px;height:74px">
                ${m.type === "video"
                  ? `<div class="thumb-img" style="width:74px;height:74px;display:flex;align-items:center;justify-content:center;font-size:22px">🎬</div>`
                  : `<div class="thumb-img" style="width:74px;height:74px;background-image:url('${esc(m.url)}')"></div>`}
                <button data-rm-media="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--ink);color:#fff;cursor:pointer;font-size:11px;line-height:1">×</button>
              </div>`).join("")}
          </div>
          <div style="display:flex;gap:6px;background:var(--bg);border:1px solid #e2dcd2;border-radius:11px;padding:4px;margin-top:12px">
            ${[["web", state.lang === "en" ? "Website only" : "Solo web"], ["mix", state.lang === "en" ? "Mix both" : "Mezclar ambas"], ["uploads", state.lang === "en" ? "Uploads only" : "Solo subidas"]]
              .map(([id, l]) => `<button class="btn sm ${o.imageMode === id ? "primary" : "ghost"}" data-imgmode="${id}" style="flex:1">${l}</button>`).join("")}
          </div>` : ""}
        </div>

        <label style="display:flex;align-items:center;gap:9px;margin-top:16px;cursor:pointer;font-size:13.5px;font-weight:600">
          <input type="checkbox" id="autoApproveChk" ${state.autoApprove ? "checked" : ""} style="width:auto" />
          ${state.lang === "en" ? "Schedule automatically when ready (goes straight to calendar & queue)" : "Agendar automáticamente al terminar (va directo al calendario y la cola)"}
        </label>
        ${state.sub ? `<p class="hint" style="margin:14px 0 0;text-align:center">
          ${state.sub.planName} · ${state.lang === "en" ? "generations this month" : "generaciones este mes"}: <b>${state.sub.gensUsed}/${state.sub.gensMax}</b>
        </p>` : ""}
        <button class="btn primary lg block" id="genBtn" style="margin-top:14px" ${state.generating ? "disabled" : ""}>${state.generating ? `<span class="spinner"></span> ${C.generating}` : `✦ ${C.generate}`}</button>
        ${state.generating ? `<p class="hint" style="text-align:center;margin-top:10px">${state.lang === "en" ? "You can keep browsing — we'll notify you when it's ready." : "Puedes seguir navegando por la app — te avisamos cuando esté listo."}</p>` : ""}
      </div>

      ${state.plans.length ? `<div class="card" style="margin-top:20px"><h2>${C.prev}</h2>
        ${state.plans.slice(0, 6).map((p) => `
          <div class="email-item"><div class="info">
            <div class="subj">${fmtDay(p.startDate)}${p.endDate ? ` → ${fmtDay(p.endDate, true)}` : ""} ${p.weeks > 1 ? `<span class="badge muted">${p.weeks} ${state.lang === "en" ? "weeks" : "semanas"}</span>` : ""} ${statusBadge(p.status)}</div>
            <div class="prev">${(p.posts || []).length} posts · ${(p.emails || []).length} emails · ${fmtDate(p.createdAt)}</div>
          </div><button class="btn ghost sm" data-open-plan="${p.id}">${C.open}</button></div>`).join("")}
      </div>` : ""}
    </div>`;

  renderShell(html, () => {
    // Cualquier botón de esta pantalla vuelve a dibujarla entera, así que lo
    // escrito a mano se guarda antes o se pierde al primer clic.
    const capturar = () => {
      const g = $("#goalInput"); if (g) o.goal = g.value.trim();
      const tn = $("#toneInput"); if (tn) o.tone = tn.value;
    };
    $$("[data-chan]").forEach((b) => b.addEventListener("click", () => {
      capturar();
      const id = b.dataset.chan;
      if (id === "email") { o.emailOn = !o.emailOn; render(); }
      if (id === "fb") { o.fbOn = !o.fbOn; render(); }
      if (id === "pin") { o.pinOn = !o.pinOn; render(); }
    }));

    // ── Subida de fotos/videos propios ──
    const dz = $("#dropzone"), fi = $("#fileInput"), prog = $("#uploadProgress");
    const uploadFiles = async (files) => {
      const list = [...files].filter((f) => /^(image|video)\//.test(f.type));
      if (!list.length) return;
      const added = [];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f.size > 100 * 1024 * 1024) { toast(`${f.name}: máx 100 MB`, true); continue; }
        prog.textContent = `Subiendo ${i + 1}/${list.length}: ${f.name}…`;
        try {
          // El archivo NO pasa por nuestra API (tope de 4.5 MB): pedimos una URL
          // prefirmada y lo mandamos directo a Vercel Blob.
          const { presignedUrl } = await api("/api/brands/upload", {
            method: "POST",
            body: { brandId: brand.id, filename: f.name, contentType: f.type, size: f.size },
          });
          const put = await fetch(presignedUrl, {
            method: "PUT",
            headers: { "Content-Type": f.type },
            body: f,
          });
          if (!put.ok) throw new Error(`error al subir (${put.status})`);
          const { url } = await put.json();
          added.push({ url, type: f.type.startsWith("video") ? "video" : "image", name: f.name, createdAt: Date.now() });
        } catch (err) {
          toast(`${f.name}: ${err.message || "error al subir"}`, true);
        }
      }
      prog.textContent = "";
      if (added.length) {
        await api(`/api/brands/${brand.id}`, { method: "PUT", body: { media: [...(brand.media || []), ...added] } });
        if (!o.imageMode || o.imageMode === "web") o.imageMode = "mix";
        toast(`${added.length} archivo(s) subido(s) ✓`);
        await loadBrands(); render();
      }
    };
    if (dz) {
      dz.addEventListener("click", () => fi.click());
      fi.addEventListener("change", () => uploadFiles(fi.files));
      dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "var(--accent)"; });
      dz.addEventListener("dragleave", () => { dz.style.borderColor = "#cdd6ea"; });
      dz.addEventListener("drop", (e) => { e.preventDefault(); dz.style.borderColor = "#cdd6ea"; uploadFiles(e.dataTransfer.files); });
    }
    $$("[data-rm-media]").forEach((b) => b.addEventListener("click", async () => {
      const next = (brand.media || []).filter((_, i) => i !== Number(b.dataset.rmMedia));
      await api(`/api/brands/${brand.id}`, { method: "PUT", body: { media: next } });
      await loadBrands(); render();
    }));
    $$("[data-weeks]").forEach((b) => b.addEventListener("click", () => {
      capturar();
      o.weeks = Number(b.dataset.weeks);
      render();
    }));
    $("#startInput")?.addEventListener("change", (e) => {
      const v = e.currentTarget.value;
      if (!v || v < todayStr()) {
        toast(state.lang === "en" ? "Pick today or a later date." : "Elige hoy o un día más adelante.", true);
      } else {
        o.startDate = v;
      }
      capturar();
      render();
    });
    $$("[data-imgmode]").forEach((b) => b.addEventListener("click", () => { capturar(); o.imageMode = b.dataset.imgmode; render(); }));
    $$("[data-epw]").forEach((b) => b.addEventListener("click", () => {
      capturar();
      o.emailsPerWeek = Number(b.dataset.epw);
      render();
    }));
    $$("[data-open-plan]").forEach((b) => b.addEventListener("click", async () => {
      const { plan } = await api(`/api/plans/${b.dataset.openPlan}`);
      state.draft = plan; go("draft");
    }));
    $("#autoApproveChk")?.addEventListener("change", (e) => {
      state.autoApprove = e.currentTarget.checked;
      localStorage.setItem("autoApprove", state.autoApprove ? "1" : "0");
    });
    $("#genBtn").addEventListener("click", () => {
      if (state.generating) return;
      capturar();
      const sd = $("#startInput")?.value;
      if (sd && sd >= todayStr()) o.startDate = sd;
      if (o.startDate < todayStr()) o.startDate = todayStr();
      if (o.fbOn !== !!brand.instagram?.postToFacebook) {
        api(`/api/brands/${brand.id}`, { method: "PUT", body: { instagram: { postToFacebook: o.fbOn } } }).catch(() => {});
      }
      state.generating = true;
      render();
      toast((o.weeks || 1) >= 4
        ? (state.lang === "en"
            ? `Generating ${o.weeks} weeks in the background — this one takes a bit longer ✨`
            : `Generando ${o.weeks} semanas en segundo plano — este demora un poco más ✨`)
        : (state.lang === "en" ? "Generating in the background — feel free to keep browsing ✨" : "Generando en segundo plano — puedes seguir navegando ✨"));
      // La generación (y el agendado automático) corren en el servidor:
      // aunque cierres el navegador, el plan igual se crea.
      api("/api/plans", { method: "POST", body: {
        brandId: brand.id, goal: o.goal, tone: o.tone, imageMode: o.imageMode || "web",
        pinterest: !!o.pinOn, autoApprove: state.autoApprove,
        startDate: o.startDate, weeks: o.weeks || 1,
        postsPerWeek: 7, includeEmails: o.emailOn, emailsPerWeek: o.emailOn ? (o.emailsPerWeek || 2) : 0,
      } }).then(async (r) => {
        state.generating = false;
        await loadBrandData(true).catch(() => {});
        if (r.autoApproved) {
          toast(state.lang === "en" ? "✅ Plan ready! It's on your calendar and queue." : "✅ ¡Plan listo! Ya está en tu calendario y en la cola.");
          if (["create", "dashboard", "calendar", "queue"].includes(state.screen)) { state.screen = "calendar"; }
        } else {
          state.draft = r.plan;
          toast(state.lang === "en" ? "✅ Plan ready to review." : "✅ Plan listo para revisar.");
          if (state.screen === "create") state.screen = "draft";
        }
        render();
      }).catch((err) => {
        state.generating = false;
        toast(err.message, true);
        render();
      });
    });
  });
}

/* ── DRAFT (revisión del plan) ────────────────────────────────────────── */
function renderDraft() {
  const T = t(); const D = T.draft;
  const plan = state.draft;
  if (!plan) return go("create");
  const isDraft = plan.status === "draft";
  const n = (plan.posts || []).length + (plan.emails || []).length;
  const en = state.lang === "en";

  const card = (p) => `
        <div class="post-card">
          <div class="thumb" style="${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}"></div>
          <div class="body">
            <div class="meta"><span>${fmtDay(p.date)} · ${esc(p.time || "")}</span><span class="badge muted">${esc(p.theme || "")}</span></div>
            <div class="caption">${esc(p.caption)}</div>
          </div>
        </div>`;

  // Un plan de tres meses son 84 tarjetas seguidas. Se cortan por semana para
  // poder revisarlo por tramos en vez de scrollear a ciegas.
  const semanaDe = (date) => Math.floor(daysApart(plan.startDate, date) / 7);
  const postsHtml = (() => {
    const posts = plan.posts || [];
    if (!posts.length) return `<p class="hint">—</p>`;
    if (!(plan.weeks > 1)) return `<div class="grid">${posts.map(card).join("")}</div>`;
    const grupos = new Map();
    for (const p of posts) {
      const w = semanaDe(p.date);
      if (!grupos.has(w)) grupos.set(w, []);
      grupos.get(w).push(p);
    }
    return [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([w, items]) => `
      <div style="display:flex;align-items:center;gap:10px;margin:22px 0 12px">
        <span class="badge">${en ? "Week" : "Semana"} ${w + 1}</span>
        <span class="hint">${fmtDay(items[0].date)} → ${fmtDay(items[items.length - 1].date, true)} · ${items.length} posts</span>
      </div>
      <div class="grid">${items.map(card).join("")}</div>`).join("");
  })();

  const html = `
    <div class="notice ok" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:18px">✓</span> ${D.banner.replace("{n}", n)}
      ${plan.weeks > 1 ? `<span class="badge muted">${fmtDay(plan.startDate)} → ${fmtDay(plan.endDate, true)}</span>` : ""}
      <div style="margin-left:auto" class="btn-row">
        <button class="btn ghost sm" data-back>${D.back}</button>
        ${isDraft ? `<button class="btn danger sm" data-discard>${D.discard}</button>
        <button class="btn ok sm" data-approve>${D.approve}</button>` : `<span class="badge ok">${D.scheduled}</span>`}
      </div>
    </div>
    ${(plan.warnings || []).length ? `<div class="notice warn" style="margin-top:12px">
      <b>${en ? "Heads up" : "Ojo con esto"}:</b>
      <ul style="margin:6px 0 0;padding-left:18px">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    </div>` : ""}
    <h3 style="margin:18px 0 12px">${D.igTitle}</h3>
    ${postsHtml}
    <h3 style="margin:26px 0 12px">${D.emTitle}</h3>
    <div>
      ${(plan.emails || []).map((e, i) => `
        <div class="email-item"><div class="info">
          <div class="subj">${esc(e.subject)}</div>
          <div class="prev">${fmtDay(e.date)} · ${esc(e.previewText || "")}</div>
        </div><button class="btn ghost sm" data-draft-email="${i}">Ver</button></div>`).join("") || `<p class="hint">—</p>`}
    </div>`;

  renderShell(html, () => {
    $("[data-back]").addEventListener("click", () => { state.draft = null; go("create"); });
    $$("[data-draft-email]").forEach((b) => b.addEventListener("click", () => openEmailModal(plan.emails[Number(b.dataset.draftEmail)])));
    const disc = $("[data-discard]");
    if (disc) disc.addEventListener("click", async () => {
      if (!confirm(t().common.confirmDel)) return;
      await api(`/api/plans/${plan.id}`, { method: "DELETE" });
      state.draft = null; state.dataFor = null;
      await loadBrandData(true); go("create");
    });
    const ap = $("[data-approve]");
    if (ap) ap.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const r = await api(`/api/plans/${plan.id}`, { method: "POST", body: { action: "approve" } });
        toast(D.approved.replace("{p}", r.scheduledPosts).replace("{e}", r.emails));
        // Un plan que arranca en tres semanas más no se ve en la semana actual:
        // el calendario se abre donde empieza el plan.
        const primera = (plan.posts || []).map((p) => p.scheduledFor).filter(Boolean).sort((a, b) => a - b)[0];
        state.calWeek = primera ? Math.max(0, semanasDesdeHoy(primera)) : 0;
        state.draft = null; state.justApproved = true;
        await loadBrandData(true); go("calendar");
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = D.approve; }
    });
  });
}

/* ── CALENDAR ─────────────────────────────────────────────────────────── */
function renderCalendar() {
  const T = t();
  const en = state.lang === "en";
  // La semana visible. Con planes de varios meses el calendario tiene que poder
  // moverse: sin esto, todo lo agendado más allá del domingo era invisible.
  const off = state.calWeek || 0;
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + off * 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const dows = state.lang === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const pieces = [...state.posts.map((p) => ({ ...p, _ch: "ig" })), ...state.emails.map((e) => ({ ...e, _ch: "email" }))];

  const finSemana = new Date(days[6]); finSemana.setDate(finSemana.getDate() + 1);
  const weekStart = monday.getTime(), weekEnd = finSemana.getTime();
  const enSemana = pieces.filter((p) => (p.scheduledFor || 0) >= weekStart && (p.scheduledFor || 0) < weekEnd).length;
  const proximo = pieces.filter((p) => (p.scheduledFor || 0) >= weekEnd).sort((a, b) => a.scheduledFor - b.scheduledFor)[0];
  const anterior = pieces.filter((p) => (p.scheduledFor || 0) < weekStart).sort((a, b) => b.scheduledFor - a.scheduledFor)[0];
  const rango = `${monday.toLocaleDateString(en ? "en-US" : "es-CL", { day: "numeric", month: "short" })} → ${days[6].toLocaleDateString(en ? "en-US" : "es-CL", { day: "numeric", month: "short", year: "numeric" })}`;

  const banner = state.justApproved ? `<div class="notice ok" style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">✓</span> ${t().draft.banner.replace("{n}", "")}</div>` : "";
  state.justApproved = false;

  const html = `
    ${banner}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ghost sm" data-cal-move="-1" ${anterior ? "" : "disabled"}>‹</button>
      <button class="btn ${off === 0 ? "primary" : "ghost"} sm" data-cal-move="0">${en ? "This week" : "Esta semana"}</button>
      <button class="btn ghost sm" data-cal-move="1" ${proximo ? "" : "disabled"}>›</button>
      <div style="font-weight:700;font-size:14px">${rango}</div>
      <div class="hint">${enSemana} ${en ? "scheduled" : "agendadas"}${off !== 0 ? ` · ${off > 0 ? "+" : ""}${off} ${en ? "wk" : "sem"}` : ""}</div>
      ${!enSemana && proximo ? `<button class="btn ghost sm" style="margin-left:auto" data-cal-next>${en ? "Jump to next content →" : "Ir al próximo contenido →"}</button>` : ""}
    </div>
    <div class="week-grid">
      ${days.map((d, i) => {
        const manana = new Date(d); manana.setDate(manana.getDate() + 1);
        const start = d.getTime(), end = manana.getTime();
        const items = pieces.filter((p) => (p.scheduledFor || 0) >= start && (p.scheduledFor || 0) < end)
          .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
        const isToday = new Date().toDateString() === d.toDateString();
        return `<div class="day-col">
          <div class="day-head ${isToday ? "today" : ""}"><div class="dow">${dows[i]}</div><div class="num">${d.getDate()}</div></div>
          <div class="day-items">
            ${items.map((p) => `
              <button class="cal-item" data-item="${p._ch}:${p.id}" style="border-left-color:${CHAN[p._ch].accent}">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                  ${chanChip(p._ch, 16)}
                  <span style="font-size:10.5px;font-weight:700;color:var(--muted)">${new Date(p.scheduledFor).toLocaleTimeString(state.lang === "en" ? "en-US" : "es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style="font-size:11.5px;font-weight:600;line-height:1.35">${esc(p.subject || p.productTitle || firstLine(p.caption))}</div>
                <div style="margin-top:6px">${statusBadge(p.status)}</div>
              </button>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;

  renderShell(html, () => {
    $$("[data-cal-move]").forEach((b) => b.addEventListener("click", () => {
      const step = Number(b.dataset.calMove);
      state.calWeek = step === 0 ? 0 : (state.calWeek || 0) + step;
      render();
    }));
    $("[data-cal-next]")?.addEventListener("click", () => {
      state.calWeek = semanasDesdeHoy(proximo.scheduledFor);
      render();
    });
    $$("[data-item]").forEach((b) => b.addEventListener("click", () => {
      const [ch, id] = b.dataset.item.split(":");
      if (ch === "email") {
        api(`/api/emails/${id}`).then(({ email }) => openEmailModal(email, true));
      } else {
        const post = state.posts.find((p) => p.id === id);
        if (post) openPostModal(post);
      }
    }));
  });
}

/* ── QUEUE ────────────────────────────────────────────────────────────── */
function renderQueue() {
  const T = t(); const Q = T.queue;
  const tabs = [["all", Q.all], ["ig", Q.ig], ["email", Q.email], ["published", Q.published]];
  let rows = [...state.posts.map((p) => ({ ...p, _ch: "ig" })), ...state.emails.map((e) => ({ ...e, _ch: "email" }))]
    .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
  const f = state.queueFilter;
  if (f === "ig") rows = rows.filter((r) => r._ch === "ig");
  if (f === "email") rows = rows.filter((r) => r._ch === "email");
  if (f === "published") rows = rows.filter((r) => ["published", "sent"].includes(r.status));

  const html = `
    <div class="queue-tabs">
      ${tabs.map(([id, l]) => `<button class="queue-tab ${f === id ? "active" : ""}" data-qtab="${id}">${l}</button>`).join("")}
    </div>
    ${rows.length ? `<div class="queue-list">
      ${rows.map((p) => `
        <div class="queue-row">
          <div class="thumb-img" style="width:46px;height:46px;${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}"></div>
          <span class="badge" style="background:${CHAN[p._ch].bg};color:${CHAN[p._ch].ink};width:86px;justify-content:center">${CHAN[p._ch].label}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.subject || p.productTitle || firstLine(p.caption))}</div>
            <div style="font-size:12px;color:var(--muted)">${fmtDate(p.scheduledFor)}${p.error ? ` · <span style="color:var(--err-ink)">${esc(String(p.error).slice(0, 80))}</span>` : ""}</div>
          </div>
          ${statusBadge(p.status)}
          <div class="btn-row" style="flex-shrink:0">
            ${p._ch === "ig" && ["pending", "error"].includes(p.status) ? `<button class="btn primary sm" data-pub="${p.id}">${Q.publishNow}</button>` : ""}
            ${p._ch === "email" ? `<button class="btn ghost sm" data-vemail="${p.id}">${Q.view}</button>` : ""}
            <button class="btn ghost sm" data-del="${p._ch}:${p.id}">✕</button>
          </div>
        </div>`).join("")}
    </div>` : `<div class="empty"><h2>📭</h2><p>${Q.empty}</p></div>`}`;

  renderShell(html, () => {
    $$("[data-qtab]").forEach((b) => b.addEventListener("click", () => { state.queueFilter = b.dataset.qtab; render(); }));
    $$("[data-pub]").forEach((b) => b.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try { await api(`/api/posts/${b.dataset.pub}`, { method: "POST", body: { action: "publish" } }); toast("¡Publicado en Instagram! 🎉"); }
      catch (err) { toast(err.message, true); }
      refresh();
    }));
    $$("[data-vemail]").forEach((b) => b.addEventListener("click", async () => {
      const { email } = await api(`/api/emails/${b.dataset.vemail}`);
      openEmailModal(email, true);
    }));
    $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(t().common.confirmDel)) return;
      const [ch, id] = b.dataset.del.split(":");
      await api(`/api/${ch === "email" ? "emails" : "posts"}/${id}`, { method: "DELETE" });
      refresh();
    }));
  });
}

/* ── ANALYTICS ────────────────────────────────────────────────────────── */
function renderAnalytics() {
  const A = t().ana;
  const published = state.posts.filter((p) => p.status === "published");
  const sent = state.emails.filter((e) => e.status === "sent");
  const stats = [
    [A.published, published.length + sent.length],
    [A.queue, state.posts.filter((p) => p.status === "pending").length],
    [A.emailsReady, state.emails.filter((e) => e.status !== "sent").length],
    [A.errors, state.posts.filter((p) => p.status === "error").length],
  ];
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const dows = state.lang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const counts = days.map((d) => {
    const s = d.getTime(), e2 = s + 864e5;
    return {
      day: dows[d.getDay()],
      ig: published.filter((p) => (p.publishedAt || 0) >= s && (p.publishedAt || 0) < e2).length,
      email: sent.filter((m) => (m.updatedAt || 0) >= s && (m.updatedAt || 0) < e2).length,
    };
  });
  const max = Math.max(1, ...counts.map((c) => Math.max(c.ig, c.email)));
  const latest = [...published].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)).slice(0, 4);

  const html = `
    <div class="notice">${A.soon}</div>
    <div class="stat-grid">
      ${stats.map(([l, v]) => `<div class="stat"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("")}
    </div>
    <div class="dash-grid" style="grid-template-columns:1.5fr 1fr">
      <div class="card">
        <h2>${A.activity}</h2>
        <div style="display:flex;align-items:flex-end;gap:18px;height:180px;padding-bottom:8px">
          ${counts.map((c) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end">
              <div style="width:100%;display:flex;gap:4px;align-items:flex-end;height:100%">
                <div style="flex:1;height:${Math.round((c.ig / max) * 100)}%;min-height:${c.ig ? 8 : 2}px;background:linear-gradient(180deg,#e858a0,#c02e7a);border-radius:5px 5px 0 0"></div>
                <div style="flex:1;height:${Math.round((c.email / max) * 100)}%;min-height:${c.email ? 8 : 2}px;background:linear-gradient(180deg,#4aa3c7,#2b7a9e);border-radius:5px 5px 0 0"></div>
              </div>
              <span style="font-size:11px;font-weight:600;color:var(--muted)">${c.day}</span>
            </div>`).join("")}
        </div>
        <div style="display:flex;gap:20px;margin-top:10px">
          <span style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600"><span style="width:11px;height:11px;border-radius:3px;background:#c02e7a"></span>Instagram</span>
          <span style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600"><span style="width:11px;height:11px;border-radius:3px;background:#2b7a9e"></span>Email</span>
        </div>
      </div>
      <div class="card">
        <h2>${A.top}</h2>
        ${latest.length ? latest.map((p, i) => `
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
            <span style="font-size:15px;font-weight:800;color:#c9c0b5;width:20px">${i + 1}</span>
            <div class="thumb-img" style="width:40px;height:40px;${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}"></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.productTitle || firstLine(p.caption))}</div>
              <div style="font-size:11.5px;color:var(--muted)">${fmtDate(p.publishedAt)}</div>
            </div>
          </div>`).join("") : `<p class="hint">${A.none}</p>`}
      </div>
    </div>`;
  renderShell(html);
}

/* ── PRICING ──────────────────────────────────────────────────────────── */
function pricingTiers() {
  const P = t().pricing;
  return [
    { key: "basico", name: "Básico", price: "$9.900", brands: P.brands1, gens: 8 },
    { key: "pro", name: "Pro", price: "$16.900", brands: P.brandsN.replace("{n}", "2"), gens: 20 },
    { key: "studio", name: "Studio", price: "$19.900", brands: P.brandsN.replace("{n}", "3"), gens: 40, popular: true },
    { key: "agencia", name: "Agencia", price: "$24.900", brands: P.brandsN.replace("{n}", "4"), gens: 100 },
  ];
}

function pricingCardsHtml(current, publicMode = false) {
  const P = t().pricing;
  return `<div class="plans-grid">
    ${pricingTiers().map((p) => `
      <div class="plan-card ${p.popular ? "popular" : ""}">
        ${p.popular ? `<span class="plan-badge">${P.popular}</span>` : ""}
        <div style="font-size:16px;font-weight:800">${p.name}</div>
        <div style="display:flex;align-items:baseline;gap:4px;margin:10px 0 4px">
          <span style="font-size:38px;font-weight:800;letter-spacing:-.03em">${p.price}</span>
          <span style="font-size:14px;color:var(--muted);font-weight:600">${P.perMonth}</span>
        </div>
        <div class="badge accent" style="margin-bottom:18px">${p.brands} · ${p.gens} ${state.lang === "en" ? "plans/mo" : "generaciones/mes"}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:22px">
          ${P.features.map((f) => `<div style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-soft)"><span class="chip" style="width:18px;height:18px;border-radius:50%;background:var(--ok-bg);color:var(--ok-ink);font-size:11px">✓</span>${f}</div>`).join("")}
        </div>
        ${current === p.key
          ? `<button class="btn ghost block" disabled>✓ ${state.lang === "en" ? "Current plan" : "Plan actual"}</button>`
          : publicMode
            ? `<button class="btn ${p.popular ? "primary" : "soft"} block" data-go-app>${t().land.heroCta}</button>`
            : `<button class="btn ${p.popular ? "primary" : "soft"} block" data-choose>${P.choose}</button>`}
      </div>`).join("")}
  </div>`;
}

function renderPricing() {
  const P = t().pricing;
  const current = state.sub?.plan;
  const html = `
    <div style="text-align:center;max-width:560px;margin:0 auto 30px">
      <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-.02em">${P.title}</h2>
      <p style="margin:0;font-size:14px;color:var(--muted);line-height:1.55">${P.subtitle}</p>
    </div>
    ${pricingCardsHtml(current, false)}`;
  renderShell(html, () => {
    $$("[data-choose]").forEach((b) => b.addEventListener("click", () => toast(P.soon)));
  });
}

/* ── CONNECTIONS ──────────────────────────────────────────────────────── */
function renderConnections() {
  const T = t(); const C = T.conn;
  const brand = currentBrand();
  if (!brand) return renderNoBrand();
  const ig = brand.instagram || {}, shop = brand.shopify || {};
  const mail = brand.email || {}, kit = brand.brandKit || {};
  const en = state.lang === "en";
  const inspo = brand.voice?.inspo || [];
  const tokenPh = (has) => (has ? "•••••• (guardado)" : "");

  const connCard = (ch, name, detail, connected, btnHtml) => `
    <div class="conn-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        ${chanChip(ch, 42)}
        <div style="flex:1"><div style="font-weight:800;font-size:15px">${name}</div>
          <div style="font-size:12px;color:var(--muted)">${detail}</div></div>
        <span style="width:9px;height:9px;border-radius:50%;background:${connected ? "var(--ok-ink)" : "#d8d1c7"}"></span>
      </div>
      ${btnHtml}
    </div>`;

  const html = `
    <div style="max-width:900px">
      <h2 style="margin:0 0 4px;font-size:16px;font-weight:800">${C.social}</h2>
      <p style="margin:0 0 18px" class="hint">${C.socialHint}</p>
      <div class="conn-grid" style="margin-bottom:32px">
        ${connCard("ig", "Instagram",
          ig.connected
            ? `${ig.username ? "@" + esc(ig.username) : C.connected}${ig.fbUserName ? ` · FB: ${esc(ig.fbUserName)}` : ""}`
            : C.igDetail, ig.connected,
          ig.connected
            ? `<button class="btn ghost block" disabled>✓ ${C.connected}</button><div style="text-align:center;margin-top:8px"><a href="#" id="fbConnect" class="hint">${state.lang === "en" ? "change account" : "cambiar cuenta"}</a></div>`
            : `<button class="btn primary block" id="fbConnect">${C.connect}</button>`)}
        ${connCard("fb", "Facebook", C.fbDetail, ig.postToFacebook,
          `<button class="btn ${ig.postToFacebook ? "ghost" : "soft"} block" id="fbToggle" ${ig.connected ? "" : "disabled"}>${ig.postToFacebook ? C.connected + " ✓" : C.activate}</button>`)}
        ${connCard("pin", "Pinterest", (brand.pinterest?.connected ? `@${esc(brand.pinterest.username)} · ${esc(brand.pinterest.boardName)}` : C.pinDetail), brand.pinterest?.connected,
          brand.pinterest?.connected
            ? `<button class="btn ghost block" disabled>✓ ${C.connected}</button><div style="text-align:center;margin-top:8px"><a href="#" id="pinConnect" class="hint">${state.lang === "en" ? "change account" : "cambiar cuenta"}</a></div>`
            : `<button class="btn primary block" id="pinConnect">${C.connect}</button>`)}
      </div>

      <h2 style="margin:0 0 4px;font-size:16px;font-weight:800">${C.store}</h2>
      <p style="margin:0 0 18px" class="hint">${C.storeHint}</p>
      <div class="conn-grid" style="margin-bottom:16px">
        ${connCard("email", "Shopify", shop.connected ? esc(shop.storeDomain || C.shopifyDetail) : C.shopifyDetail, shop.connected,
          shop.connected
            ? `<button class="btn ghost block" disabled>✓ ${C.connected}</button><div style="text-align:center;margin-top:8px"><a href="#" id="shopifyToggle" class="hint">${state.lang === "en" ? "change store" : "cambiar tienda"}</a></div>`
            : `<button class="btn primary block" id="shopifyToggle">${C.connect}</button>`)}
        ${connCard("email", "Web", C.webDetail, !!brand.websiteUrl,
          `<button class="btn soft block" data-edit-brand>${brand.websiteUrl ? esc(brand.websiteUrl).slice(0, 30) : C.connect}</button>`)}
      </div>
      <div id="shopifyFields" class="card" style="display:none;margin-bottom:32px">
        <div class="field"><label>Dominio de la tienda</label><input id="f_shopDomain" value="${esc(shop.storeDomain || "")}" placeholder="tu-tienda.myshopify.com" /></div>
        <button class="btn primary" id="shopifyOauth">🛍️ Conectar con Shopify</button>
        <p class="hint" style="margin:8px 0 0">Se abrirá tu Shopify para autorizar el acceso de solo lectura a tus productos.</p>
        <details style="margin-top:14px">
          <summary class="hint" style="cursor:pointer">Conexión manual con token (avanzado)</summary>
          <div class="row" style="margin-top:10px">
            <div class="field"><label>API version</label><input id="f_shopVer" value="${esc(shop.apiVersion || "2024-04")}" /></div>
            <div class="field"><label>Token</label><input id="f_shopToken" placeholder="${tokenPh(shop.connected)}" /></div>
          </div>
          <button class="btn ghost sm" id="saveShopify">Guardar y probar</button>
        </details>
      </div>

      <h2 style="margin:0 0 4px;font-size:16px;font-weight:800">${en ? "Email campaigns" : "Campañas de email"}</h2>
      <p style="margin:0 0 18px" class="hint">${en
        ? "Sincro sends the campaigns itself. Nothing is copied anywhere else."
        : "Sincro manda las campañas por su cuenta. No hay que copiar nada a ninguna otra parte."}</p>
      <div class="card" style="margin-bottom:32px">
        <div class="row">
          <div class="field"><label>${en ? "Sender" : "Remitente"}</label>
            <input id="f_emailFrom" value="${esc(mail.from || "")}" placeholder="Ámbar Joyas &lt;ventas@ambarjoyas.cl&gt;" />
            <div class="hint">${en ? "Must be an address verified in Amazon SES." : "Tiene que ser una dirección verificada en Amazon SES."}</div>
          </div>
          <div class="field"><label>${en ? "Reply to" : "Responder a"}</label>
            <input id="f_emailReply" value="${esc(mail.replyTo || "")}" placeholder="hola@tumarca.cl" />
            <div class="hint">${en ? "Where replies land. Optional." : "A dónde llegan las respuestas. Opcional."}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #e2dcd2;border-radius:13px;background:var(--bg);margin:6px 0 16px">
          <span class="chip" style="width:32px;height:32px;background:var(--ok-bg);color:var(--ok-ink)">◉</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">${en ? "Audience" : "Audiencia"}</div>
            <div class="hint" id="audienciaTxt">${shop.connected
              ? (en ? "Subscribed customers from your Shopify store." : "Clientes suscritos de tu tienda Shopify.")
              : (en ? "Connect Shopify to get your subscriber list." : "Conecta Shopify para tener la lista de suscritos.")}</div>
          </div>
          <button class="btn ghost sm" id="verAudiencia" ${shop.connected ? "" : "disabled"}>${en ? "Count" : "Contar"}</button>
        </div>

        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13.5px;font-weight:600;line-height:1.5">
          <input type="checkbox" id="f_emailEnabled" ${mail.enabled ? "checked" : ""} style="width:auto;margin-top:3px" />
          <span>${en ? "Send automatically when each campaign is due" : "Enviar solo, en la fecha de cada campaña"}
            <div class="hint" style="font-weight:400">${en
              ? "With this on, every scheduled campaign goes out to the whole list without asking again."
              : "Con esto encendido, cada campaña agendada sale sola a toda la lista, sin volver a preguntar."}</div>
          </span>
        </label>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn primary sm" id="saveEmailCfg">${en ? "Save" : "Guardar"}</button>
        </div>
      </div>

      <h2 style="margin:0 0 4px;font-size:16px;font-weight:800">${en ? "Email look & feel" : "Identidad visual de los emails"}</h2>
      <p style="margin:0 0 18px" class="hint">${en
        ? "Logo, colors and typeface used in every campaign. Detect them from your website and adjust anything."
        : "El logo, los colores y la tipografía con que salen las campañas. Se detectan de tu web y puedes corregir lo que quieras."}</p>
      <div class="card" style="margin-bottom:32px">
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn soft sm" id="detectKit">✦ ${en ? "Detect from my website" : "Detectar de mi web"}</button>
          <span class="hint" id="kitAvisos" style="align-self:center"></span>
        </div>
        <div class="row">
          <div class="field"><label>${en ? "Logo (image address)" : "Logo (dirección de la imagen)"}</label>
            <input id="f_kitLogo" value="${esc(kit.logoUrl || "")}" placeholder="https://…/logo.png" />
            <div class="hint">${en ? "PNG or JPG — Gmail does not draw SVG." : "PNG o JPG: Gmail no dibuja los SVG."}</div>
          </div>
          <div class="field"><label>${en ? "Preview" : "Vista previa"}</label>
            <div style="height:52px;border:1px solid #e2dcd2;border-radius:11px;background:#fff;display:flex;align-items:center;justify-content:center;padding:6px">
              ${kit.logoUrl ? `<img src="${esc(kit.logoUrl)}" alt="logo" style="max-height:38px;max-width:100%" />` : `<span class="hint">${en ? "no logo yet" : "aún sin logo"}</span>`}
            </div>
          </div>
        </div>
        <div class="row">
          ${[["color", en ? "Brand color" : "Color de la marca", "#b08d57"],
             ["colorBg", en ? "Background" : "Fondo", "#f5f2ee"],
             ["colorText", en ? "Text" : "Texto", "#1a1a1a"]]
            .map(([k, label, def]) => `
            <div class="field"><label>${label}</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="f_kit_${k}" value="${esc(kit[k] || def)}" style="width:46px;height:40px;padding:2px;border:1px solid #e2dcd2;border-radius:9px;background:#fff;cursor:pointer" />
                <input id="f_kit_${k}_hex" value="${esc(kit[k] || "")}" placeholder="${def}" style="flex:1" />
              </div>
            </div>`).join("")}
        </div>
        <div class="row">
          <div class="field"><label>${en ? "Headings typeface" : "Tipografía de los títulos"}</label>
            <input id="f_kitHeadingFont" value="${esc(kit.headingFont || "")}" placeholder="Playfair Display" /></div>
          <div class="field"><label>${en ? "Body typeface" : "Tipografía del texto"}</label>
            <input id="f_kitFont" value="${esc(kit.font || "")}" placeholder="Montserrat" /></div>
        </div>
        <div class="row">
          <div class="field"><label>Instagram</label>
            <input id="f_kitIg" value="${esc(kit.instagramUrl || "")}" placeholder="https://instagram.com/tumarca" /></div>
          <div class="field"><label>${en ? "Footer note" : "Nota del pie"}</label>
            <input id="f_kitFooter" value="${esc(kit.footerNote || "")}" placeholder="${en ? "Address, phone…" : "Dirección, teléfono…"}" /></div>
        </div>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn primary sm" id="saveKit">${en ? "Save" : "Guardar"}</button>
          <span class="hint" style="align-self:center">${en
            ? "Applies to every campaign, including the ones already scheduled."
            : "Se aplica a todas las campañas, incluidas las que ya están agendadas."}</span>
        </div>
      </div>

      <div class="inspo-card" style="margin-bottom:24px">
        <h2>${T.dash.inspiration}</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#5a6478;line-height:1.5">${C.inspoLong}</p>
        <div style="display:flex;gap:10px;margin-bottom:16px">
          <input id="inspoInput" placeholder="${C.inspoPh}" style="flex:1;padding:11px 14px;border:1px solid #cdd6ea;border-radius:11px;font-size:13.5px;background:#fff" />
          <button class="btn primary" id="addInspo">${T.add}</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:9px">
          ${inspo.map((h, i) => `<span class="inspo-chip">${esc(h)} <button data-rm-inspo="${i}" style="border:none;background:#e6ebf5;color:#6b7793;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1">×</button></span>`).join("")}
        </div>
      </div>

      <details>
        <summary class="hint" style="cursor:pointer">${C.advanced}</summary>
        <div class="card" style="margin-top:10px">
          <div class="btn-row" style="margin-bottom:12px">
            <a class="btn ghost sm" href="/guia-credenciales.html" target="_blank">${C.guide}</a>
          </div>
          <div class="row">
            <div class="field"><label>IG User ID</label><input id="f_igUserId" value="${esc(ig.igUserId || "")}" /></div>
            <div class="field"><label>Page ID</label><input id="f_pageId" value="${esc(ig.pageId || "")}" /></div>
          </div>
          <div class="field"><label>Page Access Token</label><input id="f_pageToken" placeholder="${tokenPh(ig.connected)}" /></div>
          <div class="field"><label>Long-lived User Token</label><input id="f_userToken" placeholder="${tokenPh(!!ig.tokenUpdatedAt)}" /></div>
          <button class="btn primary sm" id="saveManual">Guardar</button>
        </div>
      </details>
    </div>`;

  renderShell(html, () => {
    $("#fbConnect").addEventListener("click", async (e) => {
      e.preventDefault();
      const btn = e.currentTarget; const label = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const { url } = await api("/api/brands/facebook-oauth", { method: "POST", body: { brandId: brand.id } });
        window.open(url, "_blank");
        toast(C.fbNote);
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.textContent = label;
    });
    $("#pinConnect").addEventListener("click", async (e) => {
      e.preventDefault();
      const btn = e.currentTarget; const label = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const { url } = await api("/api/brands/pinterest-oauth", { method: "POST", body: { brandId: brand.id } });
        window.open(url, "_blank");
        toast(state.lang === "en" ? "Finish connecting in the Pinterest tab, then reload." : "Completa la conexión en la pestaña de Pinterest y luego recarga el panel.");
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.textContent = label;
    });
    // ── Campañas de email ──
    $("#verAudiencia")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const r = await api(`/api/emails?brandId=${brand.id}&audiencia=1`);
        $("#audienciaTxt").textContent = r.sinShopify
          ? (en ? "Connect Shopify first." : "Primero conecta Shopify.")
          : (en
              ? `${r.suscritos} subscribed of ${r.revisados} customers.`
              : `${r.suscritos} suscritos de ${r.revisados} clientes.`);
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.textContent = en ? "Count" : "Contar";
    });
    $("#saveEmailCfg")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const enabled = $("#f_emailEnabled").checked;
      // Encender el envío automático es lo único de esta pantalla que puede
      // mandarle correo a miles de personas sin volver a preguntar.
      if (enabled && !mail.enabled) {
        // Lo importante no es la advertencia genérica sino CUÁNTAS saldrían de
        // inmediato: al encenderlo por primera vez puede haber campañas
        // esperando desde hace días.
        const ahora = Date.now();
        const yaVencen = state.emails.filter(
          (x) => x.status === "ready" && (x.scheduledFor || 0) <= ahora && ahora - (x.scheduledFor || 0) <= 48 * 3600e3
        ).length;
        const ok = confirm(
          (en
            ? "From now on every scheduled campaign will be sent to your whole list automatically."
            : "Desde ahora, cada campaña agendada se enviará sola a toda tu lista de clientes.") +
          (yaVencen
            ? (en
                ? `

${yaVencen} campaign(s) are already due and will go out within the hour.`
                : `

${yaVencen} campaña(s) ya cumplieron su fecha y saldrán dentro de la próxima hora.`)
            : "") +
          (en ? `

Continue?` : `

¿Seguimos?`)
        );
        if (!ok) { btn.disabled = false; $("#f_emailEnabled").checked = false; return; }
      }
      try {
        await api(`/api/brands/${brand.id}`, { method: "PUT", body: { email: {
          enabled, from: $("#f_emailFrom").value.trim(), replyTo: $("#f_emailReply").value.trim(),
        } } });
        toast(en ? "Saved ✓" : "Guardado ✓");
        await loadBrands(); render();
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    });

    // ── Identidad visual ──
    // Los dos campos de cada color (rueda y hexadecimal) se siguen el uno al otro.
    ["color", "colorBg", "colorText"].forEach((k) => {
      const rueda = $(`#f_kit_${k}`), hex = $(`#f_kit_${k}_hex`);
      if (!rueda || !hex) return;
      rueda.addEventListener("input", () => { hex.value = rueda.value; });
      hex.addEventListener("change", () => {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) rueda.value = hex.value.trim();
      });
    });
    const leerKit = () => ({
      logoUrl: $("#f_kitLogo").value.trim(),
      color: $("#f_kit_color_hex").value.trim() || $("#f_kit_color").value,
      colorBg: $("#f_kit_colorBg_hex").value.trim() || $("#f_kit_colorBg").value,
      colorText: $("#f_kit_colorText_hex").value.trim() || $("#f_kit_colorText").value,
      headingFont: $("#f_kitHeadingFont").value.trim(),
      font: $("#f_kitFont").value.trim(),
      instagramUrl: $("#f_kitIg").value.trim(),
      footerNote: $("#f_kitFooter").value.trim(),
    });
    $("#detectKit")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; const label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${en ? "Reading your site…" : "Leyendo tu web…"}`;
      try {
        const { kit: k } = await api("/api/scrape", { method: "POST", body: { what: "brandkit", brandId: brand.id } });
        const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
        set("#f_kitLogo", k.logoUrl);
        set("#f_kitHeadingFont", k.headingFont);
        set("#f_kitFont", k.font);
        set("#f_kitIg", k.instagramUrl);
        ["color", "colorBg", "colorText"].forEach((c) => {
          if (!k[c]) return;
          set(`#f_kit_${c}`, k[c]); set(`#f_kit_${c}_hex`, k[c]);
        });
        $("#kitAvisos").textContent = (k.avisos || []).join(" ");
        toast(en ? "Detected — check it and save." : "Detectado — revísalo y guarda.");
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.innerHTML = label;
    });
    $("#saveKit")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await api(`/api/brands/${brand.id}`, { method: "PUT", body: { brandKit: leerKit() } });
        toast(en ? "Saved ✓" : "Guardado ✓");
        await loadBrands(); render();
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    });

    const fbT = $("#fbToggle");
    if (fbT) fbT.addEventListener("click", async () => {
      await api(`/api/brands/${brand.id}`, { method: "PUT", body: { instagram: { postToFacebook: !ig.postToFacebook } } });
      await loadBrands(); render();
    });
    $("#shopifyToggle").addEventListener("click", (e) => {
      e.preventDefault();
      const el = $("#shopifyFields");
      el.style.display = el.style.display === "none" ? "block" : "none";
    });
    $("#shopifyOauth").addEventListener("click", async (e) => {
      const btn = e.currentTarget; const label = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const { url } = await api("/api/brands/shopify-oauth", { method: "POST", body: { brandId: brand.id, shop: $("#f_shopDomain").value.trim() } });
        window.open(url, "_blank");
        toast("Autoriza en la pestaña de Shopify; el panel se actualizará solo al volver.");
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.textContent = label;
    });
    $("#saveShopify").addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const body = { shopify: { storeDomain: $("#f_shopDomain").value.trim(), apiVersion: $("#f_shopVer").value.trim() } };
        if ($("#f_shopToken").value.trim()) body.shopify.adminToken = $("#f_shopToken").value.trim();
        await api(`/api/brands/${brand.id}`, { method: "PUT", body });
        if (body.shopify.storeDomain && body.shopify.adminToken) {
          const r = await api("/api/brands/test", { method: "POST", body: { shopify: { ...body.shopify } } });
          if (r.shopify) toast(r.shopify.ok ? `✅ Shopify: ${r.shopify.name}` : `❌ ${r.shopify.error}`, !r.shopify.ok);
        } else toast(t().settings.saved);
        await loadBrands(); render();
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = "Guardar y probar"; }
    });
    $("#addInspo").addEventListener("click", async () => {
      const v = $("#inspoInput").value.trim();
      if (!v) return;
      await api(`/api/brands/${brand.id}`, { method: "PUT", body: { voice: { inspo: [...inspo, v] } } });
      await loadBrands(); render();
    });
    $$("[data-rm-inspo]").forEach((b) => b.addEventListener("click", async () => {
      const next = inspo.filter((_, i) => i !== Number(b.dataset.rmInspo));
      await api(`/api/brands/${brand.id}`, { method: "PUT", body: { voice: { inspo: next } } });
      await loadBrands(); render();
    }));
    $("[data-edit-brand]").addEventListener("click", () => { state.editBrand = brand; go("brandForm"); });
    $("#saveManual").addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const igp = { igUserId: $("#f_igUserId").value.trim(), pageId: $("#f_pageId").value.trim() };
        if ($("#f_pageToken").value.trim()) igp.pageAccessToken = $("#f_pageToken").value.trim();
        if ($("#f_userToken").value.trim()) igp.longLivedUserToken = $("#f_userToken").value.trim();
        await api(`/api/brands/${brand.id}`, { method: "PUT", body: { instagram: igp } });
        toast(t().settings.saved);
        await loadBrands(); render();
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    });
  });
}

/* ── SETTINGS ─────────────────────────────────────────────────────────── */
function renderSettings() {
  const S = t().settings;
  const html = `
    <div style="max-width:760px">
      <div class="card" style="margin-bottom:20px">
        <h2>${S.brands}</h2>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${state.brands.map((b, i) => {
            const ch = [b.instagram?.connected && "Instagram", b.instagram?.postToFacebook && "Facebook", b.shopify?.connected && "Shopify"].filter(Boolean).join(" · ") || t().conn.notConnected;
            return `<div class="list-item">
              <span class="brand-dot" style="width:38px;height:38px;border-radius:11px;background:${brandGradient(i)}"></span>
              <div style="flex:1"><div style="font-weight:700;font-size:14px">${esc(b.name)}</div>
                <div style="font-size:12px;color:var(--muted)">${ch}</div></div>
              <button class="btn ghost sm" data-edit="${b.id}">${S.edit}</button>
            </div>`;
          }).join("")}
          <button class="btn block" data-add style="background:var(--accent-soft);border:1.5px dashed #b9c4de;color:var(--accent)">+ ${t().addBrand}</button>
        </div>
      </div>
      <div class="card">
        <h2>${S.prefs}</h2>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f4f0ea">
          <div><div style="font-weight:600;font-size:14px">${S.lang}</div><div class="hint">${S.langHint}</div></div>
          <div class="btn-row">
            <button class="btn sm ${state.lang === "es" ? "primary" : "ghost"}" data-lang="es">ES</button>
            <button class="btn sm ${state.lang === "en" ? "primary" : "ghost"}" data-lang="en">EN</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0">
          <div><div style="font-weight:600;font-size:14px">${S.auto}</div><div class="hint">${S.autoHint}</div></div>
          <label style="cursor:pointer"><input type="checkbox" id="autoApproveSet" ${state.autoApprove ? "checked" : ""} style="width:auto" /></label>
        </div>
      </div>
    </div>`;

  renderShell(html, () => {
    $$("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      state.editBrand = state.brands.find((x) => x.id === b.dataset.edit);
      go("brandForm");
    }));
    $("[data-add]").addEventListener("click", () => { state.editBrand = null; go("brandForm"); });
    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
    $("#autoApproveSet")?.addEventListener("change", (e) => {
      state.autoApprove = e.currentTarget.checked;
      localStorage.setItem("autoApprove", state.autoApprove ? "1" : "0");
    });
  });
}

/* ── BRAND FORM ───────────────────────────────────────────────────────── */
function renderBrandForm() {
  const S = t().settings;
  const b = state.editBrand;
  const v = b?.voice || {};
  const html = `
    <div style="max-width:680px">
      <div class="card">
        <h2>${b ? esc(b.name) : S.newBrand}</h2>
        <div class="field"><label>${S.name}</label><input id="f_name" value="${esc(b?.name || "")}" /></div>
        <div class="field"><label>${S.web} <span class="sub">${S.webSub}</span></label><input id="f_web" value="${esc(b?.websiteUrl || "")}" placeholder="https://…" /></div>
        <h2 style="margin-top:22px">${S.voice}</h2>
        <div class="row">
          <div class="field"><label>${S.tone}</label><input id="f_tone" value="${esc(v.tone || "")}" /></div>
          <div class="field"><label>${S.audience}</label><input id="f_audience" value="${esc(v.audience || "")}" placeholder="ej: mujeres 25-45" /></div>
        </div>
        <div class="row">
          <div class="field"><label>${S.currency}</label><input id="f_currency" value="${esc(v.currency || "CLP")}" /></div>
          <div class="field"><label>${S.language}</label><input id="f_language" value="${esc(v.language || "es")}" /></div>
        </div>
        <div class="field"><label>${S.hashtags} <span class="sub">${S.hashtagsSub}</span></label><input id="f_hashtags" value="${esc((v.hashtags || []).join(" "))}" /></div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn primary" id="saveBrand">${b ? S.save : S.createBrand}</button>
          <button class="btn ghost" data-cancel>${t().draft.back}</button>
          ${b ? `<button class="btn danger" id="delBrand" style="margin-left:auto">${S.delete}</button>` : ""}
        </div>
      </div>
    </div>`;

  renderShell(html, () => {
    $("[data-cancel]").addEventListener("click", () => go("settings"));
    $("#saveBrand").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const data = {
        name: $("#f_name").value.trim(),
        websiteUrl: $("#f_web").value.trim(),
        voice: {
          tone: $("#f_tone").value.trim(), audience: $("#f_audience").value.trim(),
          currency: $("#f_currency").value.trim(), language: $("#f_language").value.trim(),
          hashtags: $("#f_hashtags").value.split(/\s+/).filter(Boolean),
        },
      };
      if (!data.name) return toast(S.name + " ✗", true);
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        if (b) {
          await api(`/api/brands/${b.id}`, { method: "PUT", body: data });
          toast(S.saved);
        } else {
          const { brand: created } = await api("/api/brands", { method: "POST", body: data });
          state.brandId = created.id;
          localStorage.setItem("brandId", created.id);
          toast(S.created);
        }
        state.dataFor = null;
        await loadBrands(); await loadBrandData();
        go(b ? "settings" : "connections");
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = b ? S.save : S.createBrand; }
    });
    const del = $("#delBrand");
    if (del) del.addEventListener("click", async () => {
      if (!confirm(t().common.confirmDel)) return;
      await api(`/api/brands/${b.id}`, { method: "DELETE" });
      state.brandId = null; state.dataFor = null;
      await loadBrands(); await loadBrandData();
      go("settings");
    });
  });
}

function renderNoBrand() {
  const html = `<div class="empty"><h2>👋</h2><p style="margin-bottom:18px">${t().dash.nothing}</p>
    <button class="btn primary" data-first-brand>+ ${t().addBrand}</button></div>`;
  renderShell(html, () => {
    $("[data-first-brand]").addEventListener("click", () => { state.editBrand = null; go("brandForm"); });
  });
}

/* ── Modales ──────────────────────────────────────────────────────────── */
function openPostModal(post) {
  const Q = t().queue;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div class="thumb-img" style="width:120px;height:120px;${post.imageUrl ? `background-image:url('${esc(post.imageUrl)}')` : ""}"></div>
        <div style="flex:1;min-width:0">
          <h3>${esc(post.productTitle || "Post")}</h3>
          <div class="hint">${fmtDate(post.scheduledFor)} · ${statusBadge(post.status)}</div>
        </div>
      </div>
      <p style="white-space:pre-line;font-size:13.5px;line-height:1.6;max-height:260px;overflow:auto">${esc(post.caption)}</p>
      ${post.error ? `<div class="notice">${esc(post.error)}</div>` : ""}
      <div class="btn-row" style="justify-content:flex-end">
        ${["pending", "error"].includes(post.status) ? `<button class="btn ghost" data-mregen>${t().regen.btn}</button>` : ""}
        ${["pending", "error"].includes(post.status) ? `<button class="btn primary" data-mpub>${Q.publishNow}</button>` : ""}
        <button class="btn danger" data-mdel>${Q.del}</button>
        <button class="btn ghost" data-close>OK</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-close]").addEventListener("click", close);
  const mp = bg.querySelector("[data-mpub]");
  if (mp) mp.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true; e.currentTarget.innerHTML = `<span class="spinner"></span>`;
    try { await api(`/api/posts/${post.id}`, { method: "POST", body: { action: "publish" } }); toast("¡Publicado! 🎉"); }
    catch (err) { toast(err.message, true); }
    close(); refresh();
  });
  const mr = bg.querySelector("[data-mregen]");
  if (mr) mr.addEventListener("click", () => { close(); openRegenModal(post); });
  bg.querySelector("[data-mdel]").addEventListener("click", async () => {
    if (!confirm(t().common.confirmDel)) return;
    await api(`/api/posts/${post.id}`, { method: "DELETE" });
    close(); refresh();
  });
}

/**
 * "Generar otro post": cambia el contenido del post de ese día por uno nuevo.
 * El día y la hora no se tocan — solo cambian producto, foto y texto.
 */
function openRegenModal(post) {
  const R = t().regen;
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal" style="max-width:520px">
      <h3>${R.title}</h3>
      <p class="hint">${fmtDate(post.scheduledFor)} · ${R.hint}</p>
      <label style="display:block;margin-top:14px;font-size:13px;font-weight:600">${R.label}</label>
      <textarea data-instr rows="2" placeholder="${esc(R.ph)}" style="width:100%;margin-top:6px"></textarea>
      <div class="btn-row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn ghost" data-close>${R.cancel}</button>
        <button class="btn primary" data-go>${R.go}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  const field = bg.querySelector("[data-instr]");
  field.focus();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-close]").addEventListener("click", close);
  bg.querySelector("[data-go]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${R.working}`;
    try {
      await api(`/api/posts/${post.id}`, {
        method: "POST",
        body: { action: "regenerate", instruction: field.value.trim() },
      });
      toast(R.done);
      close(); refresh();
    } catch (err) {
      // El post sigue como estaba: el servidor solo escribe si la IA respondió.
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = R.go;
    }
  });
}

/**
 * Vista del email con su envío. Antes esta ventana solo servía para copiar el
 * HTML y pegarlo en Shopify Email; desde el 14-ago-2026 Sincro manda las
 * campañas por su cuenta (Amazon SES) y aquí se dispara el envío.
 *
 * "Enviar prueba" va a una sola dirección y no toca el estado de la campaña:
 * es lo que hay que usar SIEMPRE antes de soltar el envío a toda la lista.
 */
function openEmailModal(email, persisted = false) {
  const en = state.lang === "en";
  const brand = currentBrand() || {};
  const mail = brand.email || {};
  const enviado = email.status === "sent";
  const enCurso = email.status === "sending";
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h3 style="margin-bottom:4px">${esc(email.subject)}</h3>
      <p class="hint" style="margin:0 0 14px">
        ${esc(email.previewText || "")}
        ${persisted ? ` · ${statusBadge(email.status)}` : ""}
        ${email.enviados ? ` · ${email.enviados} ${en ? "sent" : "enviados"}` : ""}
      </p>

      ${persisted ? `
      <div style="border:1px solid #e2dcd2;border-radius:13px;padding:14px;background:var(--bg);margin-bottom:14px">
        ${enviado
          ? `<div class="hint">${en ? "This campaign was already sent." : "Esta campaña ya se envió."}</div>`
          : `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="testTo" value="${esc(mail.testTo || auth.currentUser?.email || "")}" placeholder="${en ? "your@email.com" : "tucorreo@ejemplo.cl"}"
                 style="flex:1;min-width:190px;padding:10px 13px;border:1px solid #cdd6ea;border-radius:11px;font-size:13.5px;background:#fff" />
          <button class="btn ghost sm" data-rewrite>${en ? "Rewrite text" : "Reescribir el texto"}</button>
          <button class="btn ghost sm" data-test>${en ? "Send test" : "Enviar prueba"}</button>
          <button class="btn primary sm" data-send>${enCurso ? (en ? "Resume sending" : "Seguir enviando") : (en ? "Send to everyone" : "Enviar a toda la lista")}</button>
        </div>
        <div class="hint" style="margin-top:9px">${en
          ? "The test goes to that address only and does not change the campaign."
          : "La prueba va solo a esa dirección y no cambia el estado de la campaña."}</div>`}
        ${email.error ? `<div class="hint" style="color:var(--err-ink);margin-top:8px">${esc(String(email.error).slice(0, 200))}</div>` : ""}
        ${persisted && !enviado && email.bloques === undefined ? `<div class="hint" style="margin-top:8px">${en
          ? "Heads up: this campaign was generated before the new design, so it will go out with the old plain layout. Generate a new plan to get the branded one."
          : "Ojo: esta campaña se generó antes del diseño nuevo, así que saldrá con el formato viejo (sin logo ni colores). Genera un plan nuevo para tenerlas con la cara de la marca."}</div>` : ""}
      </div>` : ""}

      <iframe style="width:100%;height:420px;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>
      <div class="btn-row" style="margin-top:16px;justify-content:space-between">
        <button class="btn ghost sm" data-copy="html">${en ? "Copy HTML" : "Copiar HTML"}</button>
        <button class="btn ghost" data-close>${en ? "Close" : "Cerrar"}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  bg.querySelector("iframe").srcdoc = email.html || "";
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-close]").addEventListener("click", close);
  bg.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard.writeText(email.html || "").then(() => toast(en ? "Copied ✓" : "Copiado ✓"));
  }));

  const rew = bg.querySelector("[data-rewrite]");
  if (rew) rew.addEventListener("click", async (e) => {
    const btn = e.currentTarget; const label = btn.textContent;
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const r = await api(`/api/emails/${email.id}`, { method: "POST", body: { action: "rewrite" } });
      close();
      toast(en ? "Text rewritten ✓" : "Texto reescrito ✓");
      openEmailModal(r.email, true);
      refresh();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false; btn.textContent = label;
    }
  });

  const test = bg.querySelector("[data-test]");
  if (test) test.addEventListener("click", async (e) => {
    const btn = e.currentTarget; const label = btn.textContent;
    const to = bg.querySelector("#testTo").value.trim();
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api(`/api/emails/${email.id}`, { method: "POST", body: { action: "test", to } });
      // La dirección de prueba se recuerda para no reescribirla cada vez.
      api(`/api/brands/${brand.id}`, { method: "PUT", body: { email: { testTo: to } } }).catch(() => {});
      toast(en ? `Test sent to ${to} ✓` : `Prueba enviada a ${to} ✓`);
    } catch (err) { toast(err.message, true); }
    btn.disabled = false; btn.textContent = label;
  });

  const send = bg.querySelector("[data-send]");
  if (send) send.addEventListener("click", async (e) => {
    const btn = e.currentTarget; const label = btn.textContent;
    // Esto sale a toda la lista y no se puede deshacer: se pregunta siempre.
    const ok = confirm(en
      ? `Send "${email.subject}" to every subscribed customer of ${brand.name}? This cannot be undone.`
      : `¿Enviar "${email.subject}" a todos los clientes suscritos de ${brand.name}? Esto no se puede deshacer.`);
    if (!ok) return;
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${en ? "Sending…" : "Enviando…"}`;
    try {
      const r = await api(`/api/emails/${email.id}`, { method: "POST", body: { action: "send" } });
      toast(r.estado === "sent"
        ? (en ? `Sent to ${r.total} people 🎉` : `Enviada a ${r.total} personas 🎉`)
        : (en ? `${r.enviados} of ${r.total} sent — the rest continues on its own.` : `${r.enviados} de ${r.total} enviados — el resto sigue solo.`));
      close(); refresh();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false; btn.textContent = label;
    }
  });
}

/* ── Render dispatcher ────────────────────────────────────────────────── */
const APP_SCREENS = {
  dashboard: renderDashboard, create: renderCreate, calendar: renderCalendar,
  queue: renderQueue, analytics: renderAnalytics, pricing: renderPricing,
  connections: renderConnections, settings: renderSettings,
  brandForm: renderBrandForm, draft: renderDraft,
};

function render() {
  if (state.screen === "landing") return renderLanding();
  if (!auth.currentUser) return renderAuth();
  const fn = APP_SCREENS[state.screen] || renderDashboard;
  if (!currentBrand() && !["brandForm", "settings", "pricing"].includes(state.screen)) return renderNoBrand();
  fn();
}

/* ── Arranque ─────────────────────────────────────────────────────────── */
// Al volver a la pestaña del panel (p. ej. tras conectar una red en otra
// pestaña), refresca marcas y datos automáticamente.
let lastFocusSync = 0;
window.addEventListener("focus", async () => {
  if (!auth.currentUser || ["landing", "auth"].includes(state.screen)) return;
  if (Date.now() - lastFocusSync < 4000) return;
  lastFocusSync = Date.now();
  try {
    await loadBrands();
    await loadBrandData(true);
    render();
  } catch (_) {}
});

let booted = false;
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await loadBrands();
      await loadBrandData();
      // Al entrar al sitio siempre se muestra la landing; solo se salta al
      // panel cuando el usuario viene del login ("Entrar").
      if (booted && state.screen === "auth") state.screen = "dashboard";
    } catch (err) {
      toast(err.message, true);
      signOut(auth).catch(() => {});
      state.screen = "landing";
    }
  } else {
    state.brands = []; state.dataFor = null;
    state.screen = "landing";
  }
  booted = true;
  render();
});
