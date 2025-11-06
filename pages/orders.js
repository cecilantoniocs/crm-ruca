// pages/orders.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  PackagePlus,
  Calendar,
  CalendarRange,
  Navigation,
  MoreVertical,
  Trash2,
  Pencil,
  User,
  ExternalLink,
} from 'lucide-react';
import { getCurrentSeller, getClients } from '../helpers';
import PullToRefreshHeader from '../components/PullToRefreshHeader';
import usePullToRefreshWindow from '../hooks/usePullToRefreshWindow';

// --- helpers ---
const statusToString = (val) => {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim().toLowerCase();
  if (typeof val === 'object') {
    if ('value' in val) return String(val.value).trim().toLowerCase();
    if ('label' in val) return String(val.label).trim().toLowerCase();
  }
  return String(val).trim().toLowerCase();
};

const StatusBadge = ({ value }) => {
  const v = statusToString(value);
  const labelMap = { pendiente: 'Pendiente', entregado: 'Entregado', cancelado: 'Cancelado' };
  const styleMap = {
    pendiente: 'bg-rose-50 text-rose-700 ring-rose-200',
    entregado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    cancelado: 'bg-amber-50 text-amber-700 ring-amber-200',
  };
  const cls = styleMap[v] || 'bg-gray-50 text-coffee ring-gray-200';
  const label = labelMap[v] || (typeof value === 'string' ? value : '—');
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
};

const paymentToString = (val) => {
  if (!val) return 'efectivo';
  const v = String(val).trim().toLowerCase();
  if (v === 'transferencia') return 'transferencia';
  if (v === 'cheque') return 'cheque';
  return 'efectivo';
};

const nextPayment = (val) => {
  const order = ['efectivo', 'transferencia', 'cheque'];
  const cur = paymentToString(val);
  const idx = order.indexOf(cur);
  return order[(idx + 1) % order.length];
};

const PaymentBadge = ({ value }) => {
  const v = paymentToString(value);
  const label = v === 'transferencia' ? 'Transferencia' : v === 'cheque' ? 'Cheque' : 'Efectivo';
  const cls =
    v === 'transferencia'
      ? 'bg-brand-50 text-brand-700 ring-brand-200'
      : v === 'cheque'
      ? 'bg-gray-50 text-gray-700 ring-gray-200'
      : 'bg-sky-50 text-sky-700 ring-sky-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
};

// ---------- Fechas (idéntico a sales) ----------
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

// YYYY-MM-DD en hora local (evita desfases)
const toYMDLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

//  dd/mm/yyyy (desktop)
const fmtDateDMY = (isoOrYmd) => {
  if (!isoOrYmd) return '—';
  const s = String(isoOrYmd).slice(0, 10);
  const [yyyy, mm, dd] = s.split('-');
  if (!yyyy || !mm || !dd) return '—';
  return `${dd}/${mm}/${yyyy}`;
};

//  "d mes yyyy" (móvil)
const fmtDateMobile = (isoOrYmd) => {
  if (!isoOrYmd) return '—';
  const s = String(isoOrYmd).slice(0, 10);
  const [yyyy, mm, dd] = s.split('-').map((x) => x && x.padStart(2, '0'));
  if (!yyyy || !mm || !dd) return '—';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const mIdx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${Number(dd)} ${meses[mIdx]} ${yyyy}`;
};

// Mostrar número de pedido (#0001)
const formatOrderNo = (n) => {
  const num = Number(n);
  if (Number.isFinite(num) && num >= 0) return `#${String(num).padStart(4, '0')}`;
  return null;
};
const shortFromUUID = (id) => (id ? `#${String(id).replace(/-/g, '').slice(0, 4).toUpperCase()}` : '#—');
const getOrderCode = (o) =>
  formatOrderNo(o?.order_no ?? o?.orderNumber ?? o?.number ?? o?.seq) || shortFromUUID(o?.id);

