// /pages/api/analytics/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser } from '@/server/guard';

// ── Granularidad automática según rango ────────────────────────────────────
function getGranularity(from, to) {
  const days = (new Date(to) - new Date(from)) / 86400000;
  if (days <= 31) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

function periodKey(dateStr, granularity) {
  const d = new Date(dateStr + 'T12:00:00');
  if (granularity === 'day') return dateStr;
  if (granularity === 'week') {
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    return monday.toISOString().slice(0, 10);
  }
  return dateStr.slice(0, 7); // YYYY-MM
}

// ── Helpers ────────────────────────────────────────────────────────────────
const num = (v) => Number(v) || 0;

/**
 * Ejecuta una consulta Supabase con .in() en lotes para evitar URLs demasiado largas.
 * @param {Function} buildQuery  fn(ids) → supabase query builder ya con .select()
 * @param {Array}    ids         array completo de IDs
 * @param {number}   chunkSize   tamaño del lote (default 200)
 */
async function inBatches(buildQuery, ids, chunkSize = 200) {
  const results = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await buildQuery(chunk);
    if (error) throw error;
    if (data) results.push(...data);
  }
  return results;
}

function calcItems(items, productMap) {
  let revenue = 0, cost = 0, units = 0;
  for (const it of items) {
    const subtotal = num(it.subtotal);
    const qty      = num(it.qty);
    const unitCost = num(productMap[String(it.product_id)]?.cost);
    revenue += subtotal;
    cost    += qty * unitCost;
    units   += qty;
  }
  return { revenue, cost, units, profit: revenue - cost };
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const allowed =
    user.isAdmin || user.is_admin ||
    user.permissions?.analytics?.view;
  if (!allowed) return res.status(403).json({ error: 'Sin permiso' });

  const today = new Date().toISOString().slice(0, 10);
  const {
    from       = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to         = today,
    owner      = '',   // 'rucapellan' | 'cecil' | ''
    productIds = '',   // IDs separados por coma
  } = req.query;

  // Parsear productIds a Set de strings
  const productIdSet = productIds
    ? new Set(productIds.split(',').map((s) => s.trim()).filter(Boolean))
    : new Set();

  try {
    // ── 1. Productos (mapa de costos y categorías) ─────────────────────────
    const { data: rawProducts } = await supabaseServer
      .from('products')
      .select('id, name, sku, category, cost');

    const productMap = {};
    for (const p of rawProducts || []) productMap[String(p.id)] = p;

    // ── 2. Pedidos entregados en el período ────────────────────────────────
    const { data: rawOrders, error: ordErr } = await supabaseServer
      .from('orders')
      .select('id, total, delivery_date, client_id, client_name, client_local')
      .eq('status', 'entregado')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(5000);

    if (ordErr) throw ordErr;
    const orders = rawOrders || [];

    // ── 3. Items de esos pedidos (en lotes para evitar URL demasiado larga) ─
    let items = [];
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      items = await inBatches(
        (chunk) => supabaseServer
          .from('order_items')
          .select('id, order_id, product_id, qty, price, subtotal')
          .in('order_id', chunk),
        orderIds
      );
    }

    // ── 4. Clientes de esos pedidos (en lotes) ────────────────────────────
    const clientIds = [...new Set(orders.map((o) => o.client_id).filter(Boolean))];
    const clientMap = {};
    if (clientIds.length > 0) {
      const rawClients = await inBatches(
        (chunk) => supabaseServer
          .from('clients')
          .select('id, name, local_name, client_type, client_owner, zona, ciudad, created_at, is_ads_lead, ads_campaign')
          .in('id', chunk),
        clientIds
      );
      for (const c of rawClients) clientMap[String(c.id)] = c;
    }

    // ── 5. Clientes nuevos en el período ───────────────────────────────────
    const { data: newClientsRaw } = await supabaseServer
      .from('clients')
      .select('id, name, client_owner, is_ads_lead, ads_campaign, created_at')
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`);
    const newClients = newClientsRaw || [];

    // ── 6. Construir pedidos enriquecidos + filtros opcionales ─────────────
    const itemsByOrder = {};
    for (const it of items) {
      const oid = String(it.order_id);
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }

    let enriched = orders.map((o) => ({
      ...o,
      client  : clientMap[String(o.client_id)] || null,
      items   : itemsByOrder[String(o.id)] || [],
    }));

    // Filtro cartera
    if (owner) enriched = enriched.filter((o) => o.client?.client_owner === owner);

    // Filtro por productos seleccionados
    if (productIdSet.size > 0) {
      enriched = enriched
        .map((o) => ({
          ...o,
          items: o.items.filter((it) => productIdSet.has(String(it.product_id))),
        }))
        .filter((o) => o.items.length > 0);
    }

    // ── 7. Agregaciones ────────────────────────────────────────────────────
    const granularity = getGranularity(from, to);

    // KPIs globales
    let totalRevenue = 0, totalCost = 0, totalUnits = 0;
    const uniqueClientSet = new Set();

    for (const o of enriched) {
      uniqueClientSet.add(o.client_id);
      const r = calcItems(o.items, productMap);
      totalRevenue += r.revenue;
      totalCost    += r.cost;
      totalUnits   += r.units;
    }

    const totalOrders  = enriched.length;
    const grossProfit  = totalRevenue - totalCost;
    const margin       = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
    const avgTicket    = totalOrders  > 0 ? totalRevenue / totalOrders : 0;

    const kpis = {
      totalRevenue, totalOrders, avgTicket,
      totalUnits, uniqueClients: uniqueClientSet.size,
      totalCost, grossProfit, margin,
    };

    // Serie temporal
    const timeMap = {};
    for (const o of enriched) {
      const key = periodKey(o.delivery_date, granularity);
      if (!timeMap[key]) timeMap[key] = { date: key, revenue: 0, profit: 0, orders: 0 };
      const r = calcItems(o.items, productMap);
      timeMap[key].revenue += r.revenue;
      timeMap[key].profit  += r.profit;
      timeMap[key].orders  += 1;
    }
    const timeSeries = Object.values(timeMap).sort((a, b) => a.date.localeCompare(b.date));

    // Productos
    const prodAgg = {};
    for (const o of enriched) {
      for (const it of o.items) {
        const pid  = String(it.product_id);
        const prod = productMap[pid];
        if (!prodAgg[pid]) {
          prodAgg[pid] = {
            productId: pid,
            name    : prod?.name     || it.name || '—',
            sku     : prod?.sku      || '—',
            category: prod?.category || '—',
            qty: 0, revenue: 0, cost: 0, profit: 0,
          };
        }
        const subtotal = num(it.subtotal);
        const qty      = num(it.qty);
        const unitCost = num(prod?.cost);
        prodAgg[pid].qty     += qty;
        prodAgg[pid].revenue += subtotal;
        prodAgg[pid].cost    += qty * unitCost;
        prodAgg[pid].profit  += subtotal - qty * unitCost;
      }
    }
    const products = Object.values(prodAgg)
      .map((p) => ({ ...p, margin: p.revenue > 0 ? p.profit / p.revenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // Top clientes
    const clientAgg = {};
    for (const o of enriched) {
      const cid = String(o.client_id);
      if (!clientAgg[cid]) {
        clientAgg[cid] = {
          clientId: cid,
          name    : o.client?.name || o.client_name || '—',
          owner   : o.client?.client_owner || '—',
          orders  : 0, revenue: 0, cost: 0, profit: 0, units: 0,
        };
      }
      clientAgg[cid].orders += 1;
      const r = calcItems(o.items, productMap);
      clientAgg[cid].revenue += r.revenue;
      clientAgg[cid].cost    += r.cost;
      clientAgg[cid].profit  += r.profit;
      clientAgg[cid].units   += r.units;
    }
    const topClients = Object.values(clientAgg)
      .map((c) => ({ ...c, margin: c.revenue > 0 ? c.profit / c.revenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Cartera
    const carteraAgg = {};
    for (const o of enriched) {
      const co = o.client?.client_owner || 'sin cartera';
      if (!carteraAgg[co]) carteraAgg[co] = { owner: co, orders: 0, revenue: 0, cost: 0, profit: 0 };
      carteraAgg[co].orders += 1;
      const r = calcItems(o.items, productMap);
      carteraAgg[co].revenue += r.revenue;
      carteraAgg[co].cost    += r.cost;
      carteraAgg[co].profit  += r.profit;
    }
    const carteraBreakdown = Object.values(carteraAgg).map((c) => ({
      ...c, margin: c.revenue > 0 ? c.profit / c.revenue : 0,
    }));

    // Geo
    const zonaAgg = {}, ciudadAgg = {};
    for (const o of enriched) {
      const z  = o.client?.zona   || '—';
      const ci = o.client?.ciudad || '—';
      if (!zonaAgg[z])    zonaAgg[z]    = { zona: z,    orders: 0, revenue: 0, profit: 0 };
      if (!ciudadAgg[ci]) ciudadAgg[ci] = { ciudad: ci, orders: 0, revenue: 0, profit: 0 };
      const r = calcItems(o.items, productMap);
      zonaAgg[z].orders    += 1; zonaAgg[z].revenue    += r.revenue; zonaAgg[z].profit    += r.profit;
      ciudadAgg[ci].orders += 1; ciudadAgg[ci].revenue += r.revenue; ciudadAgg[ci].profit += r.profit;
    }
    const geo = {
      byZona  : Object.values(zonaAgg).sort((a, b) => b.revenue - a.revenue),
      byCiudad: Object.values(ciudadAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 15),
    };

    // Ads
    const adsOrders = enriched.filter((o) => o.client?.is_ads_lead);
    const adsBuyerSet = new Set(adsOrders.map((o) => o.client_id));
    let adsRevenue = 0, adsCost = 0;
    for (const o of adsOrders) {
      const r = calcItems(o.items, productMap);
      adsRevenue += r.revenue;
      adsCost    += r.cost;
    }

    const newAdsLeads = newClients.filter((c) => c.is_ads_lead);

    const campaignAgg = {};
    for (const o of adsOrders) {
      const cam = o.client?.ads_campaign || 'Sin campaña';
      if (!campaignAgg[cam]) campaignAgg[cam] = { campaign: cam, orders: 0, buyers: new Set(), revenue: 0, profit: 0 };
      const r = calcItems(o.items, productMap);
      campaignAgg[cam].orders += 1;
      campaignAgg[cam].buyers.add(o.client_id);
      campaignAgg[cam].revenue += r.revenue;
      campaignAgg[cam].profit  += r.profit;
    }
    const adsCampaigns = Object.values(campaignAgg).map((c) => ({
      campaign: c.campaign,
      orders  : c.orders,
      buyers  : c.buyers.size,
      revenue : c.revenue,
      profit  : c.profit,
      avgTicket: c.orders > 0 ? c.revenue / c.orders : 0,
      margin  : c.revenue > 0 ? c.profit / c.revenue : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    const ads = {
      totalAdsOrders     : adsOrders.length,
      adsBuyers          : adsBuyerSet.size,
      newAdsLeadsInPeriod: newAdsLeads.length,
      conversionRate     : newAdsLeads.length > 0 ? adsBuyerSet.size / newAdsLeads.length : 0,
      revenue            : adsRevenue,
      profit             : adsRevenue - adsCost,
      avgTicket          : adsOrders.length > 0 ? adsRevenue / adsOrders.length : 0,
      campaigns          : adsCampaigns,
    };

    // B2B vs B2C (clientes únicos con pedido en el período)
    const clientTypeAgg = { b2b: { count: 0, revenue: 0, profit: 0 }, b2c: { count: 0, revenue: 0, profit: 0 } };
    for (const [cid, agg] of Object.entries(clientAgg)) {
      const type = (clientMap[cid]?.client_type || 'b2c').toLowerCase();
      const bucket = clientTypeAgg[type] || clientTypeAgg.b2c;
      bucket.count   += 1;
      bucket.revenue += agg.revenue;
      bucket.profit  += agg.profit;
    }
    const clientTypeBreakdown = [
      { type: 'B2B', ...clientTypeAgg.b2b },
      { type: 'B2C', ...clientTypeAgg.b2c },
    ];

    // Clientes nuevos
    const newClientIds = new Set(newClients.map((c) => String(c.id)));
    const newClientOrders = enriched.filter((o) => newClientIds.has(String(o.client_id)));
    let ncRevenue = 0, ncCost = 0;
    const ncBuyerSet = new Set();
    for (const o of newClientOrders) {
      const r = calcItems(o.items, productMap);
      ncRevenue += r.revenue;
      ncCost    += r.cost;
      ncBuyerSet.add(o.client_id);
    }

    const newClientsData = {
      count      : newClients.length,
      withPurchase: ncBuyerSet.size,
      revenue    : ncRevenue,
      profit     : ncRevenue - ncCost,
    };

    return res.json({
      meta: { from, to, granularity, totalOrders: orders.length },
      kpis,
      timeSeries,
      products,
      topClients,
      carteraBreakdown,
      geo,
      clientTypeBreakdown,
      ads,
      newClients: newClientsData,
    });
  } catch (e) {
    console.error('GET /api/analytics', e);
    return res.status(500).json({ error: e.message || 'Error interno' });
  }
}
