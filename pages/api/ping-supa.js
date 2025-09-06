// pages/api/ping-supa.js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!url || !serviceKey) {
      return res.status(500).json({
        ok: false,
        reason: 'Missing env vars',
        have: {
          NEXT_PUBLIC_SUPABASE_URL: !!url,
          SUPABASE_SERVICE_ROLE: !!serviceKey,
        },
      });
    }

    // Ping al REST root (no requiere tablas)
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });

    return res.status(200).json({
      ok: r.ok,
      rest_status: r.status,
      message:
        'Conexión OK si rest_status es 200. Ya puedes crear tablas en public y consultarlas.',
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
