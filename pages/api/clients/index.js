// GET:    /api/clients[?sellerId=<uuid>&q=<texto>]
// POST:   /api/clients
import { supabaseServer } from '@/lib/supabaseServer';

const mapOut = (r) => ({
  id: r.id,
  name: r.name,
  nombre_local: r.local_name || null,
  dir1: r.dir1 || null,
  zona: r.zona || null,
  ciudad: r.ciudad || null,
  telefono: r.telefono || null,
  email: r.email || null,
  rut: r.rut || null,
  razon_social: r.razon_social || null,
  sellerId: r.owner_id || null,  // compat
  ownerId: r.owner_id || null,
  createdAt: r.created_at,
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { sellerId, q } = req.query;

      let qy = supabaseServer
        .from('clients')
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,created_at')
        .order('created_at', { ascending: false });

      if (sellerId) qy = qy.eq('owner_id', sellerId);
      if (q) {
        const like = `%${q}%`;
        qy = qy.or(
          `name.ilike.${like},local_name.ilike.${like},email.ilike.${like},dir1.ilike.${like},ciudad.ilike.${like}`
        );
      }

      const { data, error } = await qy;
      if (error) throw error;

      res.json((data || []).map(mapOut));
    } catch (e) {
      console.error('GET /api/clients', e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const b = req.body || {};
      const row = {
        name: b.name,
        local_name:
          b.local_name ?? b.nombre_local ?? b.clientLocal ?? null,
        dir1: b.dir1 ?? null,
        zona: b.zona ?? null,
        ciudad: b.ciudad ?? null,
        telefono: b.telefono ?? null,
        email: b.email ?? null,
        rut: b.rut ?? null,
        razon_social: b.razon_social ?? null,
        owner_id: b.ownerId ?? b.sellerId ?? null,
      };

      const { data, error } = await supabaseServer
        .from('clients')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(mapOut(data));
    } catch (e) {
      console.error('POST /api/clients', e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).end();
}
