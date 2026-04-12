// /pages/analytics.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '../components/Layout';
import DateInput from '../components/DateInput';
import KpiCard from '../components/Analytics/KpiCard';
import axiosClient from '../config/axios';
import { getCurrentUser, isAdmin, can } from '../helpers/permissions';
import {
  TrendingUp, ShoppingCart, Users, Package,
  DollarSign, BarChart2, Percent, Target, MapPin, Save, Check,
} from 'lucide-react';

const SalesChart    = dynamic(() => import('../components/Analytics/SalesChart'), { ssr: false });
const ClientPieChart = dynamic(() => import('../components/Analytics/ClientPieChart'), { ssr: false });

// ── Formatters ─────────────────────────────────────────────────────────────
const CLP     = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const fmtPct  = (v) => `${((v || 0) * 100).toFixed(1)}%`;
const fmtNum  = (v) => new Intl.NumberFormat('es-CL').format(v || 0);

// ── Helpers de fecha ───────────────────────────────────────────────────────
const toYMD = (d) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};
const todayYMD = () => toYMD(new Date());
const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay() || 7; // lunes=1 … domingo=7
  d.setDate(d.getDate() - day + 1);
  return toYMD(d);
};
const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

// ── Componentes internos ───────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-coffee mb-3 border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  );
}

