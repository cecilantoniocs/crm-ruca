// /pages/api/gps/couriers.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const me = getReqUser(req);
  if (!me) return res.status(401).json({ error: 'No autenticado' });

  try {
    // Sólo quienes tengan permiso de Tracking
    requirePerm(me, 'tracking.view'); // Admin debería pasar aquí

    const { data, error } = await supabaseServer
      .from('users_app')
      .select('id, name, email, role, can_deliver')
      .or('role.eq.repartidor,can_deliver.eq.true')
      .order('name', { ascending: true });

    if (error) throw error;

    const rows = (data || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      canDeliver: !!u.can_deliver,
    }));

    return res.json(rows);
  } catch (e) {
    console.error('GET /api/gps/couriers', e);
    // Si requirePerm lanza, devolvemos 403 explícito
    return res.status(403).json({ error: 'Sin permiso' });
  }
}
