// public/app.js
// Panel de una sola página (SPA sin dependencias) para administrar marcas,
// generar el plan semanal con IA, revisar/aprobar posts de Instagram y emails
// coordinados para Shopify Email.

const state = {
  pw: localStorage.getItem("pw") || "",
  brands: [],
  brandId: null,
  tab: "plan",
  draft: null, // borrador de plan en revisión
  busy: false,
};

const root = document.getElementById("root");
const $ = (sel, el = document) => el.querySelector(sel);

// ── API ─────────────────────────────────────────────────────────────────
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-app-password": state.pw,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logout();
    throw new Error(data.error || "No autorizado.");
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(msg, isErr = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => (t.className = "toast"), 3200);
}

function logout() {
  state.pw = "";
  localStorage.removeItem("pw");
  renderLogin();
}

// ── Helpers de render ──────────────────────────────────────────────────
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDate(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("es-CL", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return "—"; }
}

const statusBadge = (s) => {
  const map = {
    pending: ["muted", "En cola"], publishing: ["warn", "Publicando"],
    published: ["ok", "Publicado"], error: ["err", "Error"],
    ready: ["warn", "Listo"], sent: ["ok", "Enviado"], draft: ["muted", "Borrador"],
    scheduled: ["ok", "Agendado"],
  };
  const [cls, label] = map[s] || ["muted", s || "—"];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
};

// ── Login ───────────────────────────────────────────────────────────────
function renderLogin() {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>💎 Autopost</h1>
        <p>Instagram + Shopify Email, coordinados</p>
        <form id="loginForm">
          <div class="field"><input type="password" id="pwInput" placeholder="Contraseña del panel" autofocus /></div>
          <button class="btn primary" style="width:100%" type="submit">Entrar</button>
        </form>
        <p style="margin-top:16px;font-size:12px">Es la variable <code>APP_PASSWORD</code> que definiste en Vercel.</p>
      </div>
    </div>`;
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    state.pw = $("#pwInput").value.trim();
    try {
      await api("/api/status");
      localStorage.setItem("pw", state.pw);
      boot();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ── App principal ─────────────────────────────────────────────────────────
async function boot() {
  if (!state.pw) return renderLogin();
  try {
    const { brands } = await api("/api/brands");
    state.brands = brands;
    if (!state.brandId && brands.length) state.brandId = brands[0].id;
    renderApp();
  } catch (err) {
    if (state.pw) toast(err.message, true);
  }
}

function renderApp() {
  const brands = state.brands;
  const nav = brands
    .map(
      (b) => `<button class="nav-item ${b.id === state.brandId ? "active" : ""}" data-brand="${b.id}">
        <span>${esc(b.name)}</span>
        <span class="dot ${b.instagram.connected ? "on" : ""}"></span>
      </button>`
    )
    .join("");

  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand-logo">💎 Autopost<small>tus marcas</small></div>
        ${nav || '<p class="hint" style="padding:0 8px">Aún no tienes marcas.</p>'}
        <button class="nav-item" data-action="new-brand" style="color:var(--accent-dark);font-weight:600">+ Nueva marca</button>
        <div class="sidebar-foot">
          <button class="nav-item" data-action="logout">Salir</button>
        </div>
      </aside>
      <main class="main" id="mainArea"></main>
    </div>`;

  root.querySelectorAll("[data-brand]").forEach((el) =>
    el.addEventListener("click", () => { state.brandId = el.dataset.brand; state.draft = null; renderMain(); })
  );
  $("[data-action='logout']").addEventListener("click", logout);
  $("[data-action='new-brand']").addEventListener("click", () => renderBrandForm(null));
  renderMain();
}

function currentBrand() {
  return state.brands.find((b) => b.id === state.brandId) || null;
}

