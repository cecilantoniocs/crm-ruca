// pages/api/products/index.js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('products')
        .select('id,name,sku,category,cost,weight,image_url,created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      const { name, sku, category, cost, weight, image_url } = req.body || {};
      if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

      const payload = {
        name,
        sku: sku || null,
        category: category || null,
        cost: cost === '' || cost == null ? null : Number(cost),
        weight: weight || null,
        image_url: image_url || null,
      };

      const { data, error } = await supabaseServer
        .from('products')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end();
  } catch (e) {
    console.error('API /products', e);
    return res.status(500).json({ error: e.message });
  }
}
