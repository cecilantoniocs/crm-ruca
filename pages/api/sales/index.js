// /pages/api/sales/index.js
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { q, from, to, partnerId, courierId } = req.query;

    let query = supabaseServer
      .from('orders')
      .select(`
        id, client_id, client_name, client_local, seller_id, delivered_by,
        status, total, delivery_date, delivered_at, payment_method,
        invoice, invoice_sent, paid, created_at,
        order_items:order_items (
          id, product_id, name, sku, image_url, qty, price, subtotal
        )
      `)
      .eq('status', 'entregado')
      .order('delivered_at', { ascending: false })
      .order('delivery_date', { ascending: false });

    // Búsqueda por cliente/local
    if (q && String(q).trim()) {
      const s = `%${String(q).trim()}%`;
      query = query.or(`client_name.ilike.${s},client_local.ilike.${s}`);
    }

    // Rango de fechas (preferimos delivered_at, fallback delivery_date)
    if (from) {
      query = query.gte('delivered_at', from).gte('delivery_date', from);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1); // incluir el día "to"
      query = query.lt('delivered_at', toDate.toISOString()).lte('delivery_date', to);
    }

    if (partnerId) query = query.eq('seller_id', partnerId);
    if (courierId) query = query.eq('delivered_by', courierId);

    const { data, error } = await query;
    if (error) throw error;

    // Normalizamos a camelCase para el front actual
    const rows = (data || []).map((o) => ({
      id: o.id,
      clientId: o.client_id,
      clientName: o.client_name,
      clientLocal: o.client_local,
      sellerId: o.seller_id,
      deliveredBy: o.delivered_by,
      status: o.status,
      total: o.total,
      deliveryDate: o.delivery_date,
      deliveredAt: o.delivered_at,
      paymentMethod: o.payment_method,
      invoice: o.invoice,
      invoiceSent: o.invoice_sent,
      paid: o.paid,
      createdAt: o.created_at,
      items: o.order_items || [],
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/sales', e);
    res.status(500).json({ error: e.message });
  }
}