function renderMain() {
  const main = $("#mainArea");
  if (!main) return;
  const brand = currentBrand();
  if (!brand) {
    main.innerHTML = `<div class="empty"><h2>Bienvenida 👋</h2><p>Crea tu primera marca para empezar.</p><button class="btn primary" data-action="new-brand2">+ Nueva marca</button></div>`;
    $("[data-action='new-brand2']").addEventListener("click", () => renderBrandForm(null));
    return;
  }

  const tabs = [
    ["plan", "Plan semanal"],
    ["cola", "Cola de Instagram"],
    ["emails", "Emails"],
    ["conexiones", "Conexiones"],
  ];
  main.innerHTML = `
    <div class="page-head">
      <h2>${esc(brand.name)}</h2>
      <div class="btn-row">
        <span class="badge ${brand.instagram.connected ? "ok" : "muted"}">${brand.instagram.connected ? "IG conectado" : "IG sin conectar"}</span>
        <span class="badge ${brand.shopify.connected ? "ok" : "muted"}">${brand.shopify.connected ? "Shopify conectado" : "Shopify sin conectar"}</span>
      </div>
    </div>
    <div class="tabs">${tabs.map(([id, l]) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${l}</button>`).join("")}</div>
    <div id="tabArea"></div>`;

  main.querySelectorAll("[data-tab]").forEach((el) =>
    el.addEventListener("click", () => { state.tab = el.dataset.tab; renderMain(); })
  );

  const area = $("#tabArea");
  if (state.tab === "plan") renderPlanTab(area, brand);
  else if (state.tab === "cola") renderQueueTab(area, brand);
  else if (state.tab === "emails") renderEmailsTab(area, brand);
  else if (state.tab === "conexiones") renderConnectionsTab(area, brand);
}

// ── Tab: Plan semanal ─────────────────────────────────────────────────────
async function renderPlanTab(area, brand) {
  if (state.draft) return renderDraft(area, brand, state.draft);

  const notice = brand.instagram.connected
    ? ""
    : `<div class="notice">Conecta Instagram en la pestaña <b>Conexiones</b> para poder publicar. Igual puedes generar y revisar el plan.</div>`;

  area.innerHTML = `
    ${notice}
    <div class="card">
      <h3>Generar el plan de la semana</h3>
      <p class="hint">La IA toma las fotos y productos de tu web/Shopify y arma 7 días de contenido de Instagram + emails coordinados. Tú lo revisas antes de agendar.</p>
      <div class="row">
        <div class="field"><label>Empezar el día</label><input type="date" id="startDate" /></div>
        <div class="field"><label>Posts de Instagram</label><select id="postsPerWeek">${[3,4,5,6,7].map(n=>`<option value="${n}" ${n===7?"selected":""}>${n} posts</option>`).join("")}</select></div>
      </div>
      <div class="row">
        <div class="field"><label>Emails de la semana</label><select id="emailsPerWeek">${[0,1,2,3].map(n=>`<option value="${n}" ${n===2?"selected":""}>${n} emails</option>`).join("")}</select></div>
        <div class="field" style="display:flex;align-items:flex-end"><button class="btn ghost sm" id="previewProducts" type="button">👁 Ver productos detectados</button></div>
      </div>
      <div id="productPreview"></div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn primary" id="genPlan">✨ Generar plan</button>
      </div>
    </div>
    <div class="card"><h3>Planes anteriores</h3><div id="plansList" class="hint">Cargando…</div></div>`;

  $("#startDate").value = new Date().toISOString().slice(0, 10);

  $("#previewProducts").addEventListener("click", async () => {
    const box = $("#productPreview");
    box.innerHTML = `<p class="hint"><span class="spinner"></span> Buscando productos…</p>`;
    try {
      const r = await api("/api/scrape", { method: "POST", body: { brandId: brand.id } });
      if (!r.candidates?.length) {
        box.innerHTML = `<div class="notice">No se detectaron productos automáticamente. Conecta Shopify o revisa la URL de la web en Conexiones.</div>`;
        return;
      }
      box.innerHTML = `<p class="hint">Fuente: <b>${esc(r.source)}</b> · ${r.candidates.length} productos</p>
        <div class="grid">${r.candidates.slice(0, 8).map(c => `
          <div class="post-card"><div class="thumb" style="background-image:url('${esc(c.imageUrl)}')"></div>
          <div class="body"><div style="font-weight:600;font-size:13px">${esc(c.title || "—")}</div>
          <div class="hint">${esc(c.price || "")} ${esc(c.currency || "")}</div></div></div>`).join("")}</div>`;
    } catch (err) { box.innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
  });

  $("#genPlan").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Generando (puede tardar ~30s)…`;
    try {
      const body = {
        brandId: brand.id,
        startDate: $("#startDate").value,
        postsPerWeek: Number($("#postsPerWeek").value),
        emailsPerWeek: Number($("#emailsPerWeek").value),
        includeEmails: Number($("#emailsPerWeek").value) > 0,
      };
      const { plan } = await api("/api/plans", { method: "POST", body });
      state.draft = plan;
      renderMain();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false; btn.textContent = "✨ Generar plan";
    }
  });

  // Lista de planes previos
  try {
    const { plans } = await api(`/api/plans?brandId=${brand.id}`);
    const el = $("#plansList");
    if (!plans.length) { el.textContent = "Todavía no has generado ningún plan."; return; }
    el.innerHTML = plans.map(p => `
      <div class="email-item">
        <div class="info"><div class="subj">Semana del ${esc(p.startDate)} ${statusBadge(p.status)}</div>
        <div class="prev">${p.posts?.length || 0} posts · ${p.emails?.length || 0} emails · ${fmtDate(p.createdAt)}</div></div>
        <button class="btn ghost sm" data-openplan="${p.id}">Abrir</button>
      </div>`).join("");
    el.querySelectorAll("[data-openplan]").forEach(b => b.addEventListener("click", async () => {
      const { plan } = await api(`/api/plans/${b.dataset.openplan}`);
      state.draft = plan; renderMain();
    }));
  } catch (_) { $("#plansList").textContent = "—"; }
}

