// pages/api/clients/index.js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // filtros opcionales: ?ownerId=...&q=...&clientOwner=rucapellan|cecil&type=b2b|b2c
      const ownerId = req.query.ownerId || null;
      const q = (req.query.q || '').toString().trim();
      const clientOwner = (req.query.clientOwner || '').toString().trim().toLowerCase();
      const type = (req.query.type || '').toString().trim().toLowerCase();

      let query = supabaseServer
        .from('clients')
        .select(`id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,client_type,client_owner`)
        .order('name', { ascending: true });

      if (ownerId) query = query.eq('owner_id', ownerId);
      if (clientOwner && ['rucapellan','cecil'].includes(clientOwner)) {
        query = query.eq('client_owner', clientOwner);
      }
      if (type && ['b2b','b2c'].includes(type)) {
        query = query.eq('client_type', type);
      }
      if (q) {
        // búsqueda simple por name/local_name
        // Nota: Supabase no soporta contains ilike compuesto fácilmente en dos columnas en una sola llamada
        // así que hacemos un filtro en memoria tras traer resultados si hay q
        const { data, error } = await query;
        if (error) throw error;
        const lowered = q.toLowerCase();
        const rows = (data || []).filter((c) => {
          const name = (c?.name || '').toLowerCase();
          const local = (c?.local_name || '').toLowerCase();
          return name.includes(lowered) || local.includes(lowered);
        });
        return res.json(rows.map(mapRow));
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.json((data || []).map(mapRow));
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // Validamos mínimos y el requerido "client_owner"
      if (!body?.name) return res.status(400).json({ error: 'Falta nombre' });
      if (!body?.dir1) return res.status(400).json({ error: 'Falta dirección' });
      if (!body?.email) return res.status(400).json({ error: 'Falta email' });

      const clientOwner = String(body.clientOwner || '').toLowerCase();
      if (!['rucapellan', 'cecil'].includes(clientOwner)) {
        return res.status(400).json({ error: 'clientOwner es requerido (Rucapellan o Cecil)' });
      }

      const insert = {
        name: body.name,
        local_name: body.nombre_local || body.local_name || null,
        dir1: body.dir1 || null,
        zona: body.zona || null,
        ciudad: body.ciudad || null,
        telefono: body.telefono || null,
        email: body.email || null,
        rut: body.rut || null,
        razon_social: body.razon_social || null,
        owner_id: body.sellerId || body.ownerId || null,
        client_type: (body.clientType || 'b2b').toLowerCase(), // por defecto b2b
        client_owner: clientOwner,
      };

      const { data, error } = await supabaseServer.from('clients').insert(insert).select().single();
      if (error) throw error;
      return res.status(201).json(mapRow(data));
    }

    return res.status(405).end();
  } catch (e) {
    console.error('API /clients', e);
    res.status(500).json({ error: e.message });
  }
}

function mapRow(c) {
  return {
    id: c.id,
    name: c.name,
    nombre_local: c.local_name,
    dir1: c.dir1,
    zona: c.zona,
    ciudad: c.ciudad,
    telefono: c.telefono,
    email: c.email,
    rut: c.rut,
    razon_social: c.razon_social,
    ownerId: c.owner_id,
    clientType: c.client_type,     // 'b2b' | 'b2c'
    clientOwner: c.client_owner,   // 'rucapellan' | 'cecil'
  };
}
