// /pages/api/payments/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import { z } from 'zod';

// ---------- payment method: whitelist + normalización ----------
const ALLOWED_PM = new Set(['efectivo', 'transferencia', 'cheque']);
const normPM = (v) => {
  if (v == null || v === '') return undefined;
  const s = String(v).trim().toLowerCase();
  return ALLOWED_PM.has(s) ? s : undefined;
};

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
const idSchema = z.object({ id: z.string().min(1) });

const patchSchema = z.object({
  // aceptamos string libre y normalizamos a la whitelist
  method: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : normPM(v)))
    .refine((v) => v === undefined || ALLOWED_PM.has(v), {
      message: 'method inválido',
    }),
  note: z.string().optional().nullable(),
  // YYYY-MM-DD o ISO; si viene yyyy-mm-dd, lo dejamos tal cual (server lo acepta)
  paidAt: z.string().optional(),
  amountTotal: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('amountTotal inválido');
      return n;
    }),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'Sin cambios' });

// ---------- handler ----------
export default async function handler(req, res) {
  const user = getReqUser(req);

  const parsedId = idSchema.safeParse({ id: String(req.query.id || '') });
  if (!parsedId.success) return res.status(400).json({ error: 'id inválido' });
  const { id } = parsedId.data;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'client.account.read');

      const { data: pay, error: errP } = await supabaseServer
        .from('payments')
        .select('id,client_id,method,amount_total,paid_at,note,created_at,updated_at')
        .eq('id', id)
        .maybeSingle();

      if (errP) {
        console.error('GET /payments/[id] -> DB error:', errP);
        return res.status(500).json({ error: 'DB_ERROR', detail: errP.message || errP });
      }
      if (!pay) return res.status(404).json({ error: 'Pago no encontrado' });

      const { data: items, error: errI } = await supabaseServer
        .from('payment_items')
        .select('id,payment_id,order_id,amount,note')
        .eq('payment_id', id);

      if (errI) {
        console.error('GET /payments/[id] items -> DB error:', errI);
        return res.status(500).json({ error: 'DB_ERROR', detail: errI.message || errI });
      }

      return res.json({
        ...mapPayment(pay),
        items: (items || []).map(mapItem),
      });
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'client.account.charge');

      let body;
      try {
        body = patchSchema.parse(req.body || {});
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Body inválido' });
      }

      const patch = {
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.paidAt !== undefined ? { paid_at: body.paidAt } : {}),
        ...(body.amountTotal !== undefined ? { amount_total: body.amountTotal } : {}),
      };

      const { data: updated, error: upErr } = await supabaseServer
        .from('payments')
        .update(patch)
        .eq('id', id)
        .select('id,client_id,method,amount_total,paid_at,note,created_at,updated_at')
        .maybeSingle();

      if (upErr) {
        console.error('PATCH /payments/[id] -> DB error:', upErr);
        return res.status(500).json({ error: 'DB_ERROR', detail: upErr.message || upErr });
      }
      if (!updated) return res.status(404).json({ error: 'Pago no encontrado' });

      return res.json(mapPayment(updated));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'client.account.charge');

      // 1) Pedidos impactados por ESTE pago
      const { data: items, error: itemsErr } = await supabaseServer
        .from('payment_items')
        .select('order_id')
        .eq('payment_id', id);

      if (itemsErr) {
        console.error('DELETE /payments/[id] items -> DB error:', itemsErr);
        return res.status(500).json({ error: 'DB_ERROR', detail: itemsErr.message || itemsErr });
      }

      const orderIds = Array.from(
        new Set((items || []).map((it) => String(it.order_id)).filter(Boolean))
      );

      // 2) Marcar esos pedidos como NO pagados (regla de negocio)
      if (orderIds.length > 0) {
        const { error: upOrdersErr } = await supabaseServer
          .from('orders')
          .update({ paid: false })
          .in('id', orderIds);

        if (upOrdersErr) {
          console.error('DELETE /payments/[id] orders->paid=false error:', upOrdersErr);
          return res.status(500).json({ error: 'DB_ERROR', detail: upOrdersErr.message || upOrdersErr });
        }
      }

      // 3) Borrar SOLO este pago (ON DELETE CASCADE elimina sus items)
      const { error: delErr } = await supabaseServer
        .from('payments')
        .delete()
        .eq('id', id);

      if (delErr) {
        console.error('DELETE /payments/[id] -> DB error:', delErr);
        return res.status(500).json({ error: 'DB_ERROR', detail: delErr.message || delErr });
      }

      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('API /payments/[id] CATCH', e);
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error' });
  }
}
