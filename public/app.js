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
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWOTFFnh9kyiPbgr9PssYNakdBUA-f0O4",
  authDomain: "ambar-autopost.firebaseapp.com",
  projectId: "ambar-autopost",
  storageBucket: "ambar-autopost.firebasestorage.app",
  appId: "1:3976211763:web:b60cd8e2fbfadffa786246",
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const storage = getStorage(fbApp);

/* ── i18n ─────────────────────────────────────────────────────────────── */
const I18N = {
  es: {
    tagline: "Un mensaje, todas tus redes", brand: "Marca activa", addBrand: "Añadir marca",
    newPlan: "Crear nuevo calendario de publicaciones", add: "Añadir", moreLabel: "Más", logout: "Salir",
    nav: { dashboard: "Panel", create: "Crear plan", calendar: "Calendario", queue: "Cola", analytics: "Analíticas", pricing: "Planes", connections: "Conexiones", settings: "Ajustes" },
    subs: { dashboard: "Contenido coordinado de", create: "Genera la semana con IA", calendar: "Instagram + email de esta semana", queue: "Todas las piezas de contenido", analytics: "Actividad de tu contenido", pricing: "Planes de Sincro", connections: "Cuentas conectadas de", settings: "Marcas y preferencias" },
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
    create: { title: "Generar plan de contenido", subtitle: "Describe tu objetivo y la IA creará posts de Instagram y emails coordinados, con imágenes tomadas de tu web.", goalLabel: "¿Qué quieres lograr esta semana?", goalPh: "Ej: promocionar la nueva colección de plata con enfoque en regalos…", period: "Periodo", tone: "Tono", channels: "Canales a generar", imageSource: "Origen de las imágenes", pullWeb: "Tomar fotos desde mi web", connected: "Conectado", notConnected: "Configura la web o Shopify en Conexiones", generate: "Generar plan", generating: "Generando plan… (~30 s)", prev: "Planes anteriores", open: "Abrir", soon: "pronto", periods: ["1 semana", "2 semanas", "1 mes"], tones: ["Cercano y cálido", "Profesional", "Divertido", "Inspirador", "Minimalista"] },
    draft: { banner: "¡Plan generado! {n} piezas coordinadas listas para revisar.", approve: "✔ Aprobar y agendar", discard: "Descartar", back: "← Volver", scheduled: "Agendado", igTitle: "📸 Instagram", emTitle: "✉️ Emails (para Shopify Email)", approved: "Agendado: {p} posts y {e} emails" },
    queue: { all: "Todo", ig: "Instagram", email: "Email", published: "Publicados", publishNow: "Publicar ahora", view: "Ver / Copiar", del: "Eliminar", empty: "No hay contenido todavía. Genera un plan para llenar la cola." },
    ana: { published: "Publicados (total)", queue: "En cola", emailsReady: "Emails listos", errors: "Con error", activity: "Actividad de los últimos 7 días", top: "Últimas publicaciones", soon: "Las métricas de alcance e interacción de Instagram llegarán pronto.", none: "Aún no hay publicaciones." },
    pricing: { title: "Elige tu plan", subtitle: "Todos los planes incluyen Instagram, Facebook y email coordinados con IA. Solo cambia cuántas marcas puedes gestionar.", perMonth: "/mes", popular: "Más popular", choose: "Elegir plan", brands1: "1 marca", brandsN: "{n} marcas", soon: "Muy pronto podrás contratar tu plan desde aquí. Escríbenos para partir hoy.", features: ["Posts de Instagram con IA", "Emails coordinados", "Fotos desde tu web o Shopify", "Publicación automática", "Soporte por email"] },
    conn: { social: "Redes sociales", socialHint: "Conecta las cuentas donde Sincro publicará el contenido de esta marca.", store: "Email y tienda", storeHint: "Desde dónde se toman los productos y se preparan los emails.", connect: "Conectar", reconnect: "Reconectar", connected: "Conectado", notConnected: "Sin conectar", soon: "Próximamente", igDetail: "publica tus posts automáticamente", fbDetail: "publica también en tu Página (usa la conexión de Instagram)", pinDetail: "pines automáticos de tus productos", shopifyDetail: "productos y precios exactos", webDetail: "fotos y productos de tu sitio", inspoLong: "Añade cuentas de Instagram de referencia. La IA analiza su estilo, tono y formatos para generar contenido alineado con esta marca.", inspoPh: "@usuario_de_instagram", activate: "Activar", advanced: "Opciones avanzadas (credenciales manuales de Instagram)", guide: "📖 Ver guía paso a paso", fbNote: "Completa la conexión en la pestaña de Facebook y luego recarga el panel." },
    settings: { brands: "Mis marcas", prefs: "Preferencias", lang: "Idioma", langHint: "Idioma de la interfaz", auto: "Aprobar automáticamente", autoHint: "Publica sin revisión manual", edit: "Editar", newBrand: "Nueva marca", name: "Nombre de la marca", web: "Página web", webSub: "de donde se sacan fotos y productos", voice: "Voz de la marca", tone: "Tono", audience: "Público", currency: "Moneda", language: "Idioma del contenido", hashtags: "Hashtags fijos", hashtagsSub: "opcional — la IA genera los de cada post", save: "Guardar cambios", createBrand: "Crear marca", delete: "Eliminar marca", saved: "Cambios guardados ✓", created: "Marca creada ✓" },
    common: { soon: "Próximamente", loading: "Cargando…", confirmDel: "¿Eliminar definitivamente?", today: "Hoy" },
  },
  en: {
    tagline: "One message, every channel", brand: "Active brand", addBrand: "Add brand",
    newPlan: "Create new posting calendar", add: "Add", moreLabel: "More", logout: "Log out",
    nav: { dashboard: "Dashboard", create: "Create plan", calendar: "Calendar", queue: "Queue", analytics: "Analytics", pricing: "Plans", connections: "Connections", settings: "Settings" },
    subs: { dashboard: "Coordinated content for", create: "Generate the week with AI", calendar: "Instagram + email this week", queue: "All content pieces", analytics: "Your content activity", pricing: "Sincro plans", connections: "Connected accounts for", settings: "Brands and preferences" },
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
    create: { title: "Generate content plan", subtitle: "Describe your goal and AI will create coordinated Instagram posts and emails, with images pulled from your website.", goalLabel: "What do you want to achieve this week?", goalPh: "e.g. promote the new silver collection with a gifting angle…", period: "Period", tone: "Tone", channels: "Channels to generate", imageSource: "Image source", pullWeb: "Pull photos from my website", connected: "Connected", notConnected: "Set up your website or Shopify in Connections", generate: "Generate plan", generating: "Generating plan… (~30 s)", prev: "Previous plans", open: "Open", soon: "soon", periods: ["1 week", "2 weeks", "1 month"], tones: ["Warm & friendly", "Professional", "Playful", "Inspiring", "Minimalist"] },
    draft: { banner: "Plan generated! {n} coordinated pieces ready to review.", approve: "✔ Approve & schedule", discard: "Discard", back: "← Back", scheduled: "Scheduled", igTitle: "📸 Instagram", emTitle: "✉️ Emails (for Shopify Email)", approved: "Scheduled: {p} posts and {e} emails" },
    queue: { all: "All", ig: "Instagram", email: "Email", published: "Published", publishNow: "Publish now", view: "View / Copy", del: "Delete", empty: "No content yet. Generate a plan to fill the queue." },
    ana: { published: "Published (total)", queue: "Queued", emailsReady: "Emails ready", errors: "Errored", activity: "Last 7 days of activity", top: "Latest publications", soon: "Instagram reach and engagement metrics coming soon.", none: "No publications yet." },
    pricing: { title: "Choose your plan", subtitle: "Every plan includes AI-coordinated Instagram, Facebook and email. Only the number of brands changes.", perMonth: "/mo", popular: "Most popular", choose: "Choose plan", brands1: "1 brand", brandsN: "{n} brands", soon: "Soon you'll be able to subscribe right here. Contact us to start today.", features: ["AI Instagram posts", "Coordinated emails", "Photos from your site or Shopify", "Automatic publishing", "Email support"] },
    conn: { social: "Social channels", socialHint: "Connect the accounts where Sincro will publish this brand's content.", store: "Email & store", storeHint: "Where products come from and emails are prepared.", connect: "Connect", reconnect: "Reconnect", connected: "Connected", notConnected: "Not connected", soon: "Coming soon", igDetail: "publishes your posts automatically", fbDetail: "also publish to your Page (uses the Instagram connection)", pinDetail: "automatic product pins", shopifyDetail: "exact products and prices", webDetail: "photos and products from your site", inspoLong: "Add reference Instagram accounts. AI analyzes their style, tone and formats to generate aligned content.", inspoPh: "@instagram_handle", activate: "Enable", advanced: "Advanced options (manual Instagram credentials)", guide: "📖 Step-by-step guide", fbNote: "Finish connecting in the Facebook tab, then reload the panel." },
    settings: { brands: "My brands", prefs: "Preferences", lang: "Language", langHint: "Interface language", auto: "Auto-approve", autoHint: "Publish without manual review", edit: "Edit", newBrand: "New brand", name: "Brand name", web: "Website", webSub: "where photos and products come from", voice: "Brand voice", tone: "Tone", audience: "Audience", currency: "Currency", language: "Content language", hashtags: "Fixed hashtags", hashtagsSub: "optional — AI generates per-post hashtags", save: "Save changes", createBrand: "Create brand", delete: "Delete brand", saved: "Saved ✓", created: "Brand created ✓" },
    common: { soon: "Coming soon", loading: "Loading…", confirmDel: "Delete permanently?", today: "Today" },
  },
};