function renderDraft(area, brand, plan) {
  const isDraft = plan.status === "draft";
  area.innerHTML = `
    <div class="page-head">
      <div><h2 style="font-size:18px;margin:0">Plan · semana del ${esc(plan.startDate)}</h2>
      <p class="hint" style="margin:2px 0 0">${plan.posts?.length || 0} posts · ${plan.emails?.length || 0} emails · fuente: ${esc(plan.source)}</p></div>
      <div class="btn-row">
        <button class="btn ghost sm" data-action="back">← Volver</button>
        ${isDraft ? `<button class="btn danger sm" data-action="discard">Descartar</button>
        <button class="btn primary" data-action="approve">✔ Aprobar y agendar</button>` : `<span class="badge ok">Agendado</span>`}
      </div>
    </div>
    <h3 style="margin:6px 0 12px">📸 Instagram</h3>
    <div class="grid">${(plan.posts || []).map(p => `
      <div class="post-card">
        <div class="thumb" style="background-image:url('${esc(p.imageUrl)}')"></div>
        <div class="body">
          <div class="meta"><span>Día ${p.day} · ${esc(p.time || "")}</span><span class="badge muted">${esc(p.theme || "")}</span></div>
          <div class="caption">${esc(p.caption)}</div>
        </div>
      </div>`).join("") || '<p class="hint">Sin posts con imagen.</p>'}</div>
    <h3 style="margin:26px 0 12px">✉️ Emails (para Shopify Email)</h3>
    <div>${(plan.emails || []).map((e, i) => `
      <div class="email-item"><div class="info">
        <div class="subj">${esc(e.subject)}</div>
        <div class="prev">Día ${e.day} · ${esc(e.previewText || "")}</div>
      </div><button class="btn ghost sm" data-draftemail="${i}">Ver</button></div>`).join("") || '<p class="hint">Sin emails.</p>'}</div>`;

  $("[data-action='back']").addEventListener("click", () => { state.draft = null; renderMain(); });
  area.querySelectorAll("[data-draftemail]").forEach(b =>
    b.addEventListener("click", () => openEmailModal(plan.emails[Number(b.dataset.draftemail)]))
  );
  if (isDraft) {
    $("[data-action='discard']").addEventListener("click", async () => {
      if (!confirm("¿Descartar este borrador?")) return;
      await api(`/api/plans/${plan.id}`, { method: "DELETE" });
      state.draft = null; toast("Borrador descartado"); renderMain();
    });
    $("[data-action='approve']").addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Agendando…`;
      try {
        const r = await api(`/api/plans/${plan.id}`, { method: "POST", body: { action: "approve" } });
        toast(`Agendado: ${r.scheduledPosts} posts, ${r.emails} emails`);
        state.draft = null; state.tab = "cola"; renderMain();
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = "✔ Aprobar y agendar"; }
    });
  }
}

// ── Tab: Cola de Instagram ────────────────────────────────────────────────
async function renderQueueTab(area, brand) {
  area.innerHTML = `<p class="hint"><span class="spinner"></span> Cargando cola…</p>`;
  try {
    const { posts } = await api(`/api/posts?brandId=${brand.id}`);
    if (!posts.length) { area.innerHTML = `<div class="empty">No hay posts en la cola. Genera un plan en la pestaña <b>Plan semanal</b>.</div>`; return; }
    area.innerHTML = `<div class="grid">${posts.map(p => `
      <div class="post-card">
        <div class="thumb" style="background-image:url('${esc(p.imageUrl)}')"></div>
        <div class="body">
          <div class="meta"><span>${fmtDate(p.scheduledFor)}</span>${statusBadge(p.status)}</div>
          <div class="caption">${esc(p.caption)}</div>
          ${p.error ? `<div class="badge err">${esc(p.error).slice(0,120)}</div>` : ""}
          <div class="actions">
            ${p.status === "pending" || p.status === "error" ? `<button class="btn primary sm" data-pub="${p.id}">Publicar ahora</button>` : ""}
            <button class="btn ghost sm" data-del="${p.id}">Eliminar</button>
          </div>
        </div>
      </div>`).join("")}</div>`;

    area.querySelectorAll("[data-pub]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true; b.innerHTML = `<span class="spinner"></span>`;
      try { await api(`/api/posts/${b.dataset.pub}`, { method: "POST", body: { action: "publish" } });
        toast("¡Publicado en Instagram!"); renderMain();
      } catch (err) { toast(err.message, true); renderMain(); }
    }));
    area.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este post?")) return;
      await api(`/api/posts/${b.dataset.del}`, { method: "DELETE" }); toast("Eliminado"); renderMain();
    }));
  } catch (err) { area.innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
}

// ── Tab: Emails ───────────────────────────────────────────────────────────
async function renderEmailsTab(area, brand) {
  area.innerHTML = `<p class="hint"><span class="spinner"></span> Cargando emails…</p>`;
  try {
    const { emails } = await api(`/api/emails?brandId=${brand.id}`);
    const notice = `<div class="notice">Shopify no permite enviar campañas por API. Estos emails quedan <b>listos</b>: ábrelos, copia el HTML o el texto, y pégalos en <b>Shopify → Marketing → Shopify Email</b> para enviarlos con un clic.</div>`;
    if (!emails.length) { area.innerHTML = notice + `<div class="empty">Aún no hay emails. Genera un plan con emails activados.</div>`; return; }
    area.innerHTML = notice + emails.map(e => `
      <div class="email-item"><div class="info">
        <div class="subj">${esc(e.subject)} ${statusBadge(e.status)}</div>
        <div class="prev">${fmtDate(e.scheduledFor)} · ${esc(e.previewText || "")}</div>
      </div>
      <button class="btn primary sm" data-vemail="${e.id}">Ver / Copiar</button>
      <button class="btn ghost sm" data-delemail="${e.id}">Eliminar</button></div>`).join("");

    area.querySelectorAll("[data-vemail]").forEach(b => b.addEventListener("click", async () => {
      const { email } = await api(`/api/emails/${b.dataset.vemail}`);
      openEmailModal(email, true);
    }));
    area.querySelectorAll("[data-delemail]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este email?")) return;
      await api(`/api/emails/${b.dataset.delemail}`, { method: "DELETE" }); toast("Eliminado"); renderMain();
    }));
  } catch (err) { area.innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
}

function openEmailModal(email, persisted = false) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h3>${esc(email.subject)}</h3>
      <p class="hint">Asunto y vista previa. Copia lo que necesites y pégalo en Shopify Email.</p>
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn ghost sm" data-copy="subject">Copiar asunto</button>
        <button class="btn ghost sm" data-copy="html">Copiar HTML</button>
        <button class="btn ghost sm" data-copy="text">Copiar texto</button>
        ${persisted && email.status !== "sent" ? `<button class="btn primary sm" data-marksent="1">Marcar enviado</button>` : ""}
      </div>
      <iframe style="width:100%;height:420px;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>
      <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-close="1">Cerrar</button></div>
    </div>`;
  document.body.appendChild(bg);
  bg.querySelector("iframe").srcdoc = email.html || "";
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-close]").addEventListener("click", close);
  bg.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
    const map = { subject: email.subject, html: email.html, text: email.plainText };
    navigator.clipboard.writeText(map[b.dataset.copy] || "").then(() => toast("Copiado ✓"));
  }));
  const ms = bg.querySelector("[data-marksent]");
  if (ms) ms.addEventListener("click", async () => {
    await api(`/api/emails/${email.id}`, { method: "PUT", body: { status: "sent" } });
    toast("Marcado como enviado"); close(); renderMain();
  });
}

