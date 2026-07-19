# Despliegue en Vercel — paso a paso

Guía para poner Ámbar Autopost en producción. Sigue los pasos en orden. La parte
de Meta/Firebase (credenciales) se hace **una sola vez**.

> Resumen del flujo una vez desplegado: entras al panel → creas tus marcas →
> generas el plan de la semana con IA → lo apruebas → el cron de Vercel publica
> solo en Instagram cada 5 minutos y los emails quedan listos para Shopify Email.

---

## Antes de empezar — qué necesitas a mano

- [ ] Cuenta de **Vercel** (gratis) conectada a tu GitHub.
- [ ] Proyecto de **Firebase** con **Firestore** activado.
- [ ] App de **Meta** creada (para refrescar tokens). Las credenciales de IG de
      cada marca se obtienen con `scripts/GET_CREDENTIALS.md` y se pegan **en el
      panel**, no en variables de entorno.
- [ ] API key de **Anthropic** (Claude) para generar el contenido.
- [ ] Una **contraseña** para el panel (`APP_PASSWORD`).

---

## Paso 1 — Service Account de Firebase (para el backend)

1. Consola de Firebase → ⚙️ **Project settings** → pestaña **Service accounts**.
2. **Generate new private key** → descarga el JSON.
3. De ese JSON vas a usar tres valores como variables de entorno:
   - `project_id`   → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key`  → `FIREBASE_PRIVATE_KEY`  (la cadena larga que empieza con
     `-----BEGIN PRIVATE KEY-----`)

---

## Paso 2 — Generar el CRON_SECRET

Es una contraseña aleatoria que protege los endpoints de cron. Genera una:

```bash
openssl rand -hex 32
```

Guarda el resultado; lo usarás como `CRON_SECRET`.

> En Vercel, cuando defines la variable `CRON_SECRET`, el sistema añade
> automáticamente el header `Authorization: Bearer <CRON_SECRET>` a las llamadas
> de cron. Por eso los endpoints comprueban exactamente ese header.

---

## Paso 3 — Importar el proyecto en Vercel

**Opción A — desde el dashboard (recomendada):**
1. https://vercel.com/new
2. Importa el repo `ambar-autopost` de GitHub.
3. Framework Preset: **Other** (no necesita build). Root directory: `/`.
4. Antes de hacer *Deploy*, añade las variables de entorno (Paso 4).

**Opción B — desde la CLI:**
```bash
npm i -g vercel
vercel link            # vincula la carpeta a un proyecto de Vercel
# añade las variables (Paso 4) y luego:
vercel deploy --prod
```

---

## Paso 4 — Variables de entorno en Vercel

En *Project → Settings → Environment Variables*, agrega estas (entorno
**Production**). Toma los valores de `.env.example` como referencia:

| Variable | De dónde sale |
|---|---|
| `APP_PASSWORD` | La contraseña del panel (invéntala; `openssl rand -hex 16`). **Obligatoria.** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. **Obligatoria** para generar planes. |
| `CONTENT_MODEL` | `claude-sonnet-5` (opcional) |
| `DEFAULT_TIMEZONE` | `America/Santiago` (para agendar a la hora local) |
| `META_APP_ID` | App de Meta → Settings → Basic |
| `META_APP_SECRET` | App de Meta → Settings → Basic |
| `GRAPH_VERSION` | `v21.0` (o la versión que uses) |
| `FIREBASE_PROJECT_ID` | JSON del service account |
| `FIREBASE_CLIENT_EMAIL` | JSON del service account |
| `FIREBASE_PRIVATE_KEY` | JSON del service account (ver nota abajo) |
| `CRON_SECRET` | El que generaste en el Paso 2 |
| `SHOPIFY_API_VERSION` | `2024-04` (opcional; las credenciales de Shopify se guardan por marca desde el panel) |

> **Nota sobre `FIREBASE_PRIVATE_KEY`:** pega la clave completa, incluyendo
> `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`. Si el campo de
> Vercel convierte los saltos de línea en `\n` literales, no hay problema: el
> código (`lib/firebase-admin.js`) ya los normaliza.

> Las credenciales de **Instagram** y **Shopify** de cada marca NO son variables
> de entorno: se ingresan y guardan desde el panel (pestaña **Conexiones**).

---

## Paso 5 — Desplegar

- Dashboard: pulsa **Deploy**.
- CLI: `vercel deploy --prod`.

Los crons de `vercel.json` se registran automáticamente al desplegar:
- `/api/cron/publish` → **1 vez al día** (13:00 UTC ≈ 09:00 Chile).
- `/api/cron/refresh-token` → lunes 06:00 UTC.

Puedes verlos en *Project → Settings → Cron Jobs*.

### Publicar a la hora exacta (durante el día)

El plan **Hobby (gratis)** de Vercel solo permite crons **1 vez al día**. Por eso
el cron de publicación viene configurado a diario: agenda posts pero se publican
en esa pasada diaria (no exactamente a la hora que pusiste). Tienes 3 opciones:

1. **Gratis, con hora exacta (recomendado):** usa la GitHub Action incluida
   (`.github/workflows/publish.yml`), que llama al endpoint cada 5 minutos. En
   GitHub → *Settings → Secrets and variables → Actions* añade el secret
   `CRON_SECRET` (igual que en Vercel) y la variable `CRON_URL`
   (`https://TU-APP.vercel.app`). No toca tu factura.
2. **Dejarlo diario:** si te sirve publicar todo en una pasada al día, no hagas
   nada más.
3. **Vercel Pro:** sube el cron de `vercel.json` a `*/5 * * * *` y despliega.

---

## Paso 6 — Índice de Firestore

La primera vez que corra `/api/cron/publish`, Firestore necesitará un **índice
compuesto** para esta consulta:

- `status` (==), `scheduledFor` (<=), orderBy `scheduledFor`.

En los logs de Vercel (o de Firestore) aparecerá un error con un **link directo**
para crear el índice con un clic. Hazlo una vez y listo.

---

## Paso 7 — Prueba de humo (desde el panel)

1. Abre `https://TU-APP.vercel.app` y entra con tu `APP_PASSWORD`.
2. **Nueva marca** → ponle nombre, pega la URL de tu web y los tokens de
   Instagram (y Shopify si tienes). Pulsa **Probar conexión** para verificar.
3. Pestaña **Plan semanal** → **Ver productos detectados** (confirma que salen
   fotos) → **Generar plan** (tarda ~30s).
4. Revisa el borrador y pulsa **Aprobar y agendar**.
5. En **Cola de Instagram**, usa **Publicar ahora** en un post para probar la
   publicación real (o espera al cron). En **Emails**, ábrelos y copia el HTML
   para pegarlo en Shopify Email.

Si un post queda en `error`, el detalle aparece en la tarjeta (y en los logs de
Vercel).

---

## Checklist final

- [ ] Service account de Firebase generado.
- [ ] `APP_PASSWORD`, `ANTHROPIC_API_KEY` y `CRON_SECRET` definidos.
- [ ] Variables de entorno en Vercel (Production) — ver tabla del Paso 4.
- [ ] Deploy hecho.
- [ ] Índice(s) de Firestore creados (aparecen con link al usar el panel).
- [ ] Primera marca creada y conexión probada.
- [ ] Plan generado, aprobado y un post publicado de prueba.

Cuando todos estén ✅, la app publica sola. 🎉
