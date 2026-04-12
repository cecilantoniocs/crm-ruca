// /pages/api/clients/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { logAudit } from '@/server/audit';

const DB_TYPES = ['B2B', 'B2C'];
const ALL_OWNERS = ['rucapellan', 'cecil'];

function getUserCarteras(user) {
  if (!user) return [];
  if (user.is_admin || user.isAdmin) return ALL_OWNERS;
  const c = Array.isArray(user.carteras) ? user.carteras : [];
  return c.length > 0 ? c : (user.partner_tag ? [user.partner_tag] : []);
}
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
    createdBy: c.created_by ?? null,
    createdByName: c.creator?.name ?? null,
    createdAt: c.created_at ?? null,
    updatedAt: c.updated_at ?? null,
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
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,client_type,client_owner,created_by,creator:users_app!clients_created_by_fkey(name),created_at,updated_at')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'No encontrado' });
      return res.status(200).json(mapRow(data));
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'clients.update');

      // verificar acceso a la cartera del cliente
      const { data: existing, error: existErr } = await supabaseServer
        .from('clients')
        .select('client_owner')
        .eq('id', id)
        .maybeSingle();
      if (existErr) throw existErr;
      if (!existing) return res.status(404).json({ error: 'No encontrado' });
      const userCarteras = getUserCarteras(user);
      if (!userCarteras.includes(existing.client_owner)) {
        return res.status(403).json({ error: 'Sin acceso a esa cartera' });
      }

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
      await logAudit(user, { action: 'client.updated', entity: 'client', entityId: id, description: `Cliente editado — ${data.name || ''}` });
      return res.status(200).json(mapRow(data));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'clients.delete');

      // verificar acceso a la cartera del cliente
      const { data: toDelete, error: delCheckErr } = await supabaseServer
        .from('clients')
        .select('client_owner')
        .eq('id', id)
        .maybeSingle();
      if (delCheckErr) throw delCheckErr;
      if (!toDelete) return res.status(404).json({ error: 'No encontrado' });
      const userCarteras = getUserCarteras(user);
      if (!userCarteras.includes(toDelete.client_owner)) {
        return res.status(403).json({ error: 'Sin acceso a esa cartera' });
      }

      const { error } = await supabaseServer
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await logAudit(user, { action: 'client.deleted', entity: 'client', entityId: id, description: 'Cliente eliminado' });
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
