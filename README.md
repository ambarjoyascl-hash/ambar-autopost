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

## 9. Tienda para vender oro (el link que pegas en Instagram) 🛒

Archivo: **`public/index.html`**. Es la página web donde tus clientes de Chile
arman su pedido y te lo envían por WhatsApp. Ya se despliega sola con Vercel:
queda en la **raíz de tu dominio** (ej. `https://tu-proyecto.vercel.app/`). Ese es
el link que pones en tu bio de Instagram o en las stories.

### Cómo funciona (para el cliente)
1. Entra al link, ve tu catálogo de oro.
2. Agrega piezas al carrito **o** escribe un encargo "a medida" (lo que quiera).
3. Pone su nombre y ciudad de Chile y toca **"Enviar pedido por WhatsApp"**.
4. Se le abre WhatsApp con **todo el pedido escrito**, listo para enviártelo.

No necesita registrarse ni pagar en la web: tú coordinas precio final, pago y
envío por WhatsApp. Cero backend, cero comisiones.

### Lo que TIENES que personalizar (todo en `public/index.html`, arriba)
1. **Tu número de WhatsApp** — en `CONFIG.whatsapp`. Va en formato internacional,
   **solo números**, sin `+` ni espacios. Ejemplos:
   - Panamá `+507 6000-0000` → `"50760000000"`
   - Chile `+56 9 1234 5678` → `"56912345678"`
2. **Tu Instagram** — en `CONFIG.instagram`.
3. **Tus productos** — en la lista `PRODUCTS`. Cada uno tiene: nombre, descripción,
   quilates (`karat`), peso (`grams`), precio (`price`) y categoría (`cat`).
   - Para poner **fotos reales**: agrega `image:"https://…/tu-foto.jpg"` al producto
     (idealmente cuadrada). Si no pones foto, se muestra el `emoji`.

### Probarla local
Abre `public/index.html` en tu navegador (doble clic) — funciona tal cual.
En el celular se ve como app.

> Los precios de la web son **referenciales**; el total final del oro se confirma
> según peso y cotización del día, y así se lo aclara al cliente automáticamente.
