// /pages/api/upload.js
import multer from 'multer';
import path from 'path';
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

// Guardar en memoria (no en disco) para subir directo a Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype || '');
    cb(ok ? null : new Error('Solo se permiten imágenes'), ok);
  },
});

// Next necesita desactivar el bodyParser para multipart
export const config = { api: { bodyParser: false } };

function safeName(filename = 'file') {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const clean = base.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 64);
  const ts = Date.now();
  return `${ts}_${clean}${ext || ''}`;
}

export default async function handler(req, res) {
  const user = getReqUser(req);
  try {
    requirePerm(user, 'products.update'); // o 'products.create'

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    await new Promise((resolve) => {
      upload.single('file')(req, {}, resolve);
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No se adjuntó archivo' });
    }

    const bucket = 'product-images'; // Asegúrate de crearlo en Supabase
    // ?folder=products o products/<productId>
    const folder = (req.query.folder || 'products').toString().replace(/^\/+|\/+$/g, '');
    const filename = safeName(req.file.originalname);
    const objectPath = `${folder}/${filename}`;

    const { error: upErr } = await supabaseServer.storage
      .from(bucket)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (upErr) throw upErr;

    // === URL pública si el bucket es público ===
    const { data } = supabaseServer.storage.from(bucket).getPublicUrl(objectPath);
    let publicUrl = data?.publicUrl || null;

    // === (OPCIONAL) URL firmada si pasas ?signed=1&expires=3600 y el bucket es privado ===
    if (!publicUrl && String(req.query.signed || '') === '1') {
      const expires = Math.max(60, parseInt(String(req.query.expires || '3600'), 10) || 3600);
      const signed = await supabaseServer.storage.from(bucket).createSignedUrl(objectPath, expires);
      if (signed.error) throw signed.error;
      publicUrl = signed.data?.signedUrl ?? null;
    }

    return res.status(200).json({
      success: true,
      bucket,
      path: objectPath,
      publicUrl, // <-- úsala como imageUrl en tus productos
    });
  } catch (e) {
    const status = e.status || 500;
    const msg = e.msg || e.message || 'Error';
    console.error('API /upload', e);
    return res.status(status).json({ error: msg });
  }
}
