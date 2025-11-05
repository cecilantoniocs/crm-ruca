// /pages/api/orders/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// ---------- Payment method (normalización y whitelist) ----------
const ALLOWED_PM = new Set(['efectivo', 'transferencia', 'cheque']);
const normPM = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return ALLOWED_PM.has(s) ? s : null;
};

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

  // normalizamos payment_method
  if ('paymentMethod' in o || 'payment_method' in o) {
    const raw = o.paymentMethod ?? o.payment_method;
    r.payment_method = normPM(raw);
  }

  if ('invoice' in o) r.invoice = !!o.invoice;
  if ('invoiceSent' in o || 'invoice_sent' in o)
    r.invoice_sent = !!(o.invoiceSent ?? o.invoice_sent);

  if ('paid' in o) r.paid = !!o.paid;

  return r;
};

// ---------- helper permisos locales ----------
function userHasPerm(user, permName) {
  try {
    requirePerm(user, permName);
    return true;
  } catch (_e) {
    return false;
  }
}

// ---------- Validación ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  subtotal: z.union([z.number(), z.string()]).optional().nullable(),
});

const patchSchema = z
  .object({
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

    // ⚠️ NUEVO: bandera para indicar que se deben borrar TODOS los abonos
    // (sólo usar desde Ventas al poner "No pagado")
    wipePayments: z.boolean().optional(),

    items: z.array(itemSchema).optional(),
  })
  .refine((val) => Object.keys(val || {}).length > 0, { message: 'Sin cambios' });

// ---------- helpers DB ----------
async function fetchOrderWithItems(orderId) {
  return supabaseServer
    .from('orders')
    .select(`
      id, client_id, client_name, client_local, seller_id, delivered_by,
      status, total, delivery_date, delivered_at, payment_method,
      invoice, invoice_sent, paid, created_at, updated_at,
      order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
    `)
    .eq('id', orderId)
    .maybeSingle();
}

