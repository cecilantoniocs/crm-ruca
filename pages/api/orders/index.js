// /pages/api/orders/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// ---------- Utils ----------
function startOfDayISO(d) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString(); }
function nextDayISO(d)    { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()+1); return x.toISOString(); }
const STATUSES = ['pendiente','entregado'];

// ---------- Payment method (normalización y whitelist) ----------
const ALLOWED_PM = new Set(['efectivo', 'transferencia', 'cheque']);
const normPM = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return ALLOWED_PM.has(s) ? s : null;
};

// ---------- Schemas ----------
const getQuerySchema = z.object({
  q: z.string().optional().nullable(),
  status: z.enum(STATUSES).optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  sellerId: z.union([z.string(), z.number()]).optional().nullable(),
  courierId: z.union([z.string(), z.number()]).optional().nullable(),
});

const itemSchema = z.object({
  product_id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  sku: z.string().min(1),
  image_url: z.string().url().optional().nullable(),
  qty: z.union([z.number(), z.string()]).transform(v => {
    const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error('qty inválido'); return n;
  }),
  price: z.union([z.number(), z.string()]).transform(v => {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error('price inválido'); return n;
  }),
  subtotal: z.union([z.number(), z.string()]).optional().nullable(), // se recalcula
});

// delivery_date es DATE en la tabla -> aceptamos 'YYYY-MM-DD'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const postBodySchema = z.object({
  client_id: z.union([z.string(), z.number()]),
  client_name: z.string().min(2),
  client_local: z.string().optional().nullable(),
  seller_id: z.union([z.string(), z.number()]).optional(), // 👈 opcional; default = user.id
  delivered_by: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.enum(STATUSES).default('pendiente'),
  delivery_date: z.string().optional().nullable().transform(v => {
    if (!v) return null;
    const s = String(v).trim();
    if (!DATE_RE.test(s)) throw new Error('delivery_date debe ser YYYY-MM-DD');
    return s;
  }),
  // aceptamos cualquier input y lo normalizamos a null | 'efectivo' | 'transferencia' | 'cheque'
  payment_method: z.any().transform(normPM).optional().nullable(),
  invoice: z.boolean().optional().nullable(),
  invoice_sent: z.boolean().optional().nullable(),
  paid: z.boolean().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Debe incluir items'),
}).transform((b) => {
  const items = b.items.map(i => {
    const subtotal = Number(i.qty) * Number(i.price);
    return { ...i, subtotal };
  });
  const total = items.reduce((acc, i) => acc + i.subtotal, 0);
  return { ...b, items, total };
});

// ---------- Mappers ----------
const toCamel = (o) => ({
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
  updatedAt: o.updated_at,
  items: (o.order_items || []).map(it => ({
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

export default async function handler(req, res) {
  const user = getReqUser(req);

  try {
    // --------- LISTAR (GET) ---------
    if (req.method === 'GET') {
      requirePerm(user, 'orders.read');

      const parsed = getQuerySchema.safeParse({
        q: (req.query.q ?? '').toString().trim() || null,
        status: (req.query.status ?? '').toString().trim().toLowerCase() || null,
        from: (req.query.from ?? '').toString().trim() || null,
        to: (req.query.to ?? '').toString().trim() || null,
        sellerId: req.query.sellerId ?? null,
        courierId: req.query.courierId ?? null,
      });
      if (!parsed.success) return res.status(400).json({ error: 'Parámetros inválidos' });

      const { q, status, from, to, sellerId, courierId } = parsed.data;

      let query = supabaseServer
        .from('orders')
        .select(`
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `)
        .order('created_at', { ascending: false });

      if (q) {
        const s = `%${q}%`;
        query = query.or(`client_name.ilike.${s},client_local.ilike.${s}`);
      }
      if (status) query = query.eq('status', status);
      if (sellerId) query = query.eq('seller_id', sellerId);
      if (courierId) query = query.eq('delivered_by', courierId);

      // rango por created_at (ajusta a delivered_at si lo prefieres)
      if (from) query = query.gte('created_at', startOfDayISO(from));
      if (to)   query = query.lt('created_at', nextDayISO(to));

      const { data, error } = await query;
      if (error) throw error;

      return res.json((data || []).map(toCamel));
    }

    // --------- CREAR (POST) ---------
    if (req.method === 'POST') {
      requirePerm(user, 'orders.create');

      const body = postBodySchema.parse(req.body || {});

      // 1) crear orden
      const base = {
        client_id: body.client_id,
        client_name: body.client_name,
        client_local: body.client_local ?? null,
        seller_id: body.seller_id ?? user?.id ?? null,
        delivered_by: body.delivered_by ?? null,
        status: body.status,
        delivery_date: body.delivery_date, // YYYY-MM-DD o null
        delivered_at: body.status === 'entregado' ? new Date().toISOString() : null,
        payment_method: body.payment_method, // 👈 ya viene normalizado por zod->normPM
        invoice: body.invoice ?? false,
        invoice_sent: body.invoice_sent ?? false,
        paid: body.paid ?? false,
        total: Number(body.total) || 0, // INT4
      };

      const { data: order, error: errOrder } = await supabaseServer
        .from('orders')
        .insert(base)
        .select('id')
        .single();
      if (errOrder) throw errOrder;

      const orderId = order.id;

      // 2) insertar items
      const itemsToInsert = body.items.map(it => ({
        order_id: orderId,
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        image_url: it.image_url ?? null,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        subtotal: Number(it.subtotal) || 0,
      }));

      const { error: errItems } = await supabaseServer
        .from('order_items')
        .insert(itemsToInsert);
      if (errItems) {
        // rollback lógico
        await supabaseServer.from('orders').delete().eq('id', orderId);
        throw errItems;
      }

      // 3) devolver orden completa
      const { data: full, error: errSelect } = await supabaseServer
        .from('orders')
        .select(`
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at,
          order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
        `)
        .eq('id', orderId)
        .maybeSingle();
      if (errSelect) throw errSelect;

      return res.status(201).json(toCamel(full));
    }

    return res.status(405).end();
  } catch (e) {
    const status = e.status || 500;
    const message = e.msg || e.message || 'Error';
    console.error('API /orders', e);
    return res.status(status).json({ error: message });
  }
}