/* ── Estado ───────────────────────────────────────────────────────────── */
const state = {
  lang: localStorage.getItem("lang") || "es",
  screen: "landing",
  brands: [], brandId: localStorage.getItem("brandId") || null,
  posts: [], emails: [], plans: [], dataFor: null,
  draft: null, justApproved: false,
  queueFilter: "all",
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

    <section id="pricing" class="land-cta">
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
        <button class="btn primary" data-nav="create">✦ ${T.newPlan}</button>
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
              <div style="display:flex;align-items:center;gap:11px">
                ${chanChip(c.ch, 30)}
                <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${c.name}</div><div style="font-size:11px;color:var(--muted)">${c.detail}</div></div>
                <span style="width:9px;height:9px;border-radius:50%;background:${c.on ? "var(--ok-ink)" : "#d8d1c7"}"></span>
              </div>`).join("")}
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
  state.createOpts = state.createOpts || { emailOn: true, fbOn: !!brand.instagram?.postToFacebook, pinOn: !!brand.pinterest?.connected, tone: "" };
  const o = state.createOpts;

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

        <div class="row">
          <div class="field"><label>${C.period}</label>
            <div style="display:flex;gap:6px;background:var(--bg);border:1px solid #e2dcd2;border-radius:11px;padding:4px">
              ${C.periods.map((p, i) => `<button class="btn sm ${i === 0 ? "primary" : "ghost"}" style="flex:1;${i > 0 ? "opacity:.5" : ""}" ${i > 0 ? "disabled title='" + T.common.soon + "'" : ""}>${p}</button>`).join("")}
            </div>
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

        ${state.sub ? `<p class="hint" style="margin:14px 0 0;text-align:center">
          ${state.sub.planName} · ${state.lang === "en" ? "generations this month" : "generaciones este mes"}: <b>${state.sub.gensUsed}/${state.sub.gensMax}</b>
          ${state.sub.trialEndsAt ? ` · ${state.lang === "en" ? "trial ends" : "prueba termina"} ${new Date(state.sub.trialEndsAt).toLocaleDateString(state.lang === "en" ? "en-US" : "es-CL")}` : ""}
        </p>` : ""}
        <button class="btn primary lg block" id="genBtn" style="margin-top:14px">✦ ${C.generate}</button>
      </div>

      ${state.plans.length ? `<div class="card" style="margin-top:20px"><h2>${C.prev}</h2>
        ${state.plans.slice(0, 6).map((p) => `
          <div class="email-item"><div class="info">
            <div class="subj">${esc(p.startDate)} ${statusBadge(p.status)}</div>
            <div class="prev">${(p.posts || []).length} posts · ${(p.emails || []).length} emails · ${fmtDate(p.createdAt)}</div>
          </div><button class="btn ghost sm" data-open-plan="${p.id}">${C.open}</button></div>`).join("")}
      </div>` : ""}
    </div>`;

  renderShell(html, () => {
    $$("[data-chan]").forEach((b) => b.addEventListener("click", () => {
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
          const path = `uploads/${auth.currentUser.uid}/${brand.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
          const snap = await uploadBytes(storageRef(storage, path), f);
          const url = await getDownloadURL(snap.ref);
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
    $$("[data-imgmode]").forEach((b) => b.addEventListener("click", () => { o.imageMode = b.dataset.imgmode; render(); }));
    $$("[data-epw]").forEach((b) => b.addEventListener("click", () => { o.emailsPerWeek = Number(b.dataset.epw); render(); }));
    $$("[data-open-plan]").forEach((b) => b.addEventListener("click", async () => {
      const { plan } = await api(`/api/plans/${b.dataset.openPlan}`);
      state.draft = plan; go("draft");
    }));
    $("#genBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      o.goal = $("#goalInput").value.trim();
      o.tone = $("#toneInput").value;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${C.generating}`;
      try {
        const { plan } = await api("/api/plans", { method: "POST", body: {
          brandId: brand.id, goal: o.goal, tone: o.tone, imageMode: o.imageMode || "web",
          pinterest: !!o.pinOn,
          postsPerWeek: 7, includeEmails: o.emailOn, emailsPerWeek: o.emailOn ? (o.emailsPerWeek || 2) : 0,
        } });
        if (o.fbOn !== !!brand.instagram?.postToFacebook) {
          api(`/api/brands/${brand.id}`, { method: "PUT", body: { instagram: { postToFacebook: o.fbOn } } }).catch(() => {});
        }
        state.draft = plan; state.dataFor = null;
        go("draft");
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false; btn.textContent = `✦ ${C.generate}`;
      }
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

  const html = `
    <div class="notice ok" style="display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">✓</span> ${D.banner.replace("{n}", n)}
      <div style="margin-left:auto" class="btn-row">
        <button class="btn ghost sm" data-back>${D.back}</button>
        ${isDraft ? `<button class="btn danger sm" data-discard>${D.discard}</button>
        <button class="btn ok sm" data-approve>${D.approve}</button>` : `<span class="badge ok">${D.scheduled}</span>`}
      </div>
    </div>
    <h3 style="margin:18px 0 12px">${D.igTitle}</h3>
    <div class="grid">
      ${(plan.posts || []).map((p) => `
        <div class="post-card">
          <div class="thumb" style="${p.imageUrl ? `background-image:url('${esc(p.imageUrl)}')` : ""}"></div>
          <div class="body">
            <div class="meta"><span>${esc(p.date || "")} · ${esc(p.time || "")}</span><span class="badge muted">${esc(p.theme || "")}</span></div>
            <div class="caption">${esc(p.caption)}</div>
          </div>
        </div>`).join("") || `<p class="hint">—</p>`}
    </div>
    <h3 style="margin:26px 0 12px">${D.emTitle}</h3>
    <div>
      ${(plan.emails || []).map((e, i) => `
        <div class="email-item"><div class="info">
          <div class="subj">${esc(e.subject)}</div>
          <div class="prev">${esc(e.date || "")} · ${esc(e.previewText || "")}</div>
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
        state.draft = null; state.justApproved = true;
        await loadBrandData(true); go("calendar");
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = D.approve; }
    });
  });
}