async function sumPaidForOrder(orderId) {
  const { data, error } = await supabaseServer
    .from('payment_items')
    .select('amount')
    .eq('order_id', orderId);

  if (error) throw error;
  return (data || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
}

// ---------- helper: borrar todos los abonos de una orden ----------
async function wipePaymentsForOrder(orderId) {
  // 1. obtener todos los payment_id que apuntan a esta orden
  const { data: payItems, error: payItemsErr } = await supabaseServer
    .from('payment_items')
    .select('payment_id')
    .eq('order_id', orderId);

  if (payItemsErr) {
    throw payItemsErr;
  }

  const paymentIds = [...new Set((payItems || []).map((pi) => pi.payment_id))];

  if (paymentIds.length === 0) {
    return; // nada que borrar
  }

  // 2. borrar esos payments (ON DELETE CASCADE debe volar payment_items asociados)
  const { error: delErr } = await supabaseServer
    .from('payments')
    .delete()
    .in('id', paymentIds);

  if (delErr) {
    throw delErr;
  }
}

// ---------- main handler ----------
export default async function handler(req, res) {
  const user = getReqUser(req);
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'orders.read');

      const { data, error } = await fetchOrderWithItems(id);
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Order not found' });

      const dto = toCamel(data);

      // pagos de esta orden
      const { data: pi, error: piErr } = await supabaseServer
        .from('payment_items')
        .select(`
          id, payment_id, order_id, amount, created_at,
          payments ( id, method, paid_at, client_id, created_at )
        `)
        .eq('order_id', id);

      if (piErr) throw piErr;

      const payments = (pi || []).map((row) => {
        const payMethod = row.payments?.method ?? null;
        return {
          id: row.payment_id,
          itemId: row.id,
          amount: Number(row.amount) || 0,
          createdAt: row.created_at,
          method: payMethod,
          type: payMethod,
          reference: null,
          paidAt: row.payments?.paid_at || null,
          memo: null,
        };
      });

      const amountPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const total = Number(dto.total) || 0;

      dto.payments = payments;
      dto.amountPaid = amountPaid;
      dto.balance = Math.max(0, total - amountPaid);

      return res.status(200).json(dto);
    }

    if (req.method === 'PATCH') {
      // VALIDAR INPUT
      const body = patchSchema.parse(req.body || {});
      const patch = partialFromCamel(body);

      // ----- permisos granulares -----
      const touchesPaymentMethod =
        Object.prototype.hasOwnProperty.call(body, 'paymentMethod') ||
        Object.prototype.hasOwnProperty.call(body, 'payment_method');

      const touchesInvoice =
        Object.prototype.hasOwnProperty.call(body, 'invoice') ||
        Object.prototype.hasOwnProperty.call(body, 'invoiceSent') ||
        Object.prototype.hasOwnProperty.call(body, 'invoice_sent');

      const touchesPaid =
        Object.prototype.hasOwnProperty.call(body, 'paid');

      const touchesStructural =
        Object.prototype.hasOwnProperty.call(body, 'clientId') ||
        Object.prototype.hasOwnProperty.call(body, 'client_id') ||
        Object.prototype.hasOwnProperty.call(body, 'clientName') ||
        Object.prototype.hasOwnProperty.call(body, 'client_name') ||
        Object.prototype.hasOwnProperty.call(body, 'clientLocal') ||
        Object.prototype.hasOwnProperty.call(body, 'client_local') ||
        Object.prototype.hasOwnProperty.call(body, 'sellerId') ||
        Object.prototype.hasOwnProperty.call(body, 'seller_id') ||
        Object.prototype.hasOwnProperty.call(body, 'deliveredBy') ||
        Object.prototype.hasOwnProperty.call(body, 'delivered_by') ||
        Object.prototype.hasOwnProperty.call(body, 'status') ||
        Object.prototype.hasOwnProperty.call(body, 'total') ||
        Object.prototype.hasOwnProperty.call(body, 'deliveryDate') ||
        Object.prototype.hasOwnProperty.call(body, 'delivery_date') ||
        Object.prototype.hasOwnProperty.call(body, 'deliveredAt') ||
        Object.prototype.hasOwnProperty.call(body, 'delivered_at') ||
        Object.prototype.hasOwnProperty.call(body, 'items');

      if (touchesStructural) {
        requirePerm(user, 'orders.update');
      }
      if (touchesPaymentMethod) {
        requirePerm(user, 'sales.update_payment');
      }
      if (touchesInvoice) {
        requirePerm(user, 'sales.update_invoice');
      }
      if (touchesPaid) {
        const canMarkPaid =
          userHasPerm(user, 'sales.mark_paid') ||
          userHasPerm(user, 'client.account.charge');

        if (!canMarkPaid) {
          requirePerm(user, 'sales.mark_paid');
        }
      }

      // ⚠️ CASO ESPECIAL: paid === false
      // - Si viene wipePayments:true -> limpiar abonos y marcar no pagado (flujo Ventas).
      // - Si NO viene wipePayments -> sólo marcar no pagado (flujo Account al borrar un abono).
      if (body.paid === false) {
        const mustWipe = body.wipePayments === true;
        console.log('[orders PATCH] paid:false', { orderId: id, wipe: mustWipe });

        if (mustWipe) {
          await wipePaymentsForOrder(id);
        }

        // actualizar la orden a paid:false
        const { data: updatedOrder, error: upErr } = await supabaseServer
          .from('orders')
          .update({ paid: false })
          .eq('id', id)
          .select(`
            id, client_id, client_name, client_local, seller_id, delivered_by,
            status, total, delivery_date, delivered_at, payment_method,
            invoice, invoice_sent, paid, created_at, updated_at,
            order_items ( id, product_id, name, sku, image_url, qty, price, subtotal )
          `)
          .maybeSingle();

        if (upErr) throw upErr;
        if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });

        // recalcular dto
        const dtoNoPays = toCamel(updatedOrder);

        // Traer pagos actuales (si hubo wipe, ya no habrá; si no hubo wipe, se conservan)
        const { data: pi3, error: piErr3 } = await supabaseServer
          .from('payment_items')
          .select(`
            id, payment_id, order_id, amount, created_at,
            payments ( id, method, paid_at, client_id, created_at )
          `)
          .eq('order_id', id);
        if (piErr3) throw piErr3;

        const payments3 = (pi3 || []).map((row) => ({
          id: row.payment_id,
          itemId: row.id,
          amount: Number(row.amount) || 0,
          createdAt: row.created_at,
          method: row.payments?.method ?? null,
          type: row.payments?.method ?? null,
          reference: null,
          paidAt: row.payments?.paid_at || null,
          memo: null,
        }));

        const amountPaid = payments3.reduce((a, b) => a + (Number(b.amount) || 0), 0);
        const total = Number(dtoNoPays.total) || 0;

        dtoNoPays.payments = payments3;
        dtoNoPays.amountPaid = amountPaid;
        dtoNoPays.balance = Math.max(0, total - amountPaid);

        return res.status(200).json(dtoNoPays);
      }

      // --- flujo normal PATCH (incluye paid === true, invoice, etc.) ---

      // Si pasa a "entregado" y no viene delivered_at, seteamos timestamp ahora
      if (patch.status === 'entregado' && !('delivered_at' in patch)) {
        patch.delivered_at = new Date().toISOString();
      }

      // Si vienen items, recalculamos items y total
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
        const newTotal = normalized.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
        patch.total = toIntOrNull(newTotal);
      }

      // 1) update base de la orden
      const upd = await supabaseServer
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select(`
          id, client_id, client_name, client_local, seller_id, delivered_by,
          status, total, delivery_date, delivered_at, payment_method,
          invoice, invoice_sent, paid, created_at, updated_at
        `)
        .maybeSingle();

      if (upd.error) throw upd.error;
      if (!upd.data) return res.status(404).json({ error: 'Order not found' });

      // 2) si hay items -> reemplazar
      if (itemsToInsert) {
        const del = await supabaseServer.from('order_items').delete().eq('order_id', id);
        if (del.error) throw del.error;

        if (itemsToInsert.length > 0) {
          const ins = await supabaseServer.from('order_items').insert(itemsToInsert);
          if (ins.error) throw ins.error;
        }
      }

      // 2.5) Si se marcó paid === true ahora, crear abono automático por saldo pendiente
      if (body.paid === true) {
        const currentOrder = upd.data; // ya tiene total/payment_method/client_id
        const totalNow = Number(currentOrder.total) || 0;
        const paidSoFar = await sumPaidForOrder(id);
        const balance = Math.max(0, totalNow - paidSoFar);

        if (balance > 0) {
          const methodFromBody = normPM(body.paymentMethod ?? body.payment_method);
          const method =
            methodFromBody ||
            normPM(currentOrder.payment_method) ||
            'efectivo';

          // crear payment
          const { data: createdPay, error: payErr } = await supabaseServer
            .from('payments')
            .insert({
              client_id: currentOrder.client_id,
              method,
              amount_total: balance,
              note: 'Pago automático: marcado como pagado',
              paid_at: new Date().toISOString(),
            })
            .select('id,client_id,method,amount_total,paid_at,note,created_at,updated_at')
            .single();

          if (payErr) throw payErr;

          // crear payment_item linkeando esta orden
          const { error: itErr } = await supabaseServer
            .from('payment_items')
            .insert({
              payment_id: createdPay.id,
              order_id: id,
              amount: balance,
              note: null,
            });

          if (itErr) throw itErr;
        }
      }

      // 3) devolver la orden completa post-update con pagos actuales
      const { data: full, error: selErr } = await fetchOrderWithItems(id);
      if (selErr) throw selErr;

      const dto = toCamel(full);

      const { data: pi2, error: piErr2 } = await supabaseServer
        .from('payment_items')
        .select(`
          id, payment_id, order_id, amount, created_at,
          payments ( id, method, paid_at, client_id, created_at )
        `)
        .eq('order_id', id);

      if (piErr2) throw piErr2;

      const payments2 = (pi2 || []).map((row) => {
        const payMethod = row.payments?.method ?? null;
        return {
          id: row.payment_id,
          itemId: row.id,
          amount: Number(row.amount) || 0,
          createdAt: row.created_at,
          method: payMethod,
          type: payMethod,
          reference: null,
          paidAt: row.payments?.paid_at || null,
          memo: null,
        };
      });

      const amountPaid = payments2.reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const total = Number(dto.total) || 0;
      dto.payments = payments2;
      dto.amountPaid = amountPaid;
      dto.balance = Math.max(0, total - amountPaid);

      return res.status(200).json(dto);
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
