// /pages/api/orders/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { logAudit } from '@/server/audit';
import { sendPushToUser, sendPushToRoles } from '@/lib/webpush';
import { z } from 'zod';

// ---------- Utils ----------

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
  // relajado: permite '' además de URL
  image_url: z.union([z.string().url(), z.literal('')]).optional().nullable(),
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
  seller_id: z.union([z.string(), z.number()]).optional(), // opcional; default = user.id
  delivered_by: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.enum(STATUSES).default('pendiente'),
  delivery_date: z.string().optional().nullable().transform(v => {
    if (!v) return null;
    const s = String(v).trim();
    if (!DATE_RE.test(s)) throw new Error('delivery_date debe ser YYYY-MM-DD');
    return s;
  }),
  payment_method: z.any().transform(normPM).optional().nullable(),
  invoice: z.boolean().optional().nullable(),
  invoice_sent: z.boolean().optional().nullable(),
  paid: z.boolean().optional().nullable(),
  is_pickup: z.boolean().optional().default(false),
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
  isPickup: o.is_pickup ?? false,
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

const ALL_OWNERS = ['rucapellan', 'cecil'];

function getUserCarteras(user) {
  if (!user) return [];
  if (user.is_admin || user.isAdmin) return ALL_OWNERS;
  const c = Array.isArray(user.carteras) ? user.carteras : [];
  return c.length > 0 ? c : (user.partner_tag ? [user.partner_tag] : []);
}

