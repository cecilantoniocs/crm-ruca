// /pages/api/sales/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = getReqUser(req);

  try {
    requirePerm(user, 'sales.read');

    // Parámetros (front usa fromDate / toDate en formato YYYY-MM-DD)
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

    // Filtro de fecha sobre delivery_date (la fecha que eliges en Orders)
    // Usamos comparación directa de 'YYYY-MM-DD' para evitar desfaces por UTC.
    if (fromDate) {
      query = query.gte('delivery_date', fromDate);
    }
    if (toDate) {
      query = query.lte('delivery_date', toDate);
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