// ── Tab: Conexiones (y formulario de marca) ───────────────────────────────
function renderConnectionsTab(area, brand) {
  renderBrandForm(brand, area);
}

function brandFormHtml(brand) {
  const b = brand || {};
  const ig = b.instagram || {};
  const shop = b.shopify || {};
  const v = b.voice || {};
  const tokenPh = (has) => (has ? "•••••• (guardado, deja vacío para no cambiar)" : "");
  return `
    <div class="card">
      <h3>Datos de la marca</h3>
      <div class="field"><label>Nombre de la marca</label><input id="f_name" value="${esc(b.name || "")}" placeholder="Ej: Ámbar Joyas" /></div>
      <div class="field"><label>Página web <span class="sub">de donde se sacan fotos y productos</span></label><input id="f_web" value="${esc(b.websiteUrl || "")}" placeholder="https://www.ambarjoyas.cl" /></div>
    </div>

    <div class="card">
      <h3>Instagram <span class="sub">(Meta Graph API)</span></h3>
      <p class="hint">¿No tienes estos datos? Sigue la guía <code>scripts/GET_CREDENTIALS.md</code> para obtenerlos con el Graph API Explorer. Son de tu propia cuenta, no requieren revisión de Meta.</p>
      <div class="row">
        <div class="field"><label>IG User ID</label><input id="f_igUserId" value="${esc(ig.igUserId || "")}" placeholder="17841400000000000" /></div>
        <div class="field"><label>Page ID</label><input id="f_pageId" value="${esc(ig.pageId || "")}" placeholder="10000000000000" /></div>
      </div>
      <div class="field"><label>Page Access Token</label><input id="f_pageToken" placeholder="${tokenPh(ig.connected)}" /></div>
      <div class="field"><label>Long-lived User Token <span class="sub">(para refrescar solo)</span></label><input id="f_userToken" placeholder="${tokenPh(!!ig.tokenUpdatedAt)}" /></div>
      <div class="field"><label><input type="checkbox" id="f_fb" ${ig.postToFacebook ? "checked" : ""} style="width:auto;margin-right:6px" />Publicar también en la Página de Facebook</label></div>
    </div>

    <div class="card">
      <h3>Shopify <span class="sub">(opcional pero recomendado)</span></h3>
      <p class="hint">Con Shopify conectado, los productos y precios llegan limpios. Crea un token en Shopify → Ajustes → Apps → Desarrollar apps.</p>
      <div class="row">
        <div class="field"><label>Dominio de la tienda</label><input id="f_shopDomain" value="${esc(shop.storeDomain || "")}" placeholder="tu-tienda.myshopify.com" /></div>
        <div class="field"><label>API version</label><input id="f_shopVer" value="${esc(shop.apiVersion || "2024-04")}" placeholder="2024-04" /></div>
      </div>
      <div class="field"><label>Admin API token</label><input id="f_shopToken" placeholder="${tokenPh(shop.connected)}" /></div>
    </div>

    <div class="card">
      <h3>Voz de la marca <span class="sub">(guía para la IA)</span></h3>
      <div class="row">
        <div class="field"><label>Tono</label><input id="f_tone" value="${esc(v.tone || "")}" placeholder="cálido, cercano, aspiracional" /></div>
        <div class="field"><label>Público</label><input id="f_audience" value="${esc(v.audience || "")}" placeholder="mujeres 25-45 que aman la plata" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Moneda</label><input id="f_currency" value="${esc(v.currency || "CLP")}" placeholder="CLP" /></div>
        <div class="field"><label>Idioma</label><input id="f_language" value="${esc(v.language || "es")}" placeholder="es" /></div>
      </div>
      <div class="field"><label>Hashtags base <span class="sub">(separados por espacio)</span></label><input id="f_hashtags" value="${esc((v.hashtags || []).join(" "))}" placeholder="#ambarjoyas #plata925 #joyaschile" /></div>
    </div>

    <div class="btn-row">
      <button class="btn ghost" id="testConn" type="button">Probar conexión</button>
      <button class="btn primary" id="saveBrand">${brand ? "Guardar cambios" : "Crear marca"}</button>
      ${brand ? `<button class="btn danger" id="deleteBrand" style="margin-left:auto">Eliminar marca</button>` : ""}
    </div>
    <div id="testResult"></div>`;
}

