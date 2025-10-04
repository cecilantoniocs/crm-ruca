// /pages/api/orders/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// ---------- Helpers de mapeo ----------
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

const toIntOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const partialFromCamel = (o) => {
  const r = {};
  if ('clientId' in o || 'client_id' in o) r.client_id = o.clientId ?? o.client_id;
  if ('clientName' in o || 'client_name' in o) r.client_name = o.clientName ?? o.client_name;
  if ('clientLocal' in o || 'client_local' in o) r.client_local = o.clientLocal ?? o.client_local;
  if ('sellerId' in o || 'seller_id' in o) r.seller_id = o.sellerId ?? o.seller_id;
  if ('deliveredBy' in o || 'delivered_by' in o) r.delivered_by = o.deliveredBy ?? o.delivered_by;
  if ('status' in o) r.status = o.status;
  if ('total' in o) r.total = toIntOrNull(o.total);
  if ('deliveryDate' in o || 'delivery_date' in o) r.delivery_date = o.deliveryDate ?? o.delivery_date;
  if ('deliveredAt' in o || 'delivered_at' in o) r.delivered_at = o.deliveredAt ?? o.delivered_at;
  if ('paymentMethod' in o || 'payment_method' in o) r.payment_method = o.paymentMethod ?? o.payment_method;
  if ('invoice' in o) r.invoice = !!o.invoice;
  if ('invoiceSent' in o || 'invoice_sent' in o) r.invoice_sent = !!(o.invoiceSent ?? o.invoice_sent);
  if ('paid' in o) r.paid = !!o.paid;
  return r;
};

// ---------- Validación ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // delivery_date es DATE (YYYY-MM-DD)

// mismo esquema de ítems que usas en POST (/api/orders/index.js)
const itemSchema = z.object({
  product_id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  sku: z.string().min(1),
  image_url: z.string().url().optional().nullable(),
  qty: z.union([z.number(), z.string()]).transform((v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error('qty inválido');
    return n;
  }),
  price: z.union([z.number(), z.string()]).transform((v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error('price inválido');
    return n;
  }),
  subtotal: z.union([z.number(), z.string()]).optional().nullable(), // se recalcula
});

// PATCH: campos parciales + items (opcional)
const patchSchema = z.object({
  clientId: z.union([z.number().int(), z.string()]).optional(),
  client_id: z.union([z.number().int(), z.string()]).optional(),
  clientName: z.string().optional(),
  client_name: z.string().optional(),
  clientLocal: z.string().optional(),
  client_local: z.string().optional(),
  sellerId: z.union([z.number().int(), z.string()]).optional(),
  seller_id: z.union([z.number().int(), z.string()]).optional(),
  deliveredBy: z.union([z.number().int(), z.string()]).optional(),
  delivered_by: z.union([z.number().int(), z.string()]).optional(),
  status: z.enum(['pendiente', 'entregado']).optional(),
  total: z.union([z.number(), z.string()]).optional(),
  deliveryDate: z
    .string()
    .optional()
    .refine((v) => !v || DATE_RE.test(v), { message: 'deliveryDate debe ser YYYY-MM-DD' }),
  delivery_date: z
    .string()
    .optional()
    .refine((v) => !v || DATE_RE.test(v), { message: 'delivery_date debe ser YYYY-MM-DD' }),
  deliveredAt: z.string().datetime().optional(),
  delivered_at: z.string().datetime().optional(),
  paymentMethod: z.string().optional(),
  payment_method: z.string().optional(),
  invoice: z.boolean().optional(),
  invoiceSent: z.boolean().optional(),
  invoice_sent: z.boolean().optional(),
  paid: z.boolean().optional(),
  items: z.array(itemSchema).optional(), // 👈 ahora aceptamos items
}).refine((val) => Object.keys(val || {}).length > 0, { message: 'Sin cambios' });

export default async function handler(req, res) {
  const user = getReqUser(req);
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'orders.read');

      const { data, error } = await supabaseServer
        .from('orders')
        .select(`
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Order not found' });

      return res.status(200).json(toCamel(data));
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'orders.update');

      const body = patchSchema.parse(req.body || {});
      const patch = partialFromCamel(body);

      // Si pasa a "entregado" y no viene delivered_at, lo seteamos ahora
      if (patch.status === 'entregado' && !('delivered_at' in patch)) {
        patch.delivered_at = new Date().toISOString();
      }

      // Si vienen items, recalculamos subtotales y el total de la orden
      let itemsToInsert = null;
      if (Array.isArray(body.items)) {
        const normalized = body.items.map((i) => {
          const qty = Number(i.qty);
          const price = Number(i.price);
          const subtotal = qty * price;
          return {
            order_id: id,
            product_id: i.product_id,
            name: i.name,
            sku: i.sku,
            image_url: i.image_url ?? null,
            qty,
            price,
            subtotal,
          };
        });

        itemsToInsert = normalized;
        const total = normalized.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
        patch.total = toIntOrNull(total);
      }

      // 1) actualizar la orden (campos básicos y, si corresponde, el total recalculado)
      const upd = await supabaseServer
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select(
          `
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at
        `
        )
        .maybeSingle();

      if (upd.error) throw upd.error;
      if (!upd.data) return res.status(404).json({ error: 'Order not found' });

      // 2) si vinieron items, reemplazarlos
      if (itemsToInsert) {
        const del = await supabaseServer.from('order_items').delete().eq('order_id', id);
        if (del.error) throw del.error;

        if (itemsToInsert.length > 0) {
          const ins = await supabaseServer.from('order_items').insert(itemsToInsert);
          if (ins.error) throw ins.error;
        }
      }

      // 3) devolver la orden completa
      const { data: full, error: selErr } = await supabaseServer
        .from('orders')
        .select(`
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `)
        .eq('id', id)
        .maybeSingle();

      if (selErr) throw selErr;

      return res.status(200).json(toCamel(full));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'orders.delete');

      const { error } = await supabaseServer.from('orders').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || (e.message === 'Sin cambios' ? 400 : 500);
    const message = e.msg || e.message || 'Error';
    console.error('API /orders/[id]', e);
    return res.status(status).json({ error: message });
  }
}
