// /pages/api/version.js
// Devuelve la versión del deploy actual.
// Vercel inyecta VERCEL_GIT_COMMIT_SHA en cada deploy → cambia con cada push.
// En desarrollo local devuelve 'dev'.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ v: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' });
}
