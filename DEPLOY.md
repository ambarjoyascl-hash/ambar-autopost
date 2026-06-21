# Despliegue en Vercel — paso a paso

Guía para poner Ámbar Autopost en producción. Sigue los pasos en orden. La parte
de Meta/Firebase (credenciales) se hace **una sola vez**.

> Resumen del flujo una vez desplegado: tú dejas posts en la colección
> `scheduledPosts` de Firestore → el cron de Vercel publica solo cada 5 minutos.

---

## Antes de empezar — qué necesitas a mano

- [ ] Cuenta de **Vercel** (gratis) conectada a tu GitHub.
- [ ] Proyecto de **Firebase** con **Firestore** activado.
- [ ] App de **Meta** creada y credenciales obtenidas → `scripts/GET_CREDENTIALS.md`.
- [ ] El doc `meta/credentials` ya guardado en Firestore (con `igUserId`, `pageId`,
      `pageAccessToken`, `longLivedUserToken`, `tokenUpdatedAt`).

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
| `META_APP_ID` | App de Meta → Settings → Basic |
| `META_APP_SECRET` | App de Meta → Settings → Basic |
| `GRAPH_VERSION` | `v21.0` (o la versión que uses) |
| `FIREBASE_PROJECT_ID` | JSON del service account |
| `FIREBASE_CLIENT_EMAIL` | JSON del service account |
| `FIREBASE_PRIVATE_KEY` | JSON del service account (ver nota abajo) |
| `CRON_SECRET` | El que generaste en el Paso 2 |

> **Nota sobre `FIREBASE_PRIVATE_KEY`:** pega la clave completa, incluyendo
> `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`. Si el campo de
> Vercel convierte los saltos de línea en `\n` literales, no hay problema: el
> código (`lib/firebase-admin.js`) ya los normaliza.

Si vas a usar la sincronización con Shopify, agrega también:
`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_VERSION`.

---

## Paso 5 — Desplegar

- Dashboard: pulsa **Deploy**.
- CLI: `vercel deploy --prod`.

Los crons de `vercel.json` se registran automáticamente al desplegar:
- `/api/cron/publish` → cada 5 minutos.
- `/api/cron/refresh-token` → lunes 06:00 UTC.

Puedes verlos en *Project → Settings → Cron Jobs*.

> Los **Cron Jobs** requieren un plan que los soporte (el plan Hobby permite
> crons con una frecuencia limitada). Si tu cron de 5 min no se activa, revisa el
> plan o súbelo a cada 15 min en `vercel.json`.

---

## Paso 6 — Índice de Firestore

La primera vez que corra `/api/cron/publish`, Firestore necesitará un **índice
compuesto** para esta consulta:

- `status` (==), `scheduledFor` (<=), orderBy `scheduledFor`.

En los logs de Vercel (o de Firestore) aparecerá un error con un **link directo**
para crear el índice con un clic. Hazlo una vez y listo.

---

## Paso 7 — Prueba de humo

1. Crea un doc en `scheduledPosts` con:
   ```jsonc
   {
     "platform": "instagram",
     "type": "image",
     "imageUrl": "https://.../foto-1080x1350.jpg",  // JPEG público, 4:5 o 1:1
     "caption": "Prueba de publicación automática ✨",
     "scheduledFor": 0,            // 0 = ya; se publica en el próximo cron
     "status": "pending",
     "createdAt": 1718800000000
   }
   ```
2. Espera al próximo ciclo del cron (≤5 min) **o** dispáralo a mano:
   ```bash
   curl -H "Authorization: Bearer TU_CRON_SECRET" \
     https://TU-APP.vercel.app/api/cron/publish
   ```
3. Debería responder con `igMediaId` y el doc pasar a `status: "published"`.
   Si algo falla, el doc tendrá `status: "error"` y el campo `error` con el motivo.

---

## Checklist final

- [ ] `meta/credentials` en Firestore con los 5 campos.
- [ ] Service account de Firebase generado.
- [ ] `CRON_SECRET` generado y guardado.
- [ ] 7 variables de entorno en Vercel (Production).
- [ ] Deploy hecho.
- [ ] Índice de Firestore creado.
- [ ] Prueba de humo publicó correctamente.

Cuando todos estén ✅, la app publica sola. 🎉
