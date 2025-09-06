// /pages/api/upload.js
import fs from 'fs';
import path from 'path';
import multer from 'multer';

// Asegura carpeta public/uploads
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage con nombre único y extensión original
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'file', ext).replace(/\s+/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

// Limitar a imágenes
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype);
    cb(ok ? null : new Error('Solo se permiten imágenes'), ok);
  },
});

// Desactivar bodyParser para multer
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  return new Promise((resolve) => {
    upload.single('file')(req, {}, (err) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return resolve();
      }
      const filePath = `/uploads/${req.file.filename}`;
      res.status(200).json({ success: true, filePath });
      return resolve();
    });
  });
}
