// /pages/api/clients/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

const OWNERS = ['rucapellan', 'cecil'];
const DB_TYPES = ['B2B', 'B2C'];

const toDBClientType = (v) => {
  const up = String(v || 'b2b').trim().toUpperCase();
  if (!DB_TYPES.includes(up)) {
    const err = new Error('clientType inválido (use b2b o b2c)');
    err.status = 400;
    throw err;
  }
  return up; // para DB
};

const textOrNull = (v) => {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
};

const normalizeEmail = (v) => {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s ? s : null; // null si viene vacío
};

// ----- Schemas -----
const querySchema = z.object({
  ownerId: z.string().optional().nullable(),
  q: z.string().optional().nullable(),
  clientOwner: z.enum(['rucapellan', 'cecil']).optional().nullable(),
  type: z.enum(['b2b', 'b2c']).optional().nullable(), // viene minúscula en query
});

function normalizeOwnerId(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v); // soporta int o uuid
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
    clientType: c.client_type ? String(c.client_type).toLowerCase() : null, // respuesta en minúsculas
    clientOwner: c.client_owner,
  };
}

export default async function handler(req, res) {
  const user = getReqUser(req);

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'clients.read');

      // filtros opcionales: ?ownerId=...&q=...&clientOwner=rucapellan|cecil&type=b2b|b2c
      const parsed = querySchema.safeParse({
        ownerId: req.query.ownerId ?? null,
        q: (req.query.q ?? '').toString().trim() || null,
        clientOwner: (req.query.clientOwner ?? '').toString().trim().toLowerCase() || null,
        type: (req.query.type ?? '').toString().trim().toLowerCase() || null,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Parámetros inválidos' });
      }
      const { ownerId, q, clientOwner, type } = parsed.data;

      let query = supabaseServer
        .from('clients')
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,rut,razon_social,owner_id,client_type,client_owner')
        .order('name', { ascending: true });

      if (ownerId) query = query.eq('owner_id', normalizeOwnerId(ownerId));
      if (clientOwner) query = query.eq('client_owner', clientOwner);
      if (type) query = query.eq('client_type', type.toUpperCase()); // DB en MAYÚSCULAS

      if (q) {
        const pattern = `%${q}%`;
        query = query.or(`name.ilike.${pattern},local_name.ilike.${pattern}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.json((data || []).map(mapRow));
    }

    if (req.method === 'POST') {
      requirePerm(user, 'clients.create');

      const body = req.body || {};
      const localName = body.nombre_local ?? body.local_name ?? null;

      // ---------- Resolver clientOwner ----------
      let clientOwner = (body.clientOwner || '').toString().trim().toLowerCase();
      if (!clientOwner) {
        const byTag = (user?.partner_tag || '').toString().trim().toLowerCase();
        if (OWNERS.includes(byTag)) clientOwner = byTag;
      }
      if (!OWNERS.includes(clientOwner)) {
        return res.status(400).json({ error: 'clientOwner es requerido (rucapellan o cecil)' });
      }

      // ---------- clientType para DB (MAYÚSCULAS) ----------
      const clientTypeDB = toDBClientType(body.clientType);

      const insert = {
        name: textOrNull(body.name),
        local_name: textOrNull(localName),
        dir1: textOrNull(body.dir1),
        zona: textOrNull(body.zona),
        ciudad: textOrNull(body.ciudad),
        telefono: textOrNull(body.telefono),
        email: normalizeEmail(body.email),          // <- opcional (null si vacío)
        rut: textOrNull(body.rut),
        razon_social: textOrNull(body.razon_social),
        owner_id: normalizeOwnerId(body.sellerId ?? body.ownerId ?? null),
        client_type: clientTypeDB,                  // DB en MAYÚSCULAS
        client_owner: clientOwner,
      };

      if (!insert.name) return res.status(400).json({ error: 'Falta name' });
      if (!insert.dir1) return res.status(400).json({ error: 'Falta dir1' });
      // 👇 quitamos la exigencia de email:
      // if (!body.email) return res.status(400).json({ error: 'Falta email' });

      const { data, error } = await supabaseServer
        .from('clients')
        .insert(insert)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(mapRow(data));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || 500;
    const message = e.msg || e.message || 'Error';
    console.error('API /clients', e);
    res.status(status).json({ error: message });
  }
}
