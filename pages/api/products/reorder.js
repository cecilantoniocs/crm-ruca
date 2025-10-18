// /pages/api/products/reorder.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

export default async function handler(req, res) {
  const user = getReqUser(req);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    requirePerm(user, 'products.update');

    const payload = Array.isArray(req.body) ? req.body : [];
    if (!payload.length) {
      return res.status(400).json({ error: 'Body inválido: se espera array [{id, sort_order}]' });
    }

    // Validación mínima
    for (const row of payload) {
      if (!row?.id || typeof row.sort_order !== 'number') {
        return res.status(400).json({ error: 'Cada item debe tener { id, sort_order:number }' });
      }
    }

    // Actualización simple en paralelo
    const updates = payload.map(({ id, sort_order }) =>
      supabaseServer.from('products').update({ sort_order }).eq('id', id)
    );

    const results = await Promise.all(updates);
    const dbErr = results.find((r) => r.error)?.error;
    if (dbErr) {
      console.error('reorder DB error:', dbErr);
      return res.status(500).json({ error: 'DB_ERROR', detail: dbErr.message || dbErr });
    }

    return res.status(200).json({ ok: true, count: payload.length });
  } catch (e) {
    console.error('API /products/reorder CATCH', e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error' });
  }
}
