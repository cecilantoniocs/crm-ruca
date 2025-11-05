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

    // Parámetros (front actual usa fromDate / toDate)
    const {
      q,                       // búsqueda por cliente/local (opcional)
      fromDate, toDate,        // rango de fechas (YYYY-MM-DD)
      owner,                   // 'cecil' | 'rucapellan' (opcional)
      courierId,               // repartidor (opcional)
      invoice,                 // 'facturado' | 'no_facturado' | 'sin_factura' (opcional)
      paid,                    // 'pagado' | 'no_pagado' (opcional)
      paymentMethod            // 'efectivo' | 'transferencia' | 'cheque' (opcional)
    } = req.query;

    // Base: vista acelerada con ítems y saldo
    let query = supabaseServer
      .from('sales_with_payments_items')
      .select(`
        id,
        total,
        paid,
        delivery_date,
        client_id,
        client_name,
        client_local,
        delivered_by,
        payment_method,
        invoice,
        invoice_sent,
        client_owner,
        paid_sum,
        remaining,
        items
      `)
      .order('delivery_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(2000);

    // Filtros de fecha (sobre delivery_date)
    if (fromDate) {
      const f = startOfDayISO(fromDate);
      query = query.gte('delivery_date', f);
    }
    if (toDate) {
      const tNext = nextDayISO(toDate); // exclusivo del día siguiente
      query = query.lt('delivery_date', tNext);
    }

    // Búsqueda por texto (cliente/local)
    if (q && String(q).trim()) {
      const s = `%${String(q).trim()}%`;
      query = query.or(`client_name.ilike.${s},client_local.ilike.${s}`);
    }

    // Cartera (owner)
    if (owner && owner !== 'all') {
      query = query.eq('client_owner', owner);
    }

    // Repartidor
    if (courierId && courierId !== 'all') {
      query = query.eq('delivered_by', courierId);
    }

    // Estado de factura
    if (invoice && invoice !== 'all') {
      if (invoice === 'facturado') {
        query = query.eq('invoice', true).eq('invoice_sent', true);
      } else if (invoice === 'no_facturado') {
        query = query.eq('invoice', true).eq('invoice_sent', false);
      } else if (invoice === 'sin_factura') {
        query = query.eq('invoice', false);
      }
    }

    // Estado de pago
    if (paid && paid !== 'all') {
      query = query.eq('paid', paid === 'pagado');
    }

    // Método de pago
    if (paymentMethod && paymentMethod !== 'all') {
      query = query.eq('payment_method', paymentMethod);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Mapear a camelCase para el front
    const rows = (data || []).map((o) => ({
      id: o.id,
      total: o.total,
      paid: o.paid,
      deliveryDate: o.delivery_date,
      clientId: o.client_id,
      clientName: o.client_name,
      clientLocal: o.client_local,
      deliveredBy: o.delivered_by,
      paymentMethod: o.payment_method,
      invoice: o.invoice,
      invoiceSent: o.invoice_sent,
      clientOwner: o.client_owner,
      paidSum: o.paid_sum,
      remaining: o.remaining,
      items: Array.isArray(o.items) ? o.items : [], // [{name, qty, price, subtotal}]
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/sales', e);
    res.status(e.status || 500).json({ error: e.msg || e.message || 'Error' });
  }
}
