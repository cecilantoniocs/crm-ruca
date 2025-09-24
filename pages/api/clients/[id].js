// pages/api/clients/[id].js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('clients')
        .select(`id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,client_type,client_owner`)
        .eq('id', id)
        .single();
      if (error) throw error;
      return res.json(mapRow(data));
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = {};
      if ('name' in body)           patch.name = body.name;
      if ('nombre_local' in body)   patch.local_name = body.nombre_local;
      if ('local_name' in body)     patch.local_name = body.local_name;
      if ('dir1' in body)           patch.dir1 = body.dir1;
      if ('zona' in body)           patch.zona = body.zona;
      if ('ciudad' in body)         patch.ciudad = body.ciudad;
      if ('telefono' in body)       patch.telefono = body.telefono;
      if ('email' in body)          patch.email = body.email;
      if ('rut' in body)            patch.rut = body.rut;
      if ('razon_social' in body)   patch.razon_social = body.razon_social;
      if ('sellerId' in body)       patch.owner_id = body.sellerId;
      if ('ownerId' in body)        patch.owner_id = body.ownerId;
      if ('clientType' in body)     patch.client_type = (body.clientType || '').toLowerCase();
      if ('clientOwner' in body)    patch.client_owner = (body.clientOwner || '').toLowerCase();

      const { data, error } = await supabaseServer
        .from('clients')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.json(mapRow(data));
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseServer.from('clients').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    return res.status(405).end();
  } catch (e) {
    console.error('API /clients/[id]', e);
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
    clientType: c.client_type,
    clientOwner: c.client_owner,
  };
}
