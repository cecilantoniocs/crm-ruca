// /pages/api/clients/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

const DB_TYPES = ['B2B', 'B2C'];
const toDBClientType = (v) => {
  const up = String(v || '').trim().toUpperCase();
  if (!up) return undefined; // no tocar si no viene
  if (!DB_TYPES.includes(up)) {
    const err = new Error('clientType inválido (use b2b o b2c)');
    err.status = 400;
    throw err;
  }
  return up;
};

const textOrNull = (v) => {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
};
const normalizeEmail = (v) => {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s ? s : null; // null si vacío
};

// Mapea snake_case (DB) -> camelCase (API)
function mapRow(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    nombre_local: c.local_name,
    local_name: c.local_name,
    dir1: c.dir1,
    zona: c.zona,
    ciudad: c.ciudad,
    telefono: c.telefono,
    email: c.email,
    rut: c.rut,
    razon_social: c.razon_social,
    ownerId: c.owner_id,
    clientType: c.client_type ? String(c.client_type).toLowerCase() : null,
    clientOwner: c.client_owner,
  };
}

export default async function handler(req, res) {
  const user = getReqUser(req);
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'clients.read');

      const { data, error } = await supabaseServer
        .from('clients')
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,client_type,client_owner')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'No encontrado' });
      return res.status(200).json(mapRow(data));
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'clients.update');

      const body = req.body || {};
      const patch = {};
      if ('name' in body)           patch.name = textOrNull(body.name);
      if ('nombre_local' in body)   patch.local_name = textOrNull(body.nombre_local);
      if ('local_name' in body)     patch.local_name = textOrNull(body.local_name);
      if ('dir1' in body)           patch.dir1 = textOrNull(body.dir1);
      if ('zona' in body)           patch.zona = textOrNull(body.zona);
      if ('ciudad' in body)         patch.ciudad = textOrNull(body.ciudad);
      if ('telefono' in body)       patch.telefono = textOrNull(body.telefono);
      if ('email' in body)          patch.email = normalizeEmail(body.email); // <- opcional
      if ('rut' in body)            patch.rut = textOrNull(body.rut);
      if ('razon_social' in body)   patch.razon_social = textOrNull(body.razon_social);
      if ('sellerId' in body)       patch.owner_id = body.sellerId;
      if ('ownerId' in body)        patch.owner_id = body.ownerId;

      // clientType -> MAYÚSCULAS para DB (valida)
      const ct = toDBClientType(body.clientType);
      if (ct !== undefined) patch.client_type = ct;

      if ('clientOwner' in body)    patch.client_owner = (body.clientOwner || '').toLowerCase();

      const { data, error } = await supabaseServer
        .from('clients')
        .update(patch)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'No encontrado' });
      return res.status(200).json(mapRow(data));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'clients.delete');

      const { error } = await supabaseServer
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || 500;
    const msg = e.msg || e.message || 'Error';
    console.error('API /clients/[id]', e);
    return res.status(status).json({ error: msg });
  }
}
