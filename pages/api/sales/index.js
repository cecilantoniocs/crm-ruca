// /pages/api/sales/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';

const ALL_OWNERS = ['rucapellan', 'cecil'];

function getUserCarteras(user) {
  if (!user) return [];
  if (user.is_admin || user.isAdmin) return ALL_OWNERS;
  const c = Array.isArray(user.carteras) ? user.carteras : [];
  return c.length > 0 ? c : (user.partner_tag ? [user.partner_tag] : []);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = getReqUser(req);

  try {
    requirePerm(user, 'sales.read');

    const {
      q,
      fromDate, toDate,
      clientId,          // filtrar por cliente específico (cuenta de cliente)
      owner,             // 'cecil' | 'rucapellan'
      courierId,         // uuid
      invoice,           // 'facturado' | 'no_facturado' | 'sin_factura'
      paid,              // 'pagado' | 'no_pagado'
      paymentMethod      // 'efectivo' | 'transferencia' | 'cheque'
      // status: ignorado desde el front; este API SIEMPRE entrega entregados
    } = req.query;

    // Vista con pagos + items (ahora incluye status y ya viene filtrada a 'entregado')
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
        items,
        status
      `)
      // Doble seguro (aunque la vista ya filtra)
      .eq('status', 'entregado')
      .order('delivery_date', { ascending: false })
      .order('id', { ascending: false });

    // Cuando se consulta por cliente, traer TODOS sus pedidos sin límite artificial
    if (clientId) {
      query = query.eq('client_id', clientId);
    } else {
      query = query.limit(2000);
    }

    // Fechas (YYYY-MM-DD)
    if (fromDate) query = query.gte('delivery_date', fromDate);
    if (toDate)   query = query.lte('delivery_date', toDate);

    // Búsqueda por texto (cliente/local)
    if (q && String(q).trim()) {
      const s = `%${String(q).trim()}%`;
      query = query.or(`client_name.ilike.${s},client_local.ilike.${s}`);
    }

    // Cartera (owner): restringir por carteras del usuario
    const userCarteras = getUserCarteras(user);
    if (owner && owner !== 'all') {
      if (userCarteras.includes(owner)) {
        query = query.eq('client_owner', owner);
      } else {
        return res.json([]); // no tiene acceso a esa cartera
      }
    } else if (userCarteras.length < ALL_OWNERS.length) {
      query = query.in('client_owner', userCarteras);
    }

    // Repartidor
    if (courierId && courierId !== 'all') query = query.eq('delivered_by', courierId);

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
    if (paid && paid !== 'all') query = query.eq('paid', paid === 'pagado');

    // Método de pago
    if (paymentMethod && paymentMethod !== 'all') query = query.eq('payment_method', paymentMethod);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((o) => ({
      id:            o.id,
      total:         o.total,
      paid:          o.paid,
      deliveryDate:  o.delivery_date,
      clientId:      o.client_id,
      clientName:    o.client_name,
      clientLocal:   o.client_local,
      deliveredBy:   o.delivered_by,
      paymentMethod: o.payment_method,
      invoice:       o.invoice,
      invoiceSent:   o.invoice_sent,
      clientOwner:   o.client_owner,
      paidSum:       Number(o.paid_sum ?? 0),
      remaining:     Number(o.remaining ?? 0),
      items:         Array.isArray(o.items) ? o.items : [],
      status:        o.status, // queda disponible si lo quieres mostrar
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/sales', e);
    res.status(e.status || 500).json({ error: e.msg || e.message || 'Error' });
  }
}