export default async function handler(req, res) {
  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  try {
    // --------- LISTAR (GET) ---------
    if (req.method === 'GET') {
      try { requirePerm(user, 'orders.read'); } catch { return res.status(403).json({ error: 'Sin permiso: orders.read' }); }

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

      // filtrar por carteras del usuario (orders no tiene client_owner, usamos client_id)
      let allowedClientIds = null;
      const userCarteras = getUserCarteras(user);
      if (userCarteras.length < ALL_OWNERS.length) {
        const { data: allowedClients } = await supabaseServer
          .from('clients')
          .select('id')
          .in('client_owner', userCarteras);
        allowedClientIds = (allowedClients || []).map((c) => c.id);
        if (allowedClientIds.length === 0) return res.json([]);
      }

      const baseCols = `
        id, client_id, client_name, client_local, seller_id, delivered_by,
        status, total, delivery_date, delivered_at, payment_method,
        invoice, invoice_sent, paid, created_at, updated_at
      `;
      const colsWithItems = `
        ${baseCols},
        order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
      `;

      const buildQuery = (cols) => {
        let qy = supabaseServer.from('orders').select(cols)
          .order('delivery_date', { ascending: false, nullsFirst: false })
          .order('created_at',    { ascending: false });
        if (q) {
          const s = `%${q}%`;
          qy = qy.or(`client_name.ilike.${s},client_local.ilike.${s}`);
        }
        if (status) qy = qy.eq('status', status);
        if (sellerId) qy = qy.eq('seller_id', sellerId);
        if (courierId) qy = qy.eq('delivered_by', courierId);
        if (from) qy = qy.gte('delivery_date', from);
        if (to)   qy = qy.lte('delivery_date', to);
        if (allowedClientIds) qy = qy.in('client_id', allowedClientIds);
        return qy;
      };

      // Sin filtro de fechas: limitar para no traer todo el historial
      // Con filtro de fechas: límite alto explícito (PostgREST usa su default de 1000 si no se especifica)
      const buildQueryFinal = (cols) => {
        let qy = buildQuery(cols);
        if (!from && !to) qy = qy.limit(2000);
        else qy = qy.limit(10000);
        return qy;
      };

      // intento con items
      let { data, error } = await buildQueryFinal(colsWithItems);
      // fallback sin items si falla la relación
      if (error) {
        console.warn('[orders] fallback sin order_items por error:', error?.message || error);
        const retry = await buildQueryFinal(baseCols);
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      const rows = (data || []).map((o) => {
        const dto = toCamel({ ...o, order_items: o.order_items || [] });
        return dto;
      });

      // ---- SUMAS DE PAGOS (amountPaid) Y BALANCE ----
      if (rows.length > 0) {
        try {
          const ids = rows.map(r => r.id);
          const { data: payItems, error: piErr } = await supabaseServer
            .from('payment_items')
            .select('order_id, amount')
            .in('order_id', ids);

          if (!piErr && payItems) {
            const sumByOrder = new Map();
            for (const pi of (payItems || [])) {
              const k = pi.order_id;
              const prev = sumByOrder.get(k) || 0;
              sumByOrder.set(k, prev + (Number(pi.amount) || 0));
            }
            for (const r of rows) {
              const paid = sumByOrder.get(r.id) || 0;
              const total = Number(r.total) || 0;
              r.amountPaid = paid;
              r.balance = Math.max(0, total - paid);
            }
          } else {
            // si falla payment_items, no botar todo
            for (const r of rows) {
              const total = Number(r.total) || 0;
              r.amountPaid = 0;
              r.balance = total;
            }
          }
        } catch (e) {
          console.warn('[orders] payment_items no disponible, se asume 0 pagado');
          for (const r of rows) {
            const total = Number(r.total) || 0;
            r.amountPaid = 0;
            r.balance = total;
          }
        }
      }

      return res.json(rows);
    }

    // --------- CREAR (POST) ---------
    if (req.method === 'POST') {
      try { requirePerm(user, 'orders.create'); } catch { return res.status(403).json({ error: 'Sin permiso: orders.create' }); }

      const body = postBodySchema.parse(req.body || {});

      // 1) crear orden
      const isPickup = body.is_pickup === true;
      const base = {
        client_id: body.client_id,
        client_name: body.client_name,
        client_local: body.client_local ?? null,
        seller_id: body.seller_id ?? user?.id ?? null,
        delivered_by: isPickup ? null : (body.delivered_by ?? null),
        status: body.status,
        delivery_date: body.delivery_date, // YYYY-MM-DD o null
        delivered_at: body.status === 'entregado' ? new Date().toISOString() : null,
        payment_method: body.payment_method, // normalizado
        invoice: body.invoice ?? false,
        invoice_sent: body.invoice_sent ?? false,
        paid: body.paid ?? false,
        is_pickup: isPickup,
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
        await supabaseServer.from('orders').delete().eq('id', orderId);
        throw errItems;
      }

      // 3) devolver orden completa + totales de pago
      const baseCols = `
        id, client_id, client_name, client_local, seller_id, delivered_by,
        status, total, delivery_date, delivered_at, payment_method,
        invoice, invoice_sent, paid, created_at, updated_at
      `;
      const colsWithItems = `
        ${baseCols},
        order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
      `;

      let sel = await supabaseServer.from('orders').select(colsWithItems).eq('id', orderId).maybeSingle();
      if (sel.error) {
        console.warn('[orders POST] fallback sin order_items por error:', sel.error?.message || sel.error);
        sel = await supabaseServer.from('orders').select(baseCols).eq('id', orderId).maybeSingle();
      }
      if (sel.error) throw sel.error;

      const dto = toCamel({ ...(sel.data || {}), order_items: sel.data?.order_items || [] });

      // suma pagos (si falla, asumir 0)
      try {
        const { data: payItems, error: piErr } = await supabaseServer
          .from('payment_items')
          .select('order_id, amount')
          .eq('order_id', orderId);

        const paid = !piErr && payItems
          ? (payItems || []).reduce((a, b) => a + (Number(b.amount) || 0), 0)
          : 0;

        dto.amountPaid = paid;
        dto.balance = Math.max(0, (Number(dto.total) || 0) - paid);
      } catch {
        dto.amountPaid = 0;
        dto.balance = Math.max(0, Number(dto.total) || 0);
      }

      await logAudit(user, { action: 'order.created', entity: 'order', entityId: orderId, description: `Pedido creado — ${body.client_name || ''}` });

      // Notificaciones push — awaited para que Vercel no corte la función antes de enviar
      try {
        // Nombre del repartidor asignado (solo para pedidos con delivery)
        let courierName = '';
        if (!isPickup && body.delivered_by) {
          const { data: courier } = await supabaseServer
            .from('users_app')
            .select('name')
            .eq('id', body.delivered_by)
            .maybeSingle();
          courierName = courier?.name || 'Repartidor';
        }

        // Resumen de ítems: "2x Producto A, 1x Producto B"
        const items = Array.isArray(body.items) ? body.items : [];
        const itemsSummary = items
          .slice(0, 3)
          .map(it => `${it.qty ?? 1}x ${it.name ?? ''}`)
          .filter(Boolean)
          .join(', ') + (items.length > 3 ? ` +${items.length - 3} más` : '');

        // Fecha de entrega formateada DD/MM/YYYY
        let fechaEntrega = '';
        if (body.delivery_date) {
          const [y, m, d] = body.delivery_date.split('-');
          fechaEntrega = `${d}/${m}/${y}`;
        }

        const clientLine = `${body.client_name || 'Cliente'}${body.client_local ? ` — ${body.client_local}` : ''}`;
        const destino    = isPickup ? 'Retiro en Bodega' : courierName;
        const title      = `Nuevo pedido — ${destino}`;
        const bodyText   = [
          clientLine,
          fechaEntrega ? `Entrega: ${fechaEntrega}` : '',
          itemsSummary,
        ].filter(Boolean).join('\n');

        if (isPickup) {
          await sendPushToRoles(['admin', 'supervisor'], {
            title, body: bodyText, data: { orderId, url: '/orders' },
          });
        } else if (body.delivered_by) {
          await sendPushToUser(body.delivered_by, {
            title, body: bodyText, data: { orderId, url: '/orders' },
          });
        }
      } catch (e) {
        console.warn('[push] error enviando notificación', e?.message);
      }

      return res.status(201).json(dto);
    }

    return res.status(405).end();
  } catch (e) {
    const isZod = e?.name === 'ZodError' || /Zod/i.test(e?.message || '');
    const status = isZod ? 400 : (e?.status || 500);
    const message = e?.msg || e?.message || 'Error';
    console.error('API /orders', e);
    return res.status(status).json({ error: message });
  }
}
