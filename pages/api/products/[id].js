// pages/api/products/[id].js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('products')
        .select('id,name,sku,category,cost,weight,image_url,created_at')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = { ...body };

      if ('cost' in patch) {
        patch.cost = patch.cost === '' || patch.cost == null ? null : Number(patch.cost);
      }

      const { data, error } = await supabaseServer
        .from('products')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseServer.from('products').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).end();
  } catch (e) {
    console.error('API /products/[id]', e);
    return res.status(500).json({ error: e.message });
  }
}
