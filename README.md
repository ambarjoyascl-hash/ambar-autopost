# Ámbar Autopost — Publicación automática a Instagram + Facebook (Meta Graph API)

Sistema serverless que publica posts automáticamente en el Instagram y la Página de
Facebook de Ámbar Joyas, tomando contenido desde una cola en Firebase (que puedes
llenar a mano, con captions generados por IA, o automáticamente desde tu catálogo
de Shopify).

Stack: **Vercel** (serverless functions + Cron) + **Firebase Firestore** (cola y
tokens) + **Meta Graph API**.

---

## 0. Por qué esto te conviene (la letra chica buena)

Las cuentas de Instagram y Facebook de Ámbar son **tuyas**. Eso significa que NO
necesitas pasar por el App Review de Meta (esas 2–4 semanas de revisión con
screencast). El App Review con *Advanced Access* solo se exige cuando publicas en
nombre de cuentas de terceros.

Para tu caso:
- Creas una app en modo **Desarrollo**.
- Te agregas a ti misma como **admin/tester** de la app.
- Usas el permiso `instagram_business_content_publish` directamente.

Listo. Sin revisión.

---

## 1. Requisitos previos (una sola vez)

1. **Cuenta de Instagram Profesional** (Business o Creator) — la de Ámbar.
2. Esa cuenta de IG **conectada a una Página de Facebook**.
3. Una **app de Meta** en https://developers.facebook.com/apps (tipo "Business").
4. Productos agregados a la app: **Instagram** y **Facebook Login for Business**.
5. Tu usuario de Facebook con rol **Admin** sobre la app, la Página y la cuenta IG
   (en Meta Business Suite / Business Settings).

### Permisos (scopes) que pedirás en el login
- `instagram_business_basic`
- `instagram_business_content_publish`  ← el que publica
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`  ← solo si también vas a postear en la Página de FB
- `business_management`

> Nota: `instagram_content_publish` (sin "business") quedó deprecado el 27-ene-2025.
> Usa el nombre nuevo `instagram_business_content_publish`.

---

## 2. Obtener credenciales (una sola vez)

Necesitas 3 cosas que guardarás en Firestore: `ig_user_id`, `page_id` y un
**token de larga duración**. Pasos en `scripts/GET_CREDENTIALS.md`.

Resumen:
1. En el **Graph API Explorer**, genera un *User Access Token* con los scopes de arriba.
2. Intercámbialo por un **long-lived user token** (60 días):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={APP_ID}
       &client_secret={APP_SECRET}
       &fb_exchange_token={SHORT_TOKEN}
   ```
3. Obtén tu Página y su **Page Access Token** (este, derivado de un long-lived user
   token, NO expira):
   ```
   GET https://graph.facebook.com/v21.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}
   ```
4. Obtén el **IG User ID** ligado a esa página:
   ```
   GET https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account&access_token={PAGE_TOKEN}
   ```
5. Guarda en Firestore el doc `meta/credentials` con:
   `igUserId`, `pageId`, `pageAccessToken`, `longLivedUserToken`, `tokenUpdatedAt`.

---

## 3. Modelo de datos (Firestore)

Colección **`scheduledPosts`** — cada documento es un post:

```jsonc
{
  "platform": "instagram",        // "instagram" | "facebook" | "both"
  "type": "image",                // "image" | "carousel"
  "imageUrl": "https://.../foto-1080x1350.jpg",  // JPEG público, ver §5
  "imageUrls": ["...", "..."],    // solo si type === "carousel" (2–10)
  "caption": "Anillo Luna en plata 925 ✨ ...\n\n#joyas #plata925 #ambarjoyas",
  "altText": "Anillo de plata con piedra luna",  // opcional, accesibilidad
  "scheduledFor": 1718900000000,  // epoch ms; se publica cuando now >= esto
  "status": "pending",            // pending | publishing | published | error
  "igMediaId": null,              // se llena al publicar
  "fbPostId": null,
  "error": null,
  "createdAt": 1718800000000
}
```

Doc **`meta/credentials`** — credenciales (ver §2).

---

## 4. Despliegue en Vercel

1. `npm install firebase-admin`
2. Variables de entorno (ver `.env.example`):
   - `META_APP_ID`, `META_APP_SECRET`
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   - `CRON_SECRET` (string aleatorio para proteger los endpoints de cron)
   - `GRAPH_VERSION` (ej. `v21.0`)
