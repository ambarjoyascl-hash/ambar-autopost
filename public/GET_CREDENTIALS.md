# Obtener las credenciales de Instagram (Meta) para tu marca

Objetivo: conseguir los 4 datos que pide la pestaña **Conexiones** del panel:

- **IG User ID**
- **Page ID**
- **Page Access Token**
- **Long-lived User Token** (opcional, sirve para el refresco automático)

Son credenciales de tu propia cuenta: **no requieren revisión de Meta**.

---

## Requisitos previos (una sola vez)

1. La cuenta de **Instagram de tu marca** debe ser **Profesional** (Business o
   Creator) y estar **vinculada a una Página de Facebook** de la marca
   (se configura en Meta Business Suite).
2. Necesitas una **app de Meta**: https://developers.facebook.com/apps →
   **Crear app** → tipo **Business**. Agrega los productos **Instagram** y
   **Facebook Login for Business**.
3. Tu usuario debe ser **Admin** de la app, de la Página y de la cuenta de IG.

## Paso 1 — Token corto (Graph API Explorer)

1. Abre https://developers.facebook.com/tools/explorer
2. Arriba a la derecha, en **Meta App**, selecciona tu app.
3. En **User or Page**, deja **User Token**.
4. En **Permissions**, agrega estos permisos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `business_management`
5. Click **Generate Access Token** → inicia sesión con la cuenta que administra
   la marca y acepta.
6. Copia el token que aparece (dura ~1–2 horas; con eso basta).

## Paso 2 — Token largo (60 días)

En el navegador (o con curl), reemplaza APP_ID, APP_SECRET y TOKEN_CORTO:

```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=TOKEN_CORTO
```

El `access_token` de la respuesta es tu **Long-lived User Token**.
(APP_ID y APP_SECRET están en tu app de Meta → Settings → Basic.)

## Paso 3 — Página + Page Token (no expira)

```
https://graph.facebook.com/v21.0/me/accounts?access_token=LONG_LIVED_USER_TOKEN
```

Busca la Página de tu marca en la respuesta y copia:
- `id` → **Page ID**
- `access_token` → **Page Access Token**

## Paso 4 — IG User ID

```
https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN
```

Copia `instagram_business_account.id` → **IG User ID**.

## Paso 5 — Pegar en el panel

Vuelve al panel → tu marca → pestaña **Conexiones** → pega los 4 valores y
pulsa **Probar conexión**. Si sale ✅ con el nombre de tu cuenta, guarda los
cambios y listo: la app ya puede publicar en ese Instagram.
