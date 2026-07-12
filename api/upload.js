// api/upload.js — autoriza la subida directa del navegador a Vercel Blob
// (así los videos grandes no pasan por el límite de la función).
import { handleUpload } from "@vercel/blob/client";

export default async function handler(req, res) {
  try {
    const json = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let password;
        try { password = JSON.parse(clientPayload || "{}").password; } catch (_) {}
        if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
          throw new Error("No autorizado");
        }
        return {
          maximumSizeInBytes: 200 * 1024 * 1024, // 200 MB (videos)
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
}