3. `vercel.json` ya define dos crons:
   - `/api/cron/publish` cada 5 min → publica los posts que tocan.
   - `/api/cron/refresh-token` semanal → refresca el token de larga duración.
4. `vercel deploy --prod`

> Firestore te pedirá crear un **índice compuesto** la primera vez
> (`status` ==, `scheduledFor` <=, orderBy `scheduledFor`). La consola te da el link
> con un clic.

---

## 5. Reglas de formato de Instagram (importantes)

La API rechaza el contenedor si no cumples esto:
- **Imágenes: solo JPEG.** Nada de PNG/WebP/GIF.
- **Aspect ratio** entre 4:5 (vertical) y 1.91:1 (horizontal). 1:1 sirve.
- Tamaño máx **8 MB**, ancho máx **1440 px** (recomendado 1080×1350 para feed vertical).
- La imagen debe estar en una **URL pública** (Meta la descarga con cURL).
- Carrusel: 2–10 ítems; todas se recortan al aspect ratio de la primera.

Para tus imágenes de Shopify: agrega `&width=1080` a la URL del CDN y asegúrate de
que el asset sea JPEG. Lo más seguro es subir la pieza final (la de Canva) a
**Firebase Storage** como `.jpg` y usar esa URL.

---

## 6. Límites de publicación

- **25 a 100 posts por 24 h** por cuenta (según el modo de API; carrusel cuenta como 1).
- El sistema consulta `content_publishing_limit` antes de publicar para no chocar.

---

## 7. Cómo llenar la cola

Tres formas, no excluyentes:
- **A mano / desde un panel**: escribes el doc en `scheduledPosts`.
- **Con IA**: generas el caption (Claude API) y lo guardas en la cola.
- **Desde Shopify**: `lib/shopify-to-queue.js` toma productos y arma posts
  automáticamente (imagen del producto + caption con título, precio y link).

---

## 8. Costo

$0 de Meta (la API es gratis). Solo pagas tu hosting (Vercel + Firebase, que ya usas).

---
## 9. App de Oro para vender EN VIVO 🥇🔴

Una app aparte de tu catálogo de Shopify, hecha para tus **lives de oro**: subes
fotos y videos de cada pieza al momento, aparecen al instante para quienes miran,
y ellos tocan **Comprar** y pagan por tu Shopify (tu Mercado Pago). Se despliega
en Vercel junto a este proyecto.

- **`public/index.html`** — el live (link para tu bio/stories de Instagram).
  Muestra en tiempo real las piezas que subes, con foto o video, y botón Comprar.
- **`public/admin.html`** — tu panel (`/admin.html`): subes **foto o video** +
  precio + nombre; marcas **Vendida**; borras. Solo entras tú.
- **`api/checkout.js`** — genera el link de pago de cada pieza con un *draft order*
  de Shopify (así cobras por tu tienda aunque la pieza no esté en el catálogo).
- **`public/firebase-config.js`** — el único archivo que editas.

### Cómo se usa en el live
1. Abres `/admin.html` desde el celular, subes la pieza (foto/video) y su precio.
2. Aparece al instante en el link del live.
3. El cliente toca **Comprar** → va al checkout de tu Shopify y paga (Mercado Pago).
   Tú ves el pedido en Shopify. Marca la pieza **Vendida** para que no la compren dos veces.

### Puesta en marcha (una sola vez)
1. **Firebase** (usa el MISMO proyecto de tu autopost):
   - Activa **Authentication → Correo/contraseña**, **Firestore** y **Storage**.
   - Pega tu `firebaseConfig` (⚙️ → Tus apps → Web) y tu correo admin en
     `public/firebase-config.js`.
   - Pega `firestore.rules` y `storage.rules` (reemplaza el correo admin).
   - Crea tu cuenta admin en Authentication (o reutiliza la que ya tengas).
2. **Shopify** (para cobrar): en Vercel agrega
   - `SHOPIFY_ADMIN_TOKEN` = token de Admin API con `write_draft_orders`
     (Shopify → Configuración → Apps y canales → Desarrollar apps → crear app).
   - `SHOPIFY_STORE_DOMAIN` = `ambar-8632.myshopify.com`.
3. Desplegar.

### Notas
- El precio se valida en el servidor leyendo la pieza desde Firestore; nadie puede
  cambiar el monto desde el navegador.
- Videos: clips cortos (20–30 s) cargan más rápido durante el live.
- Esta app NO usa tu catálogo de Shopify; solo lo usa para **cobrar**.
