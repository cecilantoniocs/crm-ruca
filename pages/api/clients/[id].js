// GET:    /api/clients/:id
// PATCH:  /api/clients/:id
// DELETE: /api/clients/:id
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
  sellerId: r.owner_id || null,
  ownerId: r.owner_id || null,
  createdAt: r.created_at,
});

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseServer
        .from('clients')
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,created_at')
        .eq('id', id)
        .single();
      if (error) throw error;
      res.json(mapOut(data));
    } catch (e) {
      console.error('GET /api/clients/[id]', e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const b = req.body || {};
      const patch = {};
      if ('name' in b) patch.name = b.name;
      if ('local_name' in b || 'nombre_local' in b || 'clientLocal' in b)
        patch.local_name = b.local_name ?? b.nombre_local ?? b.clientLocal;
      if ('dir1' in b) patch.dir1 = b.dir1;
      if ('zona' in b) patch.zona = b.zona;
      if ('ciudad' in b) patch.ciudad = b.ciudad;
      if ('telefono' in b) patch.telefono = b.telefono;
      if ('email' in b) patch.email = b.email;
      if ('rut' in b) patch.rut = b.rut;
      if ('razon_social' in b) patch.razon_social = b.razon_social;
      if ('ownerId' in b || 'sellerId' in b) patch.owner_id = b.ownerId ?? b.sellerId;

      const { data, error } = await supabaseServer
        .from('clients')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(mapOut(data));
    } catch (e) {
      console.error('PATCH /api/clients/[id]', e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabaseServer.from('clients').delete().eq('id', id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /api/clients/[id]', e);
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  res.status(405).end();
}
