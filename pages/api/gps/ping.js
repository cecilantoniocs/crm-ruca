// /pages/api/gps/ping.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser } from '@/server/guard';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = getReqUser(req); // tu sesión propia (no supabase auth)
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  // Solo repartidores o users con flag can_deliver; admin también puede reportar (útil en pruebas)
  const role = String(user.role || '').toLowerCase();
  const canDeliver = !!user.can_deliver;
  const isAdmin = !!user.is_admin;
  if (!(role === 'repartidor' || canDeliver || isAdmin)) {
    return res.status(403).json({ error: 'Sin permiso para reportar ubicación' });
  }

  try {
    const { lat, lng, accuracy } = req.body || {};
    const latN = Number(lat), lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: 'lat/lng inválidos' });
    }
    if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return res.status(400).json({ error: 'lat/lng fuera de rango' });
    }
    const accN = accuracy != null ? Number(accuracy) : null;

    const { error } = await supabaseServer.from('courier_locations').insert({
      courier_id: user.id, lat: latN, lng: lngN, accuracy: accN
    });
    if (error) throw error;

    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('POST /api/gps/ping', e);
    return res.status(500).json({ error: 'Error guardando ubicación' });
  }
}