export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]); // para dirección
  const [couriers, setCouriers] = useState([]); // usuarios que pueden repartir
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // filtro por estado (por defecto Pendiente)
  const [statusFilter, setStatusFilter] = useState('pendiente');

  // ---- filtros de fecha (misma barra/flujo que sales.js) ----
  const [quickRange, setQuickRange] = useState('today'); // 'today' | 'week' | 'month' | 'range'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Menús desktop
  const [openMenuId, setOpenMenuId] = useState(null);       // ⋯ acciones
  const [openStatusId, setOpenStatusId] = useState(null);   // cambiar estado
  const [openPaymentId, setOpenPaymentId] = useState(null); // cambiar pago
  const [openCourierId, setOpenCourierId] = useState(null); // cambiar repartidor

  // Swipe mobile
  const touchStart = useRef({});
  const [swipeX, setSwipeX] = useState({});

  // debounce buscador
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // cerrar menús al click afuera
  useEffect(() => {
    const close = () => {
      setOpenMenuId(null);
      setOpenStatusId(null);
      setOpenPaymentId(null);
      setOpenCourierId(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // ✅ Refetch resiliente
  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const resO = await axiosClient.get('orders');
      const list = resO?.data ?? [];
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setOrders(list);
    } catch (e) {
      console.error('Error cargando pedidos:', e);
      setOrders([]);
      setLoadError('Error al cargar pedidos.');
      setLoading(false);
      return;
    }

    try {
      const resCour = await axiosClient.get('couriers');
      setCouriers(resCour?.data ?? []);
    } catch {
      setCouriers([]);
    }

    try {
      const seller = getCurrentSeller?.();
      if (seller?.id) {
        const resC = await getClients(seller.id);
        setClients(resC?.data ?? []);
      } else {
        setClients([]);
      }
    } catch {
      setClients([]);
    }

    setLoading(false);
  }, []);

  // inicializar + refrescar
  useEffect(() => { refetch(); }, [refetch]);

  // Rango auto (igual que sales.js)
  useEffect(() => {
    if (quickRange === 'range') return;
    const now = new Date();
    let start;
    let end = endOfDay(now);

    if (quickRange === 'today') {
      start = startOfDay(now);
    } else if (quickRange === 'week') {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // lunes
      const monday = new Date(d);
      monday.setDate(d.getDate() - day);
      start = startOfDay(monday);
    } else {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      start = startOfDay(first);
    }

    setFromDate(toYMDLocal(start));
    setToDate(toYMDLocal(end));
  }, [quickRange]);

  // mapas
  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const courierName = useMemo(() => {
    const m = new Map();
    for (const u of couriers) m.set(u.id, u.name || u.email || 'Usuario');
    return (id) => (id ? m.get(id) || '—' : '—');
  }, [couriers]);

  const CLP = useMemo(() => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }), []);

  const mapsUrl = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`;

  const isLong = (s, n = 20) => (s || '').trim().length > n;

  // filtrado
  const filtered = useMemo(() => {
    const inDateRange = (o) => {
      const d = String(o.deliveryDate || '').slice(0, 10);
      if (!d) return true;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    const bySearch = (o) => {
      if (!debounced) return true;
      const client = (o.clientName || '').toLowerCase();
      const local = (o.clientLocal || '').toLowerCase();
      const status = statusToString(o.status);
      const address = (clientMap.get(o.clientId)?.dir1 || '').toLowerCase();
      const pay = paymentToString(o.paymentMethod);
      const courier = courierName(o.deliveredBy).toLowerCase();
      const code = getOrderCode(o).toLowerCase();
      return (
        client.includes(debounced) ||
        local.includes(debounced) ||
        status.includes(debounced) ||
        address.includes(debounced) ||
        pay.includes(debounced) ||
        courier.includes(debounced) ||
        code.includes(debounced)
      );
    };

    const byStatus = (o) => {
      if (statusFilter === 'todos') return true;
      return statusToString(o.status) === statusFilter;
    };

    return orders.filter((o) => inDateRange(o) && bySearch(o) && byStatus(o));
  }, [orders, debounced, clientMap, statusFilter, courierName, fromDate, toDate]);

  const stop = (e) => e.stopPropagation();

  // --- acciones ---
  const applyLocal = (id, patch) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const handleDelete = async (id) => {
    const ok = window.confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await axiosClient.delete(`orders/${id}`);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar el pedido.');
    }
  };

  const handleEdit = (id) => router.push({ pathname: '/editorder/[id]', query: { id } });

  const updateStatus = async (id, newStatus) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    applyLocal(id, { status: newStatus });
    try {
      await axiosClient.patch(`orders/${id}`, { status: newStatus });
    } catch (e) {
      console.error(e);
      applyLocal(id, { status: prev.status });
      alert('No se pudo actualizar el estado.');
    }
  };

  const updatePayment = async (id, newMethod) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    applyLocal(id, { paymentMethod: newMethod });
    try {
      await axiosClient.patch(`orders/${id}`, { paymentMethod: newMethod });
    } catch (e) {
      console.error(e);
      applyLocal(id, { paymentMethod: prev.paymentMethod });
    }
  };

  const updateCourier = async (id, deliveredBy) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    applyLocal(id, { deliveredBy });
    try {
      await axiosClient.patch(`orders/${id}`, { deliveredBy: deliveredBy || null });
    } catch (e) {
      console.error(e);
      applyLocal(id, { deliveredBy: prev.deliveredBy || null });
      alert('No se pudo actualizar el repartidor.');
    }
  };

  // swipe (umbral más largo)
  const onTouchStart = (id) => (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStart.current[id] = { x: t.clientX, y: t.clientY };
    setSwipeX((s) => ({ ...s, [id]: 0 }));
  };
  const onTouchMove = (id) => (e) => {
    const start = touchStart.current[id];
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault?.();
    if (Math.abs(dy) > 40) return;
    const clamped = Math.max(-200, Math.min(200, dx));
    setSwipeX((s) => ({ ...s, [id]: clamped }));
  };
  const onTouchEnd = (id) => (e) => {
    const start = touchStart.current[id];
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const THRESH = 160;
    if (Math.abs(dx) > THRESH && Math.abs(dy) < 40) {
      if (dx < 0) updateStatus(id, 'entregado');
      else updateStatus(id, 'pendiente');
    }
    setSwipeX((s) => ({ ...s, [id]: 0 }));
    delete touchStart.current[id];
  };

  const pillClass = (active) =>
    `px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition ${
      active ? 'bg-white text-brand-600 shadow' : 'text-gray-600 hover:text-coffee'
    }`;

  const { headerProps } = usePullToRefreshWindow({ onRefresh: refetch, threshold: 60 });

  const goClientAccount = (clientId) => {
    if (!clientId) return;
    router.push(`/client/${clientId}/account`);
  };

  return (
    <Layout>
      <PullToRefreshHeader {...headerProps} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Gestión de <span className="text-brand-600">Pedidos</span>
        </h1>

        <button
          onClick={() => router.push('/neworder')}
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium shadow hover:bg-brand-700 active:scale-95 transition"
        >
          <PackagePlus size={18} />
          Nuevo Pedido
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4">
        {/* Fila 1: Buscador (más ancho en desktop) */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div className="col-span-2 sm:mr-3">
            <div className="relative w-full sm:w-[480px] sm:flex-none">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por #, cliente, local, dirección, estado, pago o repartidor…"
                className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Fila 2: Estado + Rápidos + Fechas (misma línea en desktop) */}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          {/* Estado: full en móvil, compacto en desktop */}
          <div className="col-span-2 sm:mr-3 w-full sm:w-auto">
            <div className="rounded-lg bg-gray-100 p-1 shadow-inner w-full sm:w-auto">
              <div className="grid grid-cols-3 gap-1 w-full sm:w-auto sm:flex">
                <button
                  type="button"
                  className={`${pillClass(statusFilter === 'todos')} flex-1 sm:flex-none`}
                  onClick={() => setStatusFilter('todos')}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`${pillClass(statusFilter === 'pendiente')} flex-1 sm:flex-none`}
                  onClick={() => setStatusFilter('pendiente')}
                >
                  Pendiente
                </button>
                <button
                  type="button"
                  className={`${pillClass(statusFilter === 'entregado')} flex-1 sm:flex-none`}
                  onClick={() => setStatusFilter('entregado')}
                >
                  Entregado
                </button>
              </div>
            </div>
          </div>

          {/* Rápidos (Hoy / Semana / Mes / Rango con ícono) */}
          <div className="col-span-2 sm:mr-3">
            <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'today' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('today')}
              >
                Hoy
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'week' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('week')}
              >
                Semana
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'month' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('month')}
              >
                Mes
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm flex-1 sm:flex-none flex items-center justify-center ${quickRange === 'range' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('range')}
                title="Rango"
              >
                <CalendarRange size={16} className="-mt-0.5" />
              </button>
            </div>
          </div>

          {/* Fechas (misma línea) */}
          <div className="sm:mr-3">
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-[90%] sm:w-[138px]"
              value={fromDate || ''}
              onChange={(e) => { setQuickRange('range'); setFromDate(e.target.value || ''); }}
            />
          </div>
          <div className="sm:mr-3">
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-[90%] sm:w-[138px]"
              value={toDate || ''}
              onChange={(e) => { setQuickRange('range'); setToDate(e.target.value || ''); }}
            />
          </div>
        </div>
      </div>

      {loading && <p className="text-gray-600">Cargando pedidos…</p>}
      {!loading && loadError && <p className="text-red-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">No hay pedidos que coincidan con la búsqueda.</p>
      )}

      {/* MOBILE: Cards */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="sm:hidden space-y-3 overflow-x-hidden">
          {filtered.map((o) => {
            const c = clientMap.get(o.clientId);
            const addr = c?.dir1 || '';
            const items = o.items ?? [];
            const delivered = statusToString(o.status) === 'entregado';
            const dx = swipeX[o.id] || 0;
            const orderCode = getOrderCode(o);

            const bgSwipe =
              dx < -100 ? 'bg-emerald-50 border-emerald-200' : delivered ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100';

            return (
              <div
                key={o.id}
                className={`relative rounded-xl p-3 border shadow ${bgSwipe} transition-colors touch-pan-y select-none`}
                onTouchStart={onTouchStart(o.id)}
                onTouchMove={onTouchMove(o.id)}
                onTouchEnd={onTouchEnd(o.id)}
                onTouchCancel={() => setSwipeX((s) => ({ ...s, [o.id]: 0 }))}
                style={{ transform: `translate3d(${dx}px, 0, 0)`, transition: 'transform 180ms ease' }}
              >
                {/* Número de pedido */}
                <div
                  className="absolute right-12 top-2 inline-flex items-center justify-center h-8 px-2 rounded-md bg-gray-900 text-white text-xs font-mono tracking-wider shadow ring-1 ring-black/10 select-none"
                  title="Número de pedido"
                >
                  {orderCode}
                </div>

                {/* lápiz editar */}
                <button
                  type="button"
                  onClick={() => handleEdit(o.id)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 active:scale-95 transition"
                  aria-label="Editar pedido"
                  title="Editar pedido"
                >
                  <Pencil size={16} />
                </button>

                {/* Local (negrita) + Cliente (chico) con acceso a cuenta */}
                <div className="pr-20">
                  <h3 className="text-base font-semibold text-coffee">{o.clientLocal || '—'}</h3>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-700">
                    <span className="truncate max-w-[60vw]">{o.clientName || '—'}</span>
                    {o.clientId && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded hover:bg-gray-100 p-1 text-gray-600"
                        title="Ver cuenta del cliente"
                        aria-label="Ver cuenta del cliente"
                        onClick={() => goClientAccount(o.clientId)}
                      >
                        <ExternalLink size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dirección + GPS (móvil) */}
                <div className="mt-2 flex items-start gap-2">
                  <p className="text-sm text-coffee flex-1">
                    <span className="font-medium text-coffee">Dirección: </span>
                    {addr || '—'}
                  </p>
                  {addr && (
                    <a
                      href={mapsUrl(addr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={stop}
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 shrink-0"
                      title="Abrir en Google Maps"
                      aria-label="Abrir en Google Maps"
                    >
                      <Navigation size={16} />
                    </a>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="text-sm text-coffee flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span>{fmtDateMobile(o.deliveryDate)}</span>
                  </div>
                  <div className="text-right">
                    <StatusBadge value={o.status} />
                  </div>
                </div>

                {/* Repartidor (selector) */}
                <div className="mt-2">
                  <label className="block text-xs text-gray-600 mb-1">Repartidor</label>
                  <select
                    value={o.deliveredBy || ''}
                    onChange={(e) => updateCourier(o.id, e.target.value || null)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="">— Sin asignar —</option>
                    {couriers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                {/* Ítems */}
                <div className="mt-3 rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <ul className="space-y-1 text-sm">
                    {items.length === 0 && <li className="text-gray-500">Sin productos</li>}
                    {items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-coffee">
                          {it.name || 'Producto'} × {it.qty}
                        </span>
                        <span className="text-coffee font-medium">
                          {CLP.format(Number(it.subtotal) || (Number(it.qty) * Number(it.price) || 0))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pago + Total */}
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    className="active:scale-95 transition"
                    onClick={() => updatePayment(o.id, nextPayment(o.paymentMethod))}
                    title="Cambiar método de pago"
                  >
                    <PaymentBadge value={o.paymentMethod} />
                  </button>

                  <div className="text-right text-base font-semibold text-coffee">
                    {CLP.format(Number(o.total) || 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DESKTOP: Tabla */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1240px] w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">N°</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Local</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Dirección</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Entrega</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Estado</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Pago</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Repartidor</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Ítems</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-right">Total</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {filtered.map((o, idx) => {
                    const c = clientMap.get(o.clientId);
                    const addr = c?.dir1 || '';
                    const items = o.items ?? [];
                    const longAddr = isLong(addr);
                    const longLocal = isLong(o.clientLocal);
                    const orderCode = getOrderCode(o);

                    return (
                      <React.Fragment key={o.id}>
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                          {/* N° */}
                          <td className="px-6 py-3 text-sm whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-900 text-white font-mono text-xs tracking-wider ring-1 ring-black/10">
                              {orderCode}
                            </span>
                          </td>

                          {/* Local en negrita */}
                          <td className="px-6 py-3 text-sm text-coffee">
                            <span
                              className="block font-semibold whitespace-normal break-words leading-tight"
                              style={
                                longLocal
                                  ? {
                                      width: '20ch',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }
                                  : {}
                              }
                              title={o.clientLocal || '—'}
                            >
                              {o.clientLocal || '—'}
                            </span>
                          </td>

                          {/* Cliente + acceso cuenta al lado */}
                          <td className="px-6 py-3 text-sm text-coffee">
                            <div className="inline-flex items-center gap-2">
                              <span className="leading-tight">{o.clientName || '—'}</span>
                              {o.clientId && (
                                <button
                                  type="button"
                                  onClick={() => goClientAccount(o.clientId)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 shrink-0"
                                  title="Ver cuenta del cliente"
                                  aria-label="Ver cuenta del cliente"
                                >
                                  <ExternalLink size={16} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Dirección + GPS */}
                          <td className="px-6 py-3 text-sm text-coffee">
                            <div className={`inline-flex ${longAddr ? 'items-start' : 'items-center'} gap-3`}>
                              <span
                                className="block whitespace-normal break-words leading-tight"
                                style={
                                  longAddr
                                    ? {
                                        width: '20ch',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                      }
                                    : {}
                                }
                                title={addr || '—'}
                              >
                                {addr || '—'}
                              </span>
                              {addr && (
                                <a
                                  href={mapsUrl(addr)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={stop}
                                  className={`inline-flex ${longAddr ? 'mt-0.5' : ''} h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 shrink-0`}
                                  title="Abrir en Google Maps"
                                  aria-label="Abrir en Google Maps"
                                >
                                  <Navigation size={14} />
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-3 text-sm text-coffee">{fmtDateDMY(o.deliveryDate)}</td>

                          {/* Estado editable */}
                          <td className="px-6 py-3 text-sm relative" onClick={stop}>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenStatusId((v) => (v === o.id ? null : o.id));
                                setOpenPaymentId(null);
                                setOpenMenuId(null);
                                setOpenCourierId(null);
                              }}
                              title="Cambiar estado"
                            >
                              <StatusBadge value={o.status} />
                            </button>

                            {openStatusId === o.id && (
                              <div className="absolute left-0 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenStatusId(null); updateStatus(o.id, 'pendiente'); }}>Pendiente</button>
                                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenStatusId(null); updateStatus(o.id, 'entregado'); }}>Entregado</button>
                              </div>
                            )}
                          </td>

                          {/* Pago editable */}
                          <td className="px-6 py-3 text-sm relative" onClick={stop}>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenPaymentId((v) => (v === o.id ? null : o.id));
                                setOpenStatusId(null);
                                setOpenMenuId(null);
                                setOpenCourierId(null);
                              }}
                              title="Cambiar método de pago"
                            >
                              <PaymentBadge value={o.paymentMethod} />
                            </button>

                            {openPaymentId === o.id && (
                              <div className="absolute left-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenPaymentId(null); updatePayment(o.id, 'efectivo'); }}>Efectivo</button>
                                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenPaymentId(null); updatePayment(o.id, 'transferencia'); }}>Transferencia</button>
                                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenPaymentId(null); updatePayment(o.id, 'cheque'); }}>Cheque</button>
                              </div>
                            )}
                          </td>

                          {/* Repartidor editable */}
                          <td className="px-6 py-3 text-sm relative" onClick={stop}>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 text-coffee"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenCourierId((v) => (v === o.id ? null : o.id));
                                setOpenStatusId(null);
                                setOpenPaymentId(null);
                                setOpenMenuId(null);
                              }}
                              title="Cambiar repartidor"
                            >
                              <span className="inline-flex items-center gap-1">
                                <User size={14} className="text-gray-400" />
                                {courierName(o.deliveredBy)}
                              </span>
                            </button>

                            {openCourierId === o.id && (
                              <div className="absolute left-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-50 p-2">
                                <button
                                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 rounded"
                                  onClick={() => { setOpenCourierId(null); updateCourier(o.id, null); }}
                                >
                                  — Sin asignar —
                                </button>
                                {couriers.map((u) => (
                                  <button
                                    key={u.id}
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 rounded"
                                    onClick={() => { setOpenCourierId(null); updateCourier(o.id, u.id); }}
                                  >
                                    {u.name} {u.role ? <span className="text-gray-400">({u.role})</span> : null}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-3 text-sm text-center">{items.length}</td>
                          <td className="px-6 py-3 text-sm text-right font-medium text-coffee">
                            {CLP.format(Number(o.total) || 0)}
                          </td>

                          {/* Acciones ⋯ */}
                          <td className="px-6 py-3 text-sm">
                            <div className="relative flex items-center justify-center" onClick={stop}>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId((v) => (v === o.id ? null : o.id));
                                  setOpenStatusId(null);
                                  setOpenPaymentId(null);
                                  setOpenCourierId(null);
                                }}
                                aria-label="Más opciones"
                                title="Más opciones"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {openMenuId === o.id && (
                                <div className="absolute right-0 top-9 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setOpenMenuId(null); handleEdit(o.id); }}>
                                    <div className="flex items-center gap-2">
                                      <Pencil size={14} />
                                      <span>Editar</span>
                                    </div>
                                  </button>
                                  <button className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50" onClick={() => { setOpenMenuId(null); handleDelete(o.id); }}>
                                    <div className="flex items-center gap-2">
                                      <Trash2 size={14} />
                                      <span>Eliminar</span>
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Detalle productos */}
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td colSpan={11} className="px-6 pb-4">
                            <div className="mt-1 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                              <h4 className="text-sm font-semibold text-coffee mb-2">Detalle de productos</h4>
                              <div className="overflow-x-auto">
                                <table className="min-w-full table-fixed">
                                  <colgroup>
                                    <col style={{ width: '55%' }} />
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '15%' }} />
                                  </colgroup>
                                  <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-600 border-b border-indigo-100">
                                      <th className="py-1 pr-2">Producto</th>
                                      <th className="py-1 pr-2">Cantidad</th>
                                      <th className="py-1 pr-2 text-right">Precio</th>
                                      <th className="py-1 pr-0 text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-sm text-coffee">
                                    {(items ?? []).length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="py-2 text-gray-500">Sin productos</td>
                                      </tr>
                                    )}
                                    {(items ?? []).map((it, i) => (
                                      <tr key={i} className="border-t border-indigo-100">
                                        <td className="py-1 pr-2">{it.name || 'Producto'}</td>
                                        <td className="py-1 pr-2">{it.qty}</td>
                                        <td className="py-1 pr-2 text-right">{CLP.format(Number(it.price) || 0)}</td>
                                        <td className="py-1 pr-0 text-right">
                                          {CLP.format(Number(it.subtotal) || (Number(it.qty) * Number(it.price) || 0))}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
