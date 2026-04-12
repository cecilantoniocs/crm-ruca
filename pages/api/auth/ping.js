// /pages/api/auth/ping.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requireAuth } from '@/server/guard';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = getReqUser(req);
  try {
    requireAuth(user);
    const now = new Date().toISOString();

    // Actualiza last_seen_at para el usuario actual
    const { error } = await supabaseServer
      .from('users_app')
      .update({ last_seen_at: now })
      .eq('id', user.id);

    if (error) {
      console.error('/api/auth/ping DB_ERROR', error);
      return res.status(500).json({ error: 'DB_ERROR' });
    }

    return res.json({ ok: true, now });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'SERVER_ERROR' });
  }
}