/* ── CALENDAR ─────────────────────────────────────────────────────────── */
function renderCalendar() {
  const T = t();
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const dows = state.lang === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const pieces = [...state.posts.map((p) => ({ ...p, _ch: "ig" })), ...state.emails.map((e) => ({ ...e, _ch: "email" }))];

  const banner = state.justApproved ? `<div class="notice ok" style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">✓</span> ${t().draft.banner.replace("{n}", "")}</div>` : "";
  state.justApproved = false;

  const html = `
    ${banner}
    <div class="week-grid">
      ${days.map((d, i) => {
        const start = d.getTime(), end = start + 864e5;
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
function renderPricing() {
  const P = t().pricing;
  const tiers = [
    { key: "basico", name: "Básico", price: "$9.900", brands: P.brands1, gens: 8 },
    { key: "pro", name: "Pro", price: "$16.900", brands: P.brandsN.replace("{n}", "2"), gens: 20 },
    { key: "studio", name: "Studio", price: "$19.900", brands: P.brandsN.replace("{n}", "3"), gens: 40, popular: true },
    { key: "agencia", name: "Agencia", price: "$24.900", brands: P.brandsN.replace("{n}", "4"), gens: 100 },
  ];
  const current = state.sub?.plan;
  const html = `
    <div style="text-align:center;max-width:560px;margin:0 auto 30px">
      <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-.02em">${P.title}</h2>
      <p style="margin:0;font-size:14px;color:var(--muted);line-height:1.55">${P.subtitle}</p>
    </div>
    <div class="plans-grid">
      ${tiers.map((p) => `
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
            : `<button class="btn ${p.popular ? "primary" : "soft"} block" data-choose>${P.choose}</button>`}
        </div>`).join("")}
    </div>`;
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
        ${connCard("ig", "Instagram", C.igDetail, ig.connected,
          `<button class="btn ${ig.connected ? "ghost" : "primary"} block" id="fbConnect">${ig.connected ? C.reconnect : C.connect}</button>`)}
        ${connCard("fb", "Facebook", C.fbDetail, ig.postToFacebook,
          `<button class="btn ${ig.postToFacebook ? "ghost" : "soft"} block" id="fbToggle" ${ig.connected ? "" : "disabled"}>${ig.postToFacebook ? C.connected + " ✓" : C.activate}</button>`)}
        ${connCard("pin", "Pinterest", (brand.pinterest?.connected ? `@${esc(brand.pinterest.username)} · ${esc(brand.pinterest.boardName)}` : C.pinDetail), brand.pinterest?.connected,
          `<button class="btn ${brand.pinterest?.connected ? "ghost" : "primary"} block" id="pinConnect">${brand.pinterest?.connected ? C.reconnect : C.connect}</button>`)}
      </div>

      <h2 style="margin:0 0 4px;font-size:16px;font-weight:800">${C.store}</h2>
      <p style="margin:0 0 18px" class="hint">${C.storeHint}</p>
      <div class="conn-grid" style="margin-bottom:16px">
        ${connCard("email", "Shopify", C.shopifyDetail, shop.connected,
          `<button class="btn ${shop.connected ? "ghost" : "primary"} block" id="shopifyToggle">${shop.connected ? C.reconnect : C.connect}</button>`)}
        ${connCard("email", "Web", C.webDetail, !!brand.websiteUrl,
          `<button class="btn soft block" data-edit-brand>${brand.websiteUrl ? esc(brand.websiteUrl).slice(0, 30) : C.connect}</button>`)}
      </div>
      <div id="shopifyFields" class="card" style="display:none;margin-bottom:32px">
        <p class="hint">Shopify → <b>Ajustes → Apps y canales de venta → Desarrollar apps → Crear app</b> ("Sincro") → pestaña <b>API de Admin</b> → permisos de lectura de productos → <b>Instalar app</b> → copia el token.</p>
        <div class="row">
          <div class="field"><label>Dominio</label><input id="f_shopDomain" value="${esc(shop.storeDomain || "")}" placeholder="tu-tienda.myshopify.com" /></div>
          <div class="field"><label>API version</label><input id="f_shopVer" value="${esc(shop.apiVersion || "2024-04")}" /></div>
        </div>
        <div class="field"><label>Token</label><input id="f_shopToken" placeholder="${tokenPh(shop.connected)}" /></div>
        <button class="btn primary sm" id="saveShopify">Guardar y probar</button>
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
      const btn = e.currentTarget; const label = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const { url } = await api("/api/brands/pinterest-oauth", { method: "POST", body: { brandId: brand.id } });
        window.open(url, "_blank");
        toast(state.lang === "en" ? "Finish connecting in the Pinterest tab, then reload." : "Completa la conexión en la pestaña de Pinterest y luego recarga el panel.");
      } catch (err) { toast(err.message, true); }
      btn.disabled = false; btn.textContent = label;
    });
    const fbT = $("#fbToggle");
    if (fbT) fbT.addEventListener("click", async () => {
      await api(`/api/brands/${brand.id}`, { method: "PUT", body: { instagram: { postToFacebook: !ig.postToFacebook } } });
      await loadBrands(); render();
    });
    $("#shopifyToggle").addEventListener("click", () => {
      const el = $("#shopifyFields");
      el.style.display = el.style.display === "none" ? "block" : "none";
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
          <span class="badge muted">${t().common.soon}</span>
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
  bg.querySelector("[data-mdel]").addEventListener("click", async () => {
    if (!confirm(t().common.confirmDel)) return;
    await api(`/api/posts/${post.id}`, { method: "DELETE" });
    close(); refresh();
  });
}

function openEmailModal(email, persisted = false) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h3>${esc(email.subject)}</h3>
      <p class="hint">Copia lo que necesites y pégalo en Shopify Email.</p>
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn ghost sm" data-copy="subject">Copiar asunto</button>
        <button class="btn ghost sm" data-copy="html">Copiar HTML</button>
        <button class="btn ghost sm" data-copy="text">Copiar texto</button>
        ${persisted && email.status !== "sent" ? `<button class="btn primary sm" data-marksent>Marcar enviado</button>` : ""}
      </div>
      <iframe style="width:100%;height:420px;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>
      <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close>Cerrar</button></div>
    </div>`;
  document.body.appendChild(bg);
  bg.querySelector("iframe").srcdoc = email.html || "";
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-close]").addEventListener("click", close);
  bg.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    const map = { subject: email.subject, html: email.html, text: email.plainText };
    navigator.clipboard.writeText(map[b.dataset.copy] || "").then(() => toast("Copiado ✓"));
  }));
  const ms = bg.querySelector("[data-marksent]");
  if (ms) ms.addEventListener("click", async () => {
    await api(`/api/emails/${email.id}`, { method: "PUT", body: { status: "sent" } });
    toast("Marcado como enviado");
    close(); refresh();
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
let booted = false;
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await loadBrands();
      await loadBrandData();
      if (["landing", "auth"].includes(state.screen) && booted) state.screen = "dashboard";
      else if (!booted) state.screen = "dashboard";
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
