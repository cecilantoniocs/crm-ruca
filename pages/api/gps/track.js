// /pages/api/gps/track.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

// --- helpers TZ: convierte Y-M-D + HH:mm en UTC usando America/Santiago (sin deps) ---
const CL_TZ = 'America/Santiago';

function parseHM(hm = '00:00') {
  const [h = '00', m = '00'] = String(hm).split(':');
  return { h: Math.max(0, +h || 0), m: Math.max(0, +m || 0) };
}

/**
 * Retorna un Date en UTC que representa la hora local (zona IANA) indicada.
 * Usa el locale 'sv' (sueco) que devuelve "YYYY-MM-DD HH:MM:SS" — independiente
 * del timezone del runtime, sin depender de cómo Node parsea cadenas locales.
 */
function zonedLocalToUTC(dateYMD, hhmm = '00:00', timeZone = CL_TZ) {
  const hm = String(hhmm).length === 5 ? hhmm : '00:00';
  // Tratar los números como UTC para obtener un Date base
  const raw = new Date(`${dateYMD}T${hm}:00.000Z`);
  // Formatear ese instante UTC en la zona objetivo → da la hora "local" de esa zona
  // 'sv' siempre produce "YYYY-MM-DD HH:MM:SS" sin importar el timezone del servidor
  const tzStr = raw.toLocaleString('sv', { timeZone }); // ej: "2025-04-10 20:00:00"
  // Re-parsear como UTC para obtener la diferencia de offset
  const tzAsUtc = new Date(tzStr.replace(' ', 'T') + '.000Z');
  // offset = cuánto movió la zona (negativo cuando zona va atrás de UTC)
  const offsetMs = tzAsUtc.getTime() - raw.getTime();
  // Restar el offset para obtener el UTC real del instante local deseado
  return new Date(raw.getTime() - offsetMs);
}

/**
 * Rango en ISO UTC para consultar en Supabase sin desfases.
 * end incluye los 59s y 999ms para cubrir el minuto completo.
 */
function buildDateRange(dateYMD, fromHHmm = '00:00', toHHmm = '23:59', timeZone = CL_TZ) {
  const startUTC = zonedLocalToUTC(dateYMD, fromHHmm, timeZone);
  const endUTC   = zonedLocalToUTC(dateYMD, toHHmm,   timeZone);
  endUTC.setSeconds(endUTC.getSeconds() + 59, 999);
  return { startISO: startUTC.toISOString(), endISO: endUTC.toISOString() };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  try {
    // Permiso específico de Tracking
    requirePerm(user, 'tracking.view');

    const { courierId, date, from = '00:00', to = '23:59' } = req.query || {};
    if (!date) return res.status(400).json({ error: 'date requerido (YYYY-MM-DD)' });

    // 🔧 ahora el rango es ISO UTC (sin deps, maneja DST de Chile)
    const { startISO, endISO } = buildDateRange(String(date), String(from), String(to));

    let q = supabaseServer
      .from('courier_locations')
      .select('id,courier_id,lat,lng,accuracy,created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true })
      .limit(5000);

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
        createdAt: r.created_at, // viene en ISO UTC; el front lo muestra en local con toLocaleString()
      };
    });

    return res.json(out);
  } catch (e) {
    console.error('GET /api/gps/track', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
