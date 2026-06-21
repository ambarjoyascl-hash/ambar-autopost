# Obtener credenciales de Meta (una sola vez)

Objetivo: dejar en Firestore el documento `meta/credentials` con:
`igUserId`, `pageId`, `pageAccessToken`, `longLivedUserToken`, `tokenUpdatedAt`.

---

## Paso 1 — Crear la app
1. https://developers.facebook.com/apps → **Crear app** → tipo **Business**.
2. Agrega los productos **Instagram** y **Facebook Login for Business**.
3. En *App settings → Basic* copia **App ID** y **App Secret** → van a Vercel
   (`META_APP_ID`, `META_APP_SECRET`).

## Paso 2 — Conectar cuentas
1. En Meta Business Suite, confirma que la cuenta de **Instagram de Ámbar** es
   Profesional y está **vinculada a la Página de Facebook** de Ámbar.
2. Tu usuario debe ser **Admin** de la app, la Página y la cuenta IG.

## Paso 3 — Token corto (Graph API Explorer)
1. https://developers.facebook.com/tools/explorer
2. Selecciona tu app y dale **Generate Access Token** con estos permisos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `business_management`
3. Copia el token (dura ~1–2 h).

## Paso 4 — Token largo (60 días)
```
GET https://graph.facebook.com/v21.0/oauth/access_token
    ?grant_type=fb_exchange_token
    &client_id=APP_ID
    &client_secret=APP_SECRET
    &fb_exchange_token=TOKEN_CORTO
```
Respuesta → `access_token` = **longLivedUserToken**.

## Paso 5 — Página + Page Token (no expira)
```
GET https://graph.facebook.com/v21.0/me/accounts?access_token=LONG_LIVED_USER_TOKEN
```
De la página de Ámbar copia `id` (**pageId**) y `access_token` (**pageAccessToken**).

## Paso 6 — IG User ID
```
GET https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN
```
Copia `instagram_business_account.id` → **igUserId**.

## Paso 7 — Guardar en Firestore
Crea el documento `meta/credentials`:
```jsonc
{
  "igUserId": "1784xxxxxxxxxx",
  "pageId": "1029xxxxxxxxxx",
  "pageAccessToken": "EAAG...",
  "longLivedUserToken": "EAAG...",
  "tokenUpdatedAt": 1718900000000
}
```

## Prueba rápida
Crea un doc en `scheduledPosts` con `scheduledFor` = ahora y una `imageUrl` JPEG
pública (4:5 o 1:1). Llama manualmente al endpoint:
```
curl -H "Authorization: Bearer TU_CRON_SECRET" https://TU-APP.vercel.app/api/cron/publish
```
Debería publicar y devolver el `igMediaId`.
