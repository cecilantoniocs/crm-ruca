// /pages/api/payments/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { logAudit } from '@/server/audit';
import { z } from 'zod';

// ---------- mappers ----------
const mapPayment = (p) => ({
  id: p.id,
  clientId: p.client_id,
  method: p.method, // 'efectivo' | 'transferencia' | 'cheque'
  amountTotal: p.amount_total != null ? Number(p.amount_total) : 0,
  paidAt: p.paid_at,
  note: p.note || null,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const mapItem = (it) => ({
  id: it.id,
  paymentId: it.payment_id,
  orderId: it.order_id,
  amount: it.amount != null ? Number(it.amount) : 0,
  note: it.note || null,
});

// ---------- validation ----------
const listQuerySchema = z.object({
  clientId: z.string().optional(),
  orderId: z.string().optional(),
  from: z.string().optional(), // YYYY-MM-DD (inclusive)
  to: z.string().optional(),   // YYYY-MM-DD (inclusive)
  method: z.enum(['efectivo', 'transferencia', 'cheque']).optional(),
  include: z.enum(['items']).optional(), // "items" => adjuntar ítems
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const postSchema = z.object({
  clientId: z.string().min(1, 'clientId requerido'),
  method: z.enum(['efectivo', 'transferencia', 'cheque']),
  paidAt: z.string().optional(), // YYYY-MM-DD o ISO; si no viene -> now() DB
  note: z.string().optional().nullable(),
  amountTotal: z.union([z.number(), z.string()])
    .transform((v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('amountTotal inválido');
      return n;
    }),
  items: z.array(z.object({
    orderId: z.string().min(1, 'orderId requerido'),
    amount: z.union([z.number(), z.string()]).transform((v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('amount inválido');
      return n;
    }),
    note: z.string().optional().nullable(),
  })).min(1, 'Debe incluir al menos 1 item'),
});

// ---------- handler ----------
export default async function handler(req, res) {
  const user = getReqUser(req);

  try {
    if (req.method === 'GET') {
      // Antes: payments.read
      // Ahora: quien ve cuenta del cliente
      requirePerm(user, 'client.account.read');

      const parsed = listQuerySchema.safeParse({
        clientId: req.query.clientId,
        orderId: req.query.orderId,
        from: req.query.from,
        to: req.query.to,
        method: req.query.method,
        include: req.query.include,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Parámetros inválidos',
          detail: parsed.error?.flatten?.() ?? null,
        });
      }

      const {
        clientId,
        orderId,
        from,
        to,
        method,
        include,
        limit = 100,
        offset = 0,
      } = parsed.data;

      // Base query de payments
      let q = supabaseServer
        .from('payments')
        .select(
          'id,client_id,method,amount_total,paid_at,note,created_at,updated_at',
          { count: 'exact' }
        )
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (clientId) q = q.eq('client_id', clientId);
      if (method) q = q.eq('method', method);

      // Filtro por rango de fecha (paid_at)
      if (from) q = q.gte('paid_at', from);
      if (to) {
        // incluir el día completo si viene solo YYYY-MM-DD
        const end = to.length === 10 ? `${to}T23:59:59.999Z` : to;
        q = q.lte('paid_at', end);
      }

      // Ejecutar fetch payments
      const { data: payments, error: errP, count } = await q;
      if (errP) {
        console.error('GET /payments -> DB error:', errP);
        return res
          .status(500)
          .json({ error: 'DB_ERROR', detail: errP.message || errP });
      }

      let mapped = (payments || []).map(mapPayment);

      // Si piden por orderId, filtramos por items (join manual)
      if (orderId) {
        const ids = mapped.map((p) => p.id);
        if (ids.length === 0) {
          return res.json({ rows: [], count: 0 });
        }

        const { data: itemsForOrder, error: itErr } = await supabaseServer
          .from('payment_items')
          .select('id,payment_id,order_id,amount,note')
          .in('payment_id', ids)
          .eq('order_id', orderId);

        if (itErr) {
          console.error(
            'GET /payments orderId -> items DB error:',
            itErr
          );
          return res.status(500).json({
            error: 'DB_ERROR',
            detail: itErr.message || itErr,
          });
        }

        const paySet = new Set(
          itemsForOrder.map((it) => it.payment_id)
        );
        mapped = mapped.filter((p) => paySet.has(p.id));
      }

      // include=items -> traer items por cada payment
      if (include === 'items' && mapped.length > 0) {
        const ids = mapped.map((p) => p.id);

        const { data: items, error: iErr } = await supabaseServer
          .from('payment_items')
          .select('id,payment_id,order_id,amount,note')
          .in('payment_id', ids);

        if (iErr) {
          console.error(
            'GET /payments include=items -> DB error:',
            iErr
          );
          return res.status(500).json({
            error: 'DB_ERROR',
            detail: iErr.message || iErr,
          });
        }

        const byPayment = new Map();
        for (const it of items || []) {
          const k = it.payment_id;
          if (!byPayment.has(k)) byPayment.set(k, []);
          byPayment.get(k).push(mapItem(it));
        }

        mapped = mapped.map((p) => ({
          ...p,
          items: byPayment.get(p.id) || [],
        }));
      }

      return res.json({
        rows: mapped,
        count: count ?? mapped.length,
      });
    }

    if (req.method === 'POST') {
      // Antes: payments.create
      // Ahora: permiso explícito para abonar a la cuenta del cliente
      requirePerm(user, 'client.account.charge');

      let payload;
      try {
        payload = postSchema.parse(req.body || {});
      } catch (e) {
        return res
          .status(400)
          .json({ error: e.message || 'Body inválido' });
      }

      const {
        clientId,
        method,
        amountTotal,
        paidAt,
        note,
        items,
      } = payload;

      const sumItems = items.reduce(
        (acc, it) => acc + Number(it.amount || 0),
        0
      );

      // Garantizamos que los montos cuadren
      if (Math.abs(sumItems - amountTotal) > 0.0001) {
        return res.status(400).json({
          error:
            'La suma de items no coincide con amountTotal',
        });
      }

      // Insert payment
      const insertPayment = {
        client_id: clientId,
        method,
        amount_total: amountTotal,
        note: note ?? null,
        ...(paidAt
          ? { paid_at: paidAt }
          : {}), // si no se pasa, la DB pone now()
      };

      const {
        data: created,
        error: payErr,
      } = await supabaseServer
        .from('payments')
        .insert(insertPayment)
        .select(
          'id,client_id,method,amount_total,paid_at,note,created_at,updated_at'
        )
        .single();

      if (payErr) {
        console.error(
          'POST /payments -> insert payment error:',
          payErr
        );
        return res.status(500).json({
          error: 'DB_ERROR',
          detail: payErr.message || payErr,
        });
      }

      // Insert items
      const toInsertItems = items.map((it) => ({
        payment_id: created.id,
        order_id: it.orderId,
        amount: it.amount,
        note: it.note ?? null,
      }));

      const {
        data: insItems,
        error: itErr,
      } = await supabaseServer
        .from('payment_items')
        .insert(toInsertItems)
        .select('id,payment_id,order_id,amount,note');

      if (itErr) {
        console.error(
          'POST /payments -> insert items error:',
          itErr
        );
        // (No hay transacción aquí; en la práctica conviene una función SQL transaccional)
        return res.status(500).json({
          error: 'DB_ERROR',
          detail:
            itErr.message || itErr,
        });
      }

      await logAudit(user, { action: 'payment.created', entity: 'payment', entityId: created.id, description: `Abono registrado — $${amountTotal} (${method})` });
      return res.status(201).json({
        ...mapPayment(created),
        items: (insItems || []).map(mapItem),
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res
      .status(405)
      .json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('API /payments CATCH', e);
    const status = e.status || 500;
    return res
      .status(status)
      .json({ error: e.message || 'Error' });
  }
}
