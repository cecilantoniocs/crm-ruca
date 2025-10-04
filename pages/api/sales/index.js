// /pages/api/sales/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

function startOfDayISO(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function nextDayISO(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + 1);
  return x.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = getReqUser(req);

  try {
    requirePerm(user, 'sales.read');

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
      // En tu DB el estado entregado es 'entregado'
      .eq('status', 'entregado')
      .order('delivered_at', { ascending: false })
      .order('delivery_date', { ascending: false });

    // Búsqueda por cliente/local
    if (q && String(q).trim()) {
      const s = `%${String(q).trim()}%`;
      query = query.or(`client_name.ilike.${s},client_local.ilike.${s}`);
    }

    // Rango de fechas (preferimos delivered_at; también limitamos delivery_date para respaldo)
    if (from) {
      const f = startOfDayISO(from);
      query = query.gte('delivered_at', f).gte('delivery_date', f);
    }
    if (to) {
      // inclusivo del día 'to' usando < a medianoche del día siguiente
      const tNext = nextDayISO(to);
      query = query.lt('delivered_at', tNext).lt('delivery_date', tNext);
    }

    if (partnerId) query = query.eq('seller_id', partnerId);
    if (courierId) query = query.eq('delivered_by', courierId);

    const { data, error } = await query;
    if (error) throw error;

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
    res.status(e.status || 500).json({ error: e.msg || e.message || 'Error' });
  }
}
