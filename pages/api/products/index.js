// /pages/api/products/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// -------- Mapper (snake -> camel) --------
function mapRow(p) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    cost: p.cost ?? null,          // int4 (o null)
    weight: p.weight ?? null,      // text (o null)
    imageUrl: p.image_url || null,
    createdAt: p.created_at,
    sortOrder: p.sort_order ?? 1000,
  };
}

// -------- Schemas --------
const querySchema = z.object({
  q: z.string().optional().nullable(),        // búsqueda por name/sku
  sku: z.string().optional().nullable(),      // match exacto
  category: z.string().optional().nullable(), // filtro por categoría
});

export default async function handler(req, res) {
  const user = getReqUser(req);

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'products.read');

      const parsed = querySchema.safeParse({
        q: (req.query.q ?? '').toString().trim() || null,
        sku: (req.query.sku ?? '').toString().trim() || null,
        category: (req.query.category ?? '').toString().trim() || null,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Parámetros inválidos', detail: parsed.error?.flatten?.() ?? null });
      }
      const { q, sku, category } = parsed.data;

      // ⚠️ incluir sort_order y ordenar por sort_order ASC, luego name ASC
      let query = supabaseServer
        .from('products')
        .select('id,name,sku,category,cost,weight,image_url,created_at,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (sku) query = query.eq('sku', sku);
      if (category) query = query.eq('category', category);
      if (q) {
        const s = `%${q}%`;
        query = query.or(`name.ilike.${s},sku.ilike.${s}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('API /products GET -> Supabase error:', error);
        return res.status(500).json({
          error: 'DB_ERROR',
          detail: { message: error.message, hint: error.hint, code: error.code },
        });
      }

      return res.json((data || []).map(mapRow));
    }

    if (req.method === 'POST') {
      requirePerm(user, 'products.create');

      const body = req.body || {};
      // Validaciones mínimas y casting seguro
      const name = String(body.name ?? '').trim();
      const sku = String(body.sku ?? '').trim();
      if (!name) return res.status(400).json({ error: 'Nombre requerido' });
      if (!sku)  return res.status(400).json({ error: 'SKU requerido' });

      const insert = {
        name,
        sku,
        category: body.category ?? null,
        // cost INT4 o null
        cost: body.cost === '' || body.cost == null ? null : Number(body.cost),
        // weight TEXT o null (permitimos string vacío si quieres)
        weight: body.weight == null ? null : String(body.weight),
        // imageUrl flexible: '' -> null
        image_url: body.imageUrl ? String(body.imageUrl) : null,
        // sort_order: dejar que use DEFAULT (1000) salvo que envíen explícito
        ...(body.sortOrder != null ? { sort_order: Number(body.sortOrder) } : {}),
      };

      const { data, error } = await supabaseServer
        .from('products')
        .insert(insert)
        .select('id,name,sku,category,cost,weight,image_url,created_at,sort_order')
        .single();

      if (error) {
        console.error('API /products POST -> Supabase error:', error);
        return res.status(500).json({
          error: 'DB_ERROR',
          detail: { message: error.message, hint: error.hint, code: error.code },
        });
      }

      return res.status(201).json(mapRow(data));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('API /products CATCH', e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error' });
  }
}
