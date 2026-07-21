# Autopost — Instagram + Shopify Email, coordinados y multi-marca

App para planificar y publicar contenido de varias marcas desde un solo panel:

1. **Creas una marca** (le pones nombre) y la conectas a su **Instagram**, su
   **Shopify** y su **página web**.
2. Pides **el plan de la semana**: la IA (Claude) saca las fotos y productos de tu
   web/Shopify y arma **7 días de posts de Instagram + emails coordinados**.
3. **Revisas** el plan y, con un botón, lo **agendas**: los posts se publican solos
   en Instagram a la hora indicada, y los emails quedan **listos para enviar desde
   Shopify Email**.
4. Repites para **cada una de tus marcas**, cada una con sus propias cuentas.

Stack: **Vercel** (panel web + funciones serverless + Cron) · **Firebase
Firestore** (marcas, cola y emails) · **Meta Graph API** (Instagram/Facebook) ·
**Claude** (contenido) · **Shopify Admin API** (productos).

> **Sobre los emails:** Shopify **no permite enviar** campañas de Shopify Email
> por API (es una limitación real de Shopify). Por eso la app **genera** el email
> (asunto + diseño HTML) y lo deja **listo**: lo abres, copias el HTML/texto y lo
> pegas en *Shopify → Marketing → Shopify Email* para enviarlo con un clic.

---

## Cómo se usa (una vez desplegado)

Entras al panel con tu contraseña (`APP_PASSWORD`) y:

| Pestaña | Qué haces |
|---|---|
| **Conexiones** | Nombre de la marca, URL de la web, tokens de Instagram, Shopify y la "voz" de marca para la IA. Botón **Probar conexión**. |
| **Plan semanal** | Eliges cuántos posts/emails y el día de inicio → **Generar plan**. Revisas el borrador (posts con foto + captions, y los emails) → **Aprobar y agendar**. |
| **Cola de Instagram** | Ves los posts agendados, su estado, y puedes **Publicar ahora** o eliminar. |
| **Emails** | Ves los emails generados, los abres, **copias el HTML/asunto** para pegar en Shopify Email, y los marcas como enviados. |

Cada marca es independiente: sus propias credenciales, su web, su cola.

---

## Arquitectura

```
public/            Panel web (SPA sin dependencias)
  index.html
  app.js
  styles.css
api/
  brands/          CRUD de marcas + prueba de conexión
  plans/           generar / listar / aprobar / descartar el plan semanal
  posts/           cola de Instagram (listar, editar, publicar ahora, borrar)
  emails/          emails generados (listar, ver HTML, marcar enviado, borrar)
  scrape.js        vista previa de productos detectados
  status.js        qué está configurado en el entorno
  cron/
    [task].js        una función para ambas tareas: /publish (cada 5 min,
                     publica los posts que tocan) y /refresh-token (semanal,
                     refresca los tokens de Meta de todas las marcas)
lib/
  brands.js        modelo de marcas
  meta.js          credenciales/tokens de Meta por marca
  instagram.js     publicación en Instagram (imagen y carrusel)
  facebook.js      publicación en la Página de Facebook (opcional)
  shopify.js       productos desde Shopify Admin API
  scrape.js        extractor de productos desde la web (Shopify JSON / JSON-LD / HTML)
  ai.js            generación del plan con Claude
  email-template.js  HTML del email a partir de las secciones + productos
  plan.js          orquesta: productos → IA → borrador → agendar
  publish.js       publica un post con las credenciales de su marca
  api-helpers.js   auth del panel, parseo de body, manejo de errores
```

### Datos en Firestore

- **`brands/{id}`** — cada marca: `name`, `websiteUrl`, `instagram{…}`,
  `shopify{…}`, `voice{…}`.
- **`plans/{id}`** — borradores y planes agendados (posts + emails resueltos).
- **`scheduledPosts/{id}`** — cola de publicación (con `brandId`).
- **`emails/{id}`** — emails generados (`status: ready | sent`).

---

## Requisitos por marca

Para **Instagram** (son cuentas **tuyas**, así que NO necesitas el App Review de
Meta; basta la app en modo Desarrollo con tu usuario como admin/tester):

- Cuenta de Instagram **Profesional** conectada a una **Página de Facebook**.
- `igUserId`, `pageId` y un **Page Access Token** (derivado de un user token de
  larga duración). Guía paso a paso: **`scripts/GET_CREDENTIALS.md`**.
- Scopes: `instagram_business_basic`, `instagram_business_content_publish`,
  `pages_show_list`, `pages_read_engagement`, `business_management`
  (y `pages_manage_posts` si además publicas en la Página de FB).

Para **Shopify** (opcional pero recomendado — los productos llegan más limpios):

- En Shopify → *Ajustes → Apps → Desarrollar apps* crea una app, dale permiso
  `read_products` y copia el **Admin API access token** (`shpat_…`).
- En el panel pones el **dominio** (`tu-tienda.myshopify.com`) y ese token.

Si no conectas Shopify, la app intenta sacar las fotos directamente de la **web**.

---

## Reglas de formato de Instagram (importantes)

La Graph API rechaza la imagen si no cumples:
- **Solo JPEG** (nada de PNG/WebP/GIF).
- **Aspect ratio** entre 4:5 y 1.91:1 (1:1 sirve).
- Máx **8 MB**, ancho máx **1440 px** (recomendado 1080×1350).
- La imagen debe estar en una **URL pública**.

Las imágenes de Shopify se normalizan a `?width=1080`. Si tu web sirve WebP,
lo más seguro es subir la pieza final como `.jpg`.

---

## Despliegue

Guía detallada con checklist: **`DEPLOY.md`**. Resumen:

1. Proyecto de **Firebase** con Firestore activado + service account.
2. App de **Meta** (para refrescar tokens).
3. API key de **Anthropic**.
4. Importa el repo en **Vercel** y define las variables de entorno (ver
   `.env.example`): `APP_PASSWORD`, `ANTHROPIC_API_KEY`, `META_APP_ID`,
   `META_APP_SECRET`, `FIREBASE_*`, `CRON_SECRET`, `DEFAULT_TIMEZONE`.
5. Deploy. Los crons se registran solos desde `vercel.json`.
6. La primera consulta a Firestore pedirá crear 1–2 **índices compuestos**
   (te da el link con un clic).

Costo: la API de Meta es gratis; pagas solo el uso de Claude y tu hosting
(Vercel + Firebase).