function SortableTable({ columns, rows, defaultSort, defaultDir = 'desc', maxRows }) {
  const [sortKey, setSortKey] = useState(defaultSort || columns[0]?.key);
  const [dir, setDir]         = useState(defaultDir);

  const sorted = useMemo(() => {
    const copy = [...(rows || [])];
    copy.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number') return dir === 'asc' ? av - bv : bv - av;
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return maxRows ? copy.slice(0, maxRows) : copy;
  }, [rows, sortKey, dir, maxRows]);

  const toggle = (key) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir('desc'); }
  };

  if (!rows?.length) return <p className="text-sm text-gray-400 py-4 text-center">Sin datos.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full w-full">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggle(col.key)}
                className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 cursor-pointer hover:text-coffee select-none whitespace-nowrap"
              >
                {col.label}
                {sortKey === col.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5 text-sm text-coffee whitespace-nowrap">
                  {col.format ? col.format(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FILTERS_KEY = 'analytics.filters.v1';

// ── Página principal ───────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const me = useMemo(() => getCurrentUser(), []);
  const canView = isAdmin(me) || can('analytics.view', null, me);

  // Filtros fecha
  const [quickRange, setQuickRange] = useState('month'); // 'today' | 'week' | 'month' | 'range'
  const [from,       setFrom]       = useState(startOfMonth);
  const [to,         setTo]         = useState(todayYMD);

  // Filtros cartera + productos
  const [owner,            setOwner]            = useState('');
  const [selectedProducts, setSelectedProducts] = useState(new Set()); // Set de IDs (string)
  const [productList,      setProductList]      = useState([]);
  const [prodDropOpen,     setProdDropOpen]      = useState(false);
  const prodDropRef = useRef(null);

  // Persistencia de filtros
  const [savedFilters, setSavedFilters] = useState(null);
  const [justSaved,    setJustSaved]    = useState(false);
  const baselineSet = useRef(false);

  // Cargar filtros guardados al montar
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(FILTERS_KEY) : null;
      if (raw) {
        const f = JSON.parse(raw);
        if (f && typeof f === 'object') {
          if (f.quickRange) setQuickRange(f.quickRange);
          if (f.from)       setFrom(f.from);
          if (f.to)         setTo(f.to);
          if (f.owner !== undefined) setOwner(f.owner);
          if (Array.isArray(f.productIds)) setSelectedProducts(new Set(f.productIds));
          setSavedFilters(f);
          baselineSet.current = true;
        }
      }
    } catch (e) {
      console.warn('No se pudieron cargar filtros de Analytics', e);
    }
  }, []);

  // Sincronizar fechas cuando cambia el preset
  useEffect(() => {
    if (quickRange === 'today') {
      const t = todayYMD();
      setFrom(t); setTo(t);
    } else if (quickRange === 'week') {
      setFrom(startOfWeek()); setTo(todayYMD());
    } else if (quickRange === 'month') {
      setFrom(startOfMonth()); setTo(todayYMD());
    } else if (quickRange === 'year') {
      setFrom(startOfYear()); setTo(todayYMD());
    }
    // 'range': el usuario ajustó las fechas manualmente, no sobreescribir
  }, [quickRange]);

  // Cargar lista de productos
  useEffect(() => {
    axiosClient.get('products').then((r) => {
      const list = (r.data?.products || r.data || []).map((p) => ({
        id: String(p.id), name: p.name, sku: p.sku,
      }));
      setProductList(list);
    }).catch(() => {});
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (prodDropRef.current && !prodDropRef.current.contains(e.target)) {
        setProdDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleProduct = (id) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const prodLabel = selectedProducts.size === 0
    ? 'Todos los productos'
    : `${selectedProducts.size} producto${selectedProducts.size > 1 ? 's' : ''} seleccionado${selectedProducts.size > 1 ? 's' : ''}`;

  // Snapshot del estado actual de filtros (serializable)
  const currentFilters = useMemo(() => ({
    quickRange,
    from,
    to,
    owner,
    productIds: [...selectedProducts],
  }), [quickRange, from, to, owner, selectedProducts]);

  // Establecer baseline la primera vez que hay fechas (si no se cargó de storage)
  useEffect(() => {
    if (baselineSet.current) return;
    if (!from || !to) return;
    setSavedFilters({ ...currentFilters });
    baselineSet.current = true;
  }, [from, to, currentFilters]);

  const isDirty = useMemo(() => {
    if (!savedFilters) return true;
    try {
      return JSON.stringify(savedFilters) !== JSON.stringify(currentFilters);
    } catch { return true; }
  }, [savedFilters, currentFilters]);

  const saveFilters = useCallback(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(currentFilters));
      setSavedFilters(currentFilters);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch {
      alert('No se pudieron guardar los filtros.');
    }
  }, [currentFilters]);

  // Data
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const fetch = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      setError('');
      const params = { from, to };
      if (owner) params.owner = owner;
      if (selectedProducts.size > 0) params.productIds = [...selectedProducts].join(',');
      const res = await axiosClient.get('analytics', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Error al cargar datos.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, owner, selectedProducts, canView]);

  useEffect(() => { fetch(); }, [fetch]);

  if (!canView) {
    return (
      <Layout>
        <p className="mt-12 text-center text-rose-600">Acceso restringido.</p>
      </Layout>
    );
  }

  const kpis          = data?.kpis;
  const timeSeries    = data?.timeSeries    || [];
  const products      = data?.products      || [];
  const topClients        = data?.topClients          || [];
  const cartera           = data?.carteraBreakdown    || [];
  const geo               = data?.geo                 || {};
  const clientTypeBreakdown = data?.clientTypeBreakdown || [];
  const ads               = data?.ads;
  const newCli        = data?.newClients;
  const granularity   = data?.meta?.granularity || 'day';

  // ── Product columns ────────────────────────────────────────────────────
  const prodCols = [
    { key: 'name',     label: 'Producto' },
    { key: 'category', label: 'Categoría' },
    { key: 'qty',      label: 'Unidades',  format: fmtNum },
    { key: 'revenue',  label: 'Ingresos',  format: (v) => CLP.format(v) },
    { key: 'cost',     label: 'Costo',     format: (v) => CLP.format(v) },
    { key: 'profit',   label: 'Utilidad',  format: (v) => CLP.format(v) },
    { key: 'margin',   label: 'Margen',    format: fmtPct },
  ];

  const clientCols = [
    { key: 'name',    label: 'Cliente' },
    { key: 'owner',   label: 'Cartera' },
    { key: 'orders',  label: 'Pedidos',   format: fmtNum },
    { key: 'units',   label: 'Unidades',  format: fmtNum },
    { key: 'revenue', label: 'Total',     format: (v) => CLP.format(v) },
    { key: 'profit',  label: 'Utilidad',  format: (v) => CLP.format(v) },
    { key: 'margin',  label: 'Margen',    format: fmtPct },
  ];

  const ciudadCols = [
    { key: 'ciudad',  label: 'Ciudad' },
    { key: 'orders',  label: 'Pedidos',  format: fmtNum },
    { key: 'revenue', label: 'Ingresos', format: (v) => CLP.format(v) },
    { key: 'profit',  label: 'Utilidad', format: (v) => CLP.format(v) },
  ];

  const campaignCols = [
    { key: 'campaign', label: 'Campaña' },
    { key: 'buyers',   label: 'Compradores', format: fmtNum },
    { key: 'orders',   label: 'Pedidos',     format: fmtNum },
    { key: 'revenue',  label: 'Ingresos',    format: (v) => CLP.format(v) },
    { key: 'profit',   label: 'Utilidad',    format: (v) => CLP.format(v) },
    { key: 'avgTicket',label: 'Ticket Prom', format: (v) => CLP.format(v) },
    { key: 'margin',   label: 'Margen',      format: fmtPct },
  ];

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={28} className="text-brand-600" />
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Analytics <span className="text-brand-600">Comercial</span>
        </h1>
      </div>

      {/* ── Filtros ──
           móvil  : 3 filas  (presets full-width / fechas / cartera+productos)
           tablet : 2 filas  (presets full-width / resto inline)
           desktop: 1 fila   (todo inline, sin wrap)
      ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap lg:flex-nowrap gap-3 items-end">

          {/* Presets: fila propia en móvil y tablet, inline en desktop */}
          <div className="w-full lg:w-auto flex rounded-lg border border-gray-300 overflow-hidden text-sm divide-x divide-gray-300 shrink-0">
            {[
              { key: 'today', label: 'Hoy' },
              { key: 'week',  label: 'Semana' },
              { key: 'month', label: 'Mes' },
              { key: 'year',  label: 'Año' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuickRange(key)}
                className={`py-2 flex-1 lg:flex-none lg:px-4 text-center font-medium transition ${
                  quickRange === key
                    ? 'bg-gray-900 text-white'
                    : 'bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Fechas: fila propia en móvil (w-full), inline en tablet+ */}
          <div className="flex gap-3 items-end w-full sm:w-auto">
            <div className="flex-1 sm:flex-none">
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <DateInput
                value={from}
                onChange={(e) => { setQuickRange('range'); setFrom(e.target.value); }}
                className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div className="flex-1 sm:flex-none">
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <DateInput
                value={to}
                onChange={(e) => { setQuickRange('range'); setTo(e.target.value); }}
                className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Cartera: fila 3 en móvil, inline en tablet+ */}
          <div className="shrink-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cartera</label>
            <select
              value={owner} onChange={(e) => setOwner(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            >
              <option value="">Todas</option>
              <option value="rucapellan">Rucapellán</option>
              <option value="cecil">Cecil</option>
            </select>
          </div>

          {/* Productos: fila 3 en móvil (flex-1 para ocupar el resto), inline en tablet+ */}
          <div className="relative flex-1 lg:flex-none min-w-0" ref={prodDropRef}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Productos</label>
            <button
              type="button"
              onClick={() => setProdDropOpen((v) => !v)}
              className="w-full lg:w-auto lg:min-w-[200px] flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm hover:bg-gray-50 text-left"
            >
              <span className="flex-1 truncate text-gray-700">{prodLabel}</span>
              <span className="text-gray-400 text-xs shrink-0">{prodDropOpen ? '▲' : '▼'}</span>
            </button>

            {prodDropOpen && (
              <div className="absolute z-50 mt-1 left-0 w-72 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {selectedProducts.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedProducts(new Set())}
                    className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 border-b border-gray-100"
                  >
                    Limpiar selección
                  </button>
                )}
                {productList.length === 0 && (
                  <p className="px-3 py-3 text-sm text-gray-400">Cargando productos…</p>
                )}
                {productList.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="accent-gray-900"
                    />
                    <span className="flex-1 text-coffee">{p.name}</span>
                    {p.sku && <span className="text-xs text-gray-400">{p.sku}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Guardar filtros */}
          <div className="ml-auto flex items-center gap-2 self-end shrink-0">
            {justSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <Check size={14} /> Guardado
              </span>
            )}
            {isDirty && (
              <button
                type="button"
                onClick={saveFilters}
                title="Guardar filtros por defecto"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                <Save size={15} /> Guardar
              </button>
            )}
          </div>

        </div>
      </div>

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── KPIs ── */}
          <Section title="Resumen del período">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard title="Ventas totales"  value={CLP.format(kpis?.totalRevenue || 0)} icon={DollarSign} color="blue" />
              <KpiCard title="Utilidad bruta"  value={CLP.format(kpis?.grossProfit  || 0)} icon={TrendingUp} color="emerald" />
              <KpiCard title="Margen"           value={fmtPct(kpis?.margin)}                icon={Percent}    color="violet" />
              <KpiCard title="Ticket promedio"  value={CLP.format(kpis?.avgTicket    || 0)} icon={BarChart2}  color="sky" />
              <KpiCard title="Pedidos"          value={fmtNum(kpis?.totalOrders)}           icon={ShoppingCart} color="amber" />
              <KpiCard title="Unidades vendidas" value={fmtNum(kpis?.totalUnits)}           icon={Package}    color="rose" />
              <KpiCard title="Clientes únicos"  value={fmtNum(kpis?.uniqueClients)}         icon={Users}      color="blue" />
              <KpiCard title="Costo total"      value={CLP.format(kpis?.totalCost   || 0)} icon={DollarSign} color="amber" />
            </div>
          </Section>

          {/* ── Time Series ── */}
          <Section title="Ventas y utilidad en el tiempo">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SalesChart data={timeSeries} granularity={granularity} />
            </div>
          </Section>

          {/* ── Cartera ── */}
          {cartera.length > 0 && (
            <Section title="Comparativa por cartera">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cartera.map((c) => (
                  <div key={c.owner} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">{c.owner}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-coffee">{fmtNum(c.orders)}</p>
                        <p className="text-xs text-gray-400">Pedidos</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-600">{CLP.format(c.revenue)}</p>
                        <p className="text-xs text-gray-400">Ventas</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{CLP.format(c.profit)}</p>
                        <p className="text-xs text-gray-400">Utilidad</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>Margen</span>
                        <span className="font-medium">{fmtPct(c.margin)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min((c.margin || 0) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Top Productos ── */}
          <Section title="Productos">
            <SortableTable columns={prodCols} rows={products} defaultSort="revenue" maxRows={20} />
          </Section>

          {/* ── Top Clientes ── */}
          <Section title="Top 10 clientes">
            <SortableTable columns={clientCols} rows={topClients} defaultSort="revenue" maxRows={10} />
          </Section>

          {/* ── B2B vs B2C ── */}
          {clientTypeBreakdown.some((c) => c.count > 0) && (
            <Section title="Clientes B2B vs B2C">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <ClientPieChart data={clientTypeBreakdown} />
                <div className="space-y-3">
                  {clientTypeBreakdown.map((c) => (
                    <div key={c.type} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{c.type}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-coffee">{fmtNum(c.count)}</p>
                          <p className="text-xs text-gray-400">Clientes</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-coffee">{CLP.format(c.revenue)}</p>
                          <p className="text-xs text-gray-400">Ingresos</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-coffee">{CLP.format(c.profit)}</p>
                          <p className="text-xs text-gray-400">Utilidad</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* ── Geo ── */}
          {(geo.byCiudad?.length > 0) && (
            <Section title="Análisis geográfico por ciudad">
              <SortableTable columns={ciudadCols} rows={geo.byCiudad || []} defaultSort="revenue" />
            </Section>
          )}

          {/* ── Clientes Nuevos ── */}
          {newCli && (
            <Section title="Clientes nuevos en el período">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard title="Clientes creados"   value={fmtNum(newCli.count)}        icon={Users}      color="blue" />
                <KpiCard title="Con primera compra" value={fmtNum(newCli.withPurchase)} icon={ShoppingCart} color="emerald" />
                <KpiCard title="Ingresos"           value={CLP.format(newCli.revenue)}  icon={DollarSign} color="violet" />
                <KpiCard title="Utilidad"           value={CLP.format(newCli.profit)}   icon={TrendingUp} color="sky" />
              </div>
            </Section>
          )}

          {/* ── Ads Performance ── */}
          {ads && (ads.adsBuyers > 0 || ads.newAdsLeadsInPeriod > 0) && (
            <Section title="Rendimiento Ads Leads">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <KpiCard title="Leads nuevos"     value={fmtNum(ads.newAdsLeadsInPeriod)} icon={Target}     color="violet" />
                <KpiCard title="Compraron"        value={fmtNum(ads.adsBuyers)}           icon={ShoppingCart} color="emerald" />
                <KpiCard title="Conversión"       value={fmtPct(ads.conversionRate)}      icon={Percent}    color="amber" />
                <KpiCard title="Ingresos ads"     value={CLP.format(ads.revenue)}         icon={DollarSign} color="blue" />
                <KpiCard title="Utilidad ads"     value={CLP.format(ads.profit)}          icon={TrendingUp} color="emerald" />
                <KpiCard title="Ticket prom. ads" value={CLP.format(ads.avgTicket)}       icon={BarChart2}  color="sky" />
                <KpiCard title="Total pedidos ads" value={fmtNum(ads.totalAdsOrders)}    icon={Package}    color="rose" />
              </div>
              {ads.campaigns?.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por campaña</p>
                  <SortableTable columns={campaignCols} rows={ads.campaigns} defaultSort="revenue" />
                </>
              )}
            </Section>
          )}
        </>
      )}

      {!loading && !data && !error && (
        <p className="text-center text-gray-400 mt-12 text-sm">Selecciona un período para ver los datos.</p>
      )}
    </Layout>
  );
}
