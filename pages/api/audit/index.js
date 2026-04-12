// /pages/api/audit/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser } from '@/server/guard';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  if (!user.isAdmin && !user.is_admin) return res.status(403).json({ error: 'Solo administradores' });

  try {
    const { from, to, userId, limit = '300' } = req.query;

    let q = supabaseServer
      .from('audit_logs')
      .select('id, user_id, user_name, action, entity, entity_id, description, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 300, 500));

    if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
    if (to)   q = q.lte('created_at', `${to}T23:59:59.999Z`);
    if (userId && userId !== 'all') q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error) throw error;

    return res.json(data || []);
  } catch (e) {
    console.error('GET /api/audit', e);
    return res.status(500).json({ error: e.message || 'Error' });
  }
}
