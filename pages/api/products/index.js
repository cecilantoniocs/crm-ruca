import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseServer
        .from('products')
        .select('id,name,sku,cost,category,weight,image_url')
        .order('name', { ascending: true });

      if (error) throw error;

      const rows = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        cost: p.cost,
        category: p.category || '',
        weight: p.weight || '',
        imageUrl: p.image_url || '',
      }));

      res.json(rows);
    } catch (e) {
      console.error('GET /api/products', e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // (Opcional: POST/PUT/DELETE más adelante)
  res.status(405).end();
}
