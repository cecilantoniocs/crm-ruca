// /pages/api/products/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// --- mapper DB -> camel ---
function mapRow(p) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    cost: p.cost ?? null,        // int4
    weight: p.weight ?? null,    // text
    imageUrl: p.image_url || null,
    createdAt: p.created_at,
    sortOrder: p.sort_order ?? 1000,
  };
}

// --- schemas ---
const idSchema = z.object({ id: z.string().min(1) });

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  // cost es int4 en DB
  cost: z.union([z.number(), z.string()]).optional().transform((v) => {
    if (v === undefined || v === null || v === '') return undefined; // no tocar
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error('cost inválido');
    return n;
  }),
  // weight es TEXT en DB
  weight: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'number') return String(v);
    const s = String(v).trim();
    return s === '' ? null : s;
  }),
  // imageUrl: aceptar string cualquiera o vacío; "" => null
  imageUrl: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;          // no tocar
      if (v === null) return null;                    // explícito null
      const s = String(v).trim();
      return s === '' ? null : s;                     // vacío -> null
    }),
  // ✅ nuevo: sortOrder entero no negativo
  sortOrder: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw new Error('sortOrder inválido');
      return n;
    }),
}).refine((val) => Object.keys(val).length > 0, { message: 'Sin cambios' });

export default async function handler(req, res) {
  const user = getReqUser(req);
  const parseId = idSchema.safeParse({ id: String(req.query.id || '') });
  if (!parseId.success) return res.status(400).json({ error: 'id inválido' });
  const { id } = parseId.data;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'products.read');

      const { data, error } = await supabaseServer
        .from('products')
        .select('id,name,sku,category,cost,weight,image_url,created_at,sort_order')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('API /products/[id] GET -> DB error:', error);
        return res.status(500).json({ error: 'DB_ERROR', detail: error.message || error });
      }
      if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

      return res.json(mapRow(data));
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'products.update');

      const body = patchSchema.parse(req.body || {});
      // DB espera snake_case
      const patch = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.cost !== undefined ? { cost: body.cost } : {}),
        ...(body.weight !== undefined ? { weight: body.weight } : {}),
        ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
        ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
      };

      const { data, error } = await supabaseServer
        .from('products')
        .update(patch)
        .eq('id', id)
        .select('id,name,sku,category,cost,weight,image_url,created_at,sort_order')
        .maybeSingle();

      if (error) {
        console.error('API /products/[id] PATCH -> DB error:', error);
        return res.status(500).json({ error: 'DB_ERROR', detail: error.message || error });
      }
      if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

      return res.json(mapRow(data));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'products.delete');

      const { error } = await supabaseServer
        .from('products')
        .delete()
        .eq('id', id);

      if (error) {
        // FK conflict (producto usado en order_items)
        if (error.code === '23503') {
          return res.status(409).json({
            error: 'No se puede eliminar: el producto está asociado a pedidos.',
            code: 'FK_CONFLICT',
          });
        }
        console.error('API /products/[id] DELETE -> DB error:', error);
        return res.status(500).json({ error: 'DB_ERROR', detail: error.message || error });
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || (e.message === 'Sin cambios' ? 400 : 500);
    console.error('API /products/[id] CATCH', e);
    return res.status(status).json({ error: e.message || 'Error' });
  }
}
