// /pages/api/orders/index.js
import { supabaseServer } from '@/lib/supabaseServer';

const toCamel = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientName: row.client_name,
  clientLocal: row.client_local,
  sellerId: row.seller_id,
  deliveredBy: row.delivered_by,
  status: row.status,
  total: row.total,
  deliveryDate: row.delivery_date,
  deliveredAt: row.delivered_at,
  paymentMethod: row.payment_method,
  invoice: row.invoice,
  invoiceSent: row.invoice_sent,
  paid: row.paid,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  items: (row.order_items || []).map((it) => ({
    id: it.id,
    productId: it.product_id,
    name: it.name,
    sku: it.sku,
    imageUrl: it.image_url,
    qty: it.qty,
    price: it.price,
    subtotal: it.subtotal,
  })),
});

const fromCamel = (o) => ({
  client_id: o.clientId ?? o.client_id,
  client_name: o.clientName ?? o.client_name,
  client_local: o.clientLocal ?? o.client_local,
  seller_id: o.sellerId ?? o.seller_id ?? null,
  delivered_by: o.deliveredBy ?? o.delivered_by ?? null,
  status: o.status ?? 'pendiente',
  total: o.total ?? 0,
  delivery_date: o.deliveryDate ?? o.delivery_date ?? null,
  delivered_at: o.deliveredAt ?? o.delivered_at ?? null,
  payment_method: o.paymentMethod ?? o.payment_method ?? null,
  invoice: !!(o.invoice ?? false),
  invoice_sent: !!(o.invoiceSent ?? false),
  paid: !!(o.paid ?? false),
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { status, q, from, to } = req.query;

      let query = supabaseServer
        .from('orders')
        .select(
          `
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `
        )
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (from) query = query.gte('delivery_date', from);
      if (to) query = query.lte('delivery_date', to);
      if (q && q.trim()) {
        // Busca en nombre/local del cliente (case-insensitive)
        query = query.or(
          `client_name.ilike.%${q.trim()}%,client_local.ilike.%${q.trim()}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json((data || []).map(toCamel));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];

      // 1) Insertamos la orden
      const insertRow = fromCamel(body);
      const { data: order, error: e1 } = await supabaseServer
        .from('orders')
        .insert(insertRow)
        .select('*')
        .single();
      if (e1) throw e1;

      // 2) Insertamos ítems, si hay
      if (items.length > 0) {
        const itemsRows = items.map((it) => ({
          order_id: order.id,
          product_id: it.productId ?? it.product_id ?? null,
          name: it.name ?? null,
          sku: it.sku ?? null,
          image_url: it.imageUrl ?? it.image_url ?? null,
          qty: Number(it.qty) || 0,
          price: Number(it.price) || 0,
          subtotal:
            Number(it.subtotal) ||
            (Number(it.qty) || 0) * (Number(it.price) || 0),
        }));
        const { error: e2 } = await supabaseServer
          .from('order_items')
          .insert(itemsRows);
        if (e2) throw e2;
      }

      // 3) Devolvemos la orden completa con items
      const { data: full, error: e3 } = await supabaseServer
        .from('orders')
        .select(
          `
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `
        )
        .eq('id', order.id)
        .single();
      if (e3) throw e3;

      return res.status(201).json(toCamel(full));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