function readBrandForm() {
  const val = (id) => $("#" + id)?.value.trim() || "";
  const ig = {
    igUserId: val("f_igUserId"), pageId: val("f_pageId"),
    postToFacebook: $("#f_fb")?.checked || false,
  };
  if (val("f_pageToken")) ig.pageAccessToken = val("f_pageToken");
  if (val("f_userToken")) ig.longLivedUserToken = val("f_userToken");
  const shop = { storeDomain: val("f_shopDomain"), apiVersion: val("f_shopVer") };
  if (val("f_shopToken")) shop.adminToken = val("f_shopToken");
  return {
    name: val("f_name"),
    websiteUrl: val("f_web"),
    instagram: ig,
    shopify: shop,
    voice: {
      tone: val("f_tone"), audience: val("f_audience"),
      currency: val("f_currency"), language: val("f_language"),
      hashtags: val("f_hashtags").split(/\s+/).filter(Boolean),
    },
  };
}

function renderBrandForm(brand, targetArea) {
  const isNew = !brand;
  let area = targetArea;
  if (!area) {
    // Vista de nueva marca (ocupa el main completo)
    root.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const main = $("#mainArea");
    main.innerHTML = `<div class="page-head"><h2>Nueva marca</h2><button class="btn ghost sm" data-action="cancelnew">Cancelar</button></div><div id="formArea"></div>`;
    $("[data-action='cancelnew']").addEventListener("click", () => renderApp());
    area = $("#formArea");
  }
  area.innerHTML = brandFormHtml(brand);

  $("#testConn").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Probando…`;
    const data = readBrandForm();
    const body = {};
    if (data.instagram.igUserId && data.instagram.pageAccessToken) body.instagram = data.instagram;
    if (data.shopify.storeDomain && data.shopify.adminToken) body.shopify = data.shopify;
    const rEl = $("#testResult");
    if (!body.instagram && !body.shopify) { rEl.innerHTML = `<div class="notice">Ingresa un token nuevo para probar (los guardados no se re-muestran).</div>`; btn.disabled=false; btn.textContent="Probar conexión"; return; }
    try {
      const r = await api("/api/brands/test", { method: "POST", body });
      const parts = [];
      if (r.instagram) parts.push(r.instagram.ok ? `✅ IG: @${esc(r.instagram.username)} (${r.instagram.followers ?? "?"} seguidores)` : `❌ IG: ${esc(r.instagram.error)}`);
      if (r.shopify) parts.push(r.shopify.ok ? `✅ Shopify: ${esc(r.shopify.name)} (${esc(r.shopify.currency)})` : `❌ Shopify: ${esc(r.shopify.error)}`);
      rEl.innerHTML = `<div class="notice">${parts.join("<br>")}</div>`;
    } catch (err) { rEl.innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
    btn.disabled = false; btn.textContent = "Probar conexión";
  });

  $("#saveBrand").addEventListener("click", async (e) => {
    const btn = e.currentTarget; const data = readBrandForm();
    if (!data.name) { toast("Ponle un nombre a la marca", true); return; }
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Guardando…`;
    try {
      if (isNew) {
        const { brand: created } = await api("/api/brands", { method: "POST", body: data });
        toast("Marca creada ✓");
        await refreshBrands(); state.brandId = created.id; state.tab = "conexiones"; renderApp();
      } else {
        await api(`/api/brands/${brand.id}`, { method: "PUT", body: data });
        toast("Cambios guardados ✓");
        await refreshBrands(); renderMain();
      }
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = isNew ? "Crear marca" : "Guardar cambios"; }
  });

  const del = $("#deleteBrand");
  if (del) del.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la marca "${brand.name}"? Esto no borra los posts ya publicados.`)) return;
    await api(`/api/brands/${brand.id}`, { method: "DELETE" });
    toast("Marca eliminada");
    state.brandId = null; await refreshBrands();
    state.brandId = state.brands[0]?.id || null; renderApp();
  });
}

async function refreshBrands() {
  const { brands } = await api("/api/brands");
  state.brands = brands;
}

// ── Arranque ──────────────────────────────────────────────────────────────
boot();
