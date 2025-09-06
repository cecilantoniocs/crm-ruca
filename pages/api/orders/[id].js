// /pages/api/orders/[id].js
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

const partialFromCamel = (o) => {
  const r = {};
  if ('clientId' in o || 'client_id' in o) r.client_id = o.clientId ?? o.client_id;
  if ('clientName' in o || 'client_name' in o) r.client_name = o.clientName ?? o.client_name;
  if ('clientLocal' in o || 'client_local' in o) r.client_local = o.clientLocal ?? o.client_local;
  if ('sellerId' in o || 'seller_id' in o) r.seller_id = o.sellerId ?? o.seller_id;
  if ('deliveredBy' in o || 'delivered_by' in o) r.delivered_by = o.deliveredBy ?? o.delivered_by;
  if ('status' in o) r.status = o.status;
  if ('total' in o) r.total = o.total;
  if ('deliveryDate' in o || 'delivery_date' in o) r.delivery_date = o.deliveryDate ?? o.delivery_date;
  if ('deliveredAt' in o || 'delivered_at' in o) r.delivered_at = o.deliveredAt ?? o.delivered_at;
  if ('paymentMethod' in o || 'payment_method' in o) r.payment_method = o.paymentMethod ?? o.payment_method;
  if ('invoice' in o) r.invoice = !!o.invoice;
  if ('invoiceSent' in o || 'invoice_sent' in o) r.invoice_sent = !!(o.invoiceSent ?? o.invoice_sent);
  if ('paid' in o) r.paid = !!o.paid;
  return r;
};

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseServer
        .from('orders')
        .select(
          `
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return res.status(200).json(toCamel(data));
    } catch (e) {
      console.error(e);
      return res.status(404).json({ error: 'Order not found' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const patch = partialFromCamel(req.body || {});

      // Conveniencia: si se marca "entregado" y no hay delivered_at, lo seteamos ahora
      if (patch.status === 'entregado' && !('delivered_at' in patch)) {
        patch.delivered_at = new Date().toISOString();
      }

      const { data, error } = await supabaseServer
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select(
          `
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `
        )
        .single();
      if (error) throw error;

      return res.status(200).json(toCamel(data));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to update order' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabaseServer.from('orders').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to delete order' });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
