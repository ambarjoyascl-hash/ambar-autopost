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
## 9. Tienda de oro con registro y pago (Mercado Pago) 🛒

La tienda es una web que se despliega junto con este proyecto en Vercel. Tiene:

- **`public/index.html`** — la tienda pública (el link para tu bio de Instagram).
  Catálogo en vivo, registro/login de clientes y pago con Mercado Pago.
- **`public/admin.html`** — tu panel privado (`tudominio.vercel.app/admin.html`)
  para subir fotos y precios al instante y ver los pedidos.
- **`public/firebase-config.js`** — el ÚNICO archivo que editas para conectar todo.
- **`api/create-preference.js`** y **`api/mp-webhook.js`** — el pago con Mercado Pago.

Cuando subes o cambias un producto en el panel, aparece **al instante** en todos
los teléfonos (Firestore en tiempo real).

### 9.1 ⚠️ Importante sobre Mercado Pago

Mercado Pago **no opera en Panamá**. Funciona en Chile, Argentina, Brasil, México,
Colombia, Perú y Uruguay. Como tus clientes son chilenos, usa una cuenta de
**Mercado Pago Chile** (los pagos serán en **pesos chilenos, CLP**). Si no puedes
tener cuenta MP de Chile, deja la tienda funcionando con el botón **"Coordinar por
WhatsApp"** (que ya está incluido) hasta resolver la cuenta.

### 9.2 Puesta en marcha (una sola vez)

1. **Firebase** (usa el mismo proyecto del autopost o crea uno):
   - **Authentication** → activa el proveedor **Correo/contraseña**.
   - **Firestore Database** → créala (modo producción).
   - **Storage** → actívalo (para las fotos).
   - ⚙️ **Configuración del proyecto → Tus apps → app Web** → copia el objeto
     `firebaseConfig` y pégalo en `public/firebase-config.js`.
2. En `public/firebase-config.js` completa también `APP_CONFIG`:
   `adminEmail` (tu correo de administradora), `whatsapp`, `instagram`.
3. **Crea tu cuenta de admin**: entra a la tienda, toca **👤 Ingresar → Crear
   cuenta** usando ese mismo correo (o créala en Firebase → Authentication).
4. **Reglas de seguridad** (reemplaza `TU_CORREO_ADMIN@gmail.com` por tu correo):
   - Pega `firestore.rules` en Firebase → Firestore → **Reglas**.
   - Pega `storage.rules` en Firebase → Storage → **Reglas**.
5. **Mercado Pago** → en Vercel agrega la variable de entorno:
   - `MP_ACCESS_TOKEN` = tu *Access Token* (Mercado Pago → Tus integraciones →
     tu app → Credenciales). Usa las de **prueba** para testear y las de
     **producción** para cobrar de verdad.
   - `MP_CURRENCY` = `CLP` (opcional).
6. `vercel deploy --prod`.

### 9.3 Cómo se usa

- **Tú (admin):** entra a `tudominio.vercel.app/admin.html`, inicia sesión y en
  **🛍️ Productos** agregas nombre, precio (CLP), fotos, quilates, etc. En
  **📦 Pedidos** ves cada compra con su estado (Pagado / Pendiente / Rechazado).
  - Precio `0` = pieza **"a cotizar"** (el cliente consulta por WhatsApp).
  - "Disponible" desactivado = se muestra **Agotado**. "Visible" desactivado = se
    oculta de la tienda.
- **Tus clientes:** entran al link, se registran, agregan al carrito y tocan
  **💳 Pagar con Mercado Pago**. Al aprobarse el pago, el pedido queda **Pagado**
  en tu panel y coordinas el envío por WhatsApp.

### 9.4 Notas

- Las claves de `firebaseConfig` (web) son **públicas por diseño**; lo que protege
  tus datos son las **reglas de seguridad**. El `MP_ACCESS_TOKEN` es secreto y vive
  solo en Vercel (nunca en el navegador).
- Los precios se recalculan en el servidor desde Firestore antes de cobrar, así
  nadie puede alterar el monto desde el navegador.
- El panel y el pago necesitan estar **desplegados** (o un servidor local); no
  funcionan abriendo el archivo con doble clic (`file://`).
