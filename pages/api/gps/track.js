// /pages/api/gps/track.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

function buildDateRange(dateYMD, fromHHmm = '00:00', toHHmm = '23:59') {
  // Asume TZ del server; en Supabase conviene comparar por texto YYYY-MM-DD HH:MM
  const start = `${dateYMD} ${fromHHmm}:00`;
  const end   = `${dateYMD} ${toHHmm}:59`;
  return { start, end };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  try {
    // Permiso específico de Tracking
    requirePerm(user, 'tracking.view'); // Admin debería pasar por requirePerm

    const { courierId, date, from = '00:00', to = '23:59' } = req.query || {};
    if (!date) return res.status(400).json({ error: 'date requerido (YYYY-MM-DD)' });

    const { start, end } = buildDateRange(String(date), String(from), String(to));

    let q = supabaseServer
      .from('courier_locations')
      .select('id,courier_id,lat,lng,accuracy,created_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })
      .limit(5000);

    // Soportar "Todos"
    if (courierId && courierId !== 'all') {
      q = q.eq('courier_id', courierId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];

    // Adjunta nombre de repartidor (lookup a users_app)
    const ids = Array.from(new Set(rows.map(r => r.courier_id))).filter(Boolean);
    let usersMap = new Map();
    if (ids.length) {
      const { data: usersRows } = await supabaseServer
        .from('users_app')
        .select('id,name,email')
        .in('id', ids);
      if (Array.isArray(usersRows)) {
        usersMap = new Map(usersRows.map(u => [u.id, { name: u.name, email: u.email }]));
      }
    }

    const out = rows.map(r => {
      const meta = usersMap.get(r.courier_id) || {};
      return {
        id: r.id,
        courierId: r.courier_id,
        courierName: meta.name || meta.email || 'Repartidor',
        lat: r.lat,
        lng: r.lng,
        accuracy: r.accuracy,
        createdAt: r.created_at,
      };
    });

    return res.json(out);
  } catch (e) {
    console.error('GET /api/gps/track', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
