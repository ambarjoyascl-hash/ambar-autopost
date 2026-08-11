# LanzAi — landing page

Página estática autocontenida (`index.html`) para el taller presencial LanzAi.
Sin build, sin dependencias más allá de Google Fonts. Todo lo editable está en el
objeto `CONFIG` al final de `index.html`:

- `linkCompra` — link directo al carro de Ámbar Joyas (cupos pagados).
- `whatsapp` — número de WhatsApp para becas, botón flotante y aviso de "próxima fecha".
- `agotado` — poner en `true` cuando se llenen los cupos.

## Publicar en Vercel como proyecto dedicado

La idea es que esta carpeta sea su **propio** proyecto de Vercel, separado de la
app del repo, para poder apuntarle el dominio `www.lanzai.cl` a la raíz.

1. En **vercel.com** → *Add New… → Project* → importar el repo `ambar-autopost`.
2. En la configuración del import, poner **Root Directory = `lanzai`**.
3. Deploy. Queda sirviendo `index.html` en la raíz del dominio de Vercel.

## Conectar el dominio www.lanzai.cl

1. En el proyecto de Vercel → *Settings → Domains* → agregar `www.lanzai.cl`
   (y `lanzai.cl` si se quiere que redirija al `www`).
2. Vercel muestra los registros DNS exactos. Normalmente:

   | Tipo  | Nombre    | Valor                   |
   |-------|-----------|-------------------------|
   | CNAME | `www`     | `cname.vercel-dns.com`  |
   | A     | `@` (raíz)| `216.198.79.1`          |

3. En **NIC Chile** → administrar `lanzai.cl` → editor de DNS → pegar esos registros.
4. Esperar la propagación (de minutos a unas horas). Vercel emite el certificado
   HTTPS automáticamente cuando el DNS ya apunta bien.
