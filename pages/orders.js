import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  PackagePlus,
  Calendar,
  Navigation,
  MoreVertical,
  Trash2,
  Pencil,
} from 'lucide-react';
import { getCurrentSeller, getClients } from '../helpers';
import { getCurrentUser, can } from '../helpers/permissions';
const currentUser = getCurrentUser();

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
    pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
    entregado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    cancelado: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  const cls = styleMap[v] || 'bg-gray-50 text-gray-700 ring-gray-200';
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
  return v === 'transferencia' ? 'transferencia' : 'efectivo';
};

const PaymentBadge = ({ value }) => {
  const v = paymentToString(value);
  const label = v === 'transferencia' ? 'Transferencia' : 'Efectivo';
  const cls =
    v === 'transferencia'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
      : 'bg-sky-50 text-sky-700 ring-sky-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
};

export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]); // para dirección
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // NUEVO: filtro por estado (todos/pendiente/entregado)
  const [statusFilter, setStatusFilter] = useState('todos');

  // Menús desktop
  const [openMenuId, setOpenMenuId] = useState(null);      // ⋯ acciones
  const [openStatusId, setOpenStatusId] = useState(null);  // cambiar estado
  const [openPaymentId, setOpenPaymentId] = useState(null); // cambiar pago

  // Swipe mobile
  const touchStart = useRef({}); // { [orderId]: {x,y} }
  const [swipeX, setSwipeX] = useState({}); // { [orderId]: dx }

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
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // cargar pedidos + clientes
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError('');

        const resO = await axiosClient.get('orders');
        const list = resO?.data ?? [];
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setOrders(list);

        const seller = getCurrentSeller?.();
        if (seller?.id) {
          const resC = await getClients(seller.id);
          setClients(resC?.data ?? []);
        } else {
          setClients([]);
        }
      } catch (e) {
        console.error(e);
        setLoadError('Error al cargar pedidos o clientes.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // mapa de cliente por id
  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const CLP = useMemo(() => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }), []);
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
    } catch {
      return '—';
    }
  };

  const mapsUrl = (addr) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`;

  const filtered = useMemo(() => {
    const bySearch = (o) => {
      if (!debounced) return true;
      const client = (o.clientName || '').toLowerCase();
      const local = (o.clientLocal || '').toLowerCase();
      const status = statusToString(o.status);
      const address = (clientMap.get(o.clientId)?.dir1 || '').toLowerCase();
      const pay = paymentToString(o.paymentMethod);
      return (
        client.includes(debounced) ||
        local.includes(debounced) ||
        status.includes(debounced) ||
        address.includes(debounced) ||
        pay.includes(debounced)
      );
    };

    const byStatus = (o) => {
      if (statusFilter === 'todos') return true;
      return statusToString(o.status) === statusFilter;
    };

    return orders.filter((o) => bySearch(o) && byStatus(o));
  }, [orders, debounced, clientMap, statusFilter]);

  const stop = (e) => e.stopPropagation();

  // --- acciones ---
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

  const handleEdit = (id) =>
    router.push({ pathname: '/editorder/[id]', query: { id } });




  const applyLocal = (id, patch) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

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
      alert('No se pudo actualizar el método de pago.');
    }
  };

  // swipe handlers (mobile) con animación + fixes
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

    // si es mayormente horizontal, evitamos el scroll del navegador
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault?.();
    }

    if (Math.abs(dy) > 40) return;

    const clamped = Math.max(-120, Math.min(120, dx));
    setSwipeX((s) => ({ ...s, [id]: clamped }));
  };

  const onTouchEnd = (id) => (e) => {
    const start = touchStart.current[id];
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    const THRESH = 64;
    if (Math.abs(dx) > THRESH && Math.abs(dy) < 40) {
      if (dx < 0) {
        // swipe left -> entregado
        updateStatus(id, 'entregado');
      } else {
        // swipe right -> pendiente
        updateStatus(id, 'pendiente');
      }
    }

    setSwipeX((s) => ({ ...s, [id]: 0 }));
    delete touchStart.current[id];
  };

  // estilos del segment control
  const pillClass = (val) =>
    `px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition ${
      statusFilter === val
        ? 'bg-white text-indigo-600 shadow'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
          Gestión de <span className="text-indigo-600">Pedidos</span>
        </h1>

        <button
          onClick={() => router.push('/neworder')}
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow hover:bg-indigo-700 active:scale-95 transition"
        >
          <PackagePlus size={18} />
          Nuevo Pedido
        </button>
      </div>

      {/* Buscador + Filtro estado */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:gap-4">
        {/* buscador */}
        <div className="relative flex-1 max-w-full">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, local, dirección, estado o pago…"
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* filtro segmentado */}
        <div className="mt-3 sm:mt-0">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 shadow-inner">
            <button
              type="button"
              className={pillClass('todos')}
              onClick={() => setStatusFilter('todos')}
              aria-pressed={statusFilter === 'todos'}
            >
              Todos
            </button>
            <button
              type="button"
              className={pillClass('pendiente')}
              onClick={() => setStatusFilter('pendiente')}
              aria-pressed={statusFilter === 'pendiente'}
            >
              Pendiente
            </button>
            <button
              type="button"
              className={pillClass('entregado')}
              onClick={() => setStatusFilter('entregado')}
              aria-pressed={statusFilter === 'entregado'}
            >
              Entregado
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="text-gray-600">Cargando pedidos…</p>}
      {!loading && loadError && <p className="text-red-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">No hay pedidos que coincidan con la búsqueda.</p>
      )}

      {/* MOBILE: Cards (detalle SIEMPRE + lápiz + swipe + toggle pago) */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="sm:hidden space-y-3 overflow-x-hidden">
          {filtered.map((o) => {
            const c = clientMap.get(o.clientId);
            const addr = c?.dir1 || '';
            const items = o.items ?? [];
            const delivered = statusToString(o.status) === 'entregado';
            const dx = swipeX[o.id] || 0;

            const bgSwipe =
              dx < -30 ? 'bg-emerald-50 border-emerald-200' : delivered ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100';

            return (
              <div
                key={o.id}
                className={`relative rounded-xl p-3 border shadow ${bgSwipe} transition-colors touch-pan-y select-none`}
                onTouchStart={onTouchStart(o.id)}
                onTouchMove={onTouchMove(o.id)}
                onTouchEnd={onTouchEnd(o.id)}
                onTouchCancel={() => setSwipeX((s) => ({ ...s, [o.id]: 0 }))}
                style={{
                  transform: `translate3d(${dx}px, 0, 0)`,
                  transition: 'transform 180ms ease',
                }}
              >
                {/* lápiz editar */}
                <button
                  type="button"
                  onClick={() => handleEdit(o.id)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 transition"
                  aria-label="Editar pedido"
                  title="Editar pedido"
                >
                  <Pencil size={16} />
                </button>

                {/* Cliente / Local */}
                <div className="pr-10">
                  <h3 className="text-base font-semibold text-gray-900">{o.clientName || '—'}</h3>
                  <p className="text-sm text-gray-600">{o.clientLocal || '—'}</p>
                </div>

                {/* Dirección + GPS */}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">Dirección: </span>
                    {addr || '—'}
                  </p>
                  {addr && (
                    <a
                      href={mapsUrl(addr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={stop}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200"
                      title="Abrir en Google Maps"
                      aria-label="Abrir en Google Maps"
                    >
                      <Navigation size={16} />
                    </a>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-700 flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span>{fmtDate(o.deliveryDate)}</span>
                  </div>
                  <div className="text-right">
                    <StatusBadge value={o.status} />
                  </div>
                </div>

                {/* Ítems (detalle SIEMPRE) */}
                <div className="mt-3 rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <ul className="space-y-1 text-sm">
                    {items.length === 0 && <li className="text-gray-500">Sin productos</li>}
                    {items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-gray-700">
                          {it.name || 'Producto'} × {it.qty}
                        </span>
                        <span className="text-gray-900 font-medium">
                          {CLP.format(Number(it.subtotal) || (Number(it.qty) * Number(it.price) || 0))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pago (toggle) + Total */}
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    className="active:scale-95 transition"
                    onClick={() =>
                      updatePayment(o.id, paymentToString(o.paymentMethod) === 'efectivo' ? 'transferencia' : 'efectivo')
                    }
                    title="Cambiar método de pago"
                  >
                    <PaymentBadge value={o.paymentMethod} />
                  </button>

                  <div className="text-right text-base font-semibold text-gray-900">
                    {CLP.format(Number(o.total) || 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DESKTOP: Tabla con detalle SIEMPRE + estado editable + pago editable + ⋯ */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Local</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Dirección</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Entrega</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Estado</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Pago</th>
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
                  const statusStr = statusToString(o.status);

                  return (
                    <React.Fragment key={o.id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                        <td className="px-6 py-3 text-sm text-gray-900">{o.clientName || '—'}</td>
                        <td className="px-6 py-3 text-sm text-gray-700">{o.clientLocal || '—'}</td>

                        {/* Dirección + GPS */}
                        <td className="px-6 py-3 text-sm text-gray-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{addr || '—'}</span>
                            {addr && (
                              <a
                                href={mapsUrl(addr)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={stop}
                                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200"
                                title="Abrir en Google Maps"
                                aria-label="Abrir en Google Maps"
                              >
                                <Navigation size={16} />
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-3 text-sm text-gray-700">{fmtDate(o.deliveryDate)}</td>

                        {/* Estado editable inline */}
                        <td className="px-6 py-3 text-sm relative" onClick={stop}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenStatusId((v) => (v === o.id ? null : o.id));
                              setOpenPaymentId(null);
                              setOpenMenuId(null);
                            }}
                            title="Cambiar estado"
                          >
                            <StatusBadge value={o.status} />
                          </button>

                          {openStatusId === o.id && (
                            <div className="absolute left-0 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenStatusId(null);
                                  updateStatus(o.id, 'pendiente');
                                }}
                              >
                                Pendiente
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenStatusId(null);
                                  updateStatus(o.id, 'entregado');
                                }}
                              >
                                Entregado
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Pago editable inline */}
                        <td className="px-6 py-3 text-sm relative" onClick={stop}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenPaymentId((v) => (v === o.id ? null : o.id));
                              setOpenStatusId(null);
                              setOpenMenuId(null);
                            }}
                            title="Cambiar método de pago"
                          >
                            <PaymentBadge value={o.paymentMethod} />
                          </button>

                          {openPaymentId === o.id && (
                            <div className="absolute left-0 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenPaymentId(null);
                                  updatePayment(o.id, 'efectivo');
                                }}
                              >
                                Efectivo
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenPaymentId(null);
                                  updatePayment(o.id, 'transferencia');
                                }}
                              >
                                Transferencia
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-3 text-sm text-center">{items.length}</td>
                        <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
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
                              }}
                              aria-label="Más opciones"
                              title="Más opciones"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {openMenuId === o.id && (
                              <div className="absolute right-0 top-9 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleEdit(o.id);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Pencil size={14} />
                                    <span>Editar</span>
                                  </div>
                                </button>
                                <button
                                  className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleDelete(o.id);
                                  }}
                                >
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

                      {/* Detalle SIEMPRE */}
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td colSpan={9} className="px-6 pb-4">
                          <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">Detalle de productos</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="py-1 pr-4">Producto</th>
                                    <th className="py-1 pr-4">Cantidad</th>
                                    <th className="py-1 pr-4 text-right">Precio</th>
                                    <th className="py-1 pr-0 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="text-sm text-gray-700">
                                  {(o.items ?? []).length === 0 && (
                                    <tr>
                                      <td colSpan={4} className="py-2 text-gray-500">Sin productos</td>
                                    </tr>
                                  )}
                                  {(o.items ?? []).map((it, i) => (
                                    <tr key={i} className="border-t border-gray-200">
                                      <td className="py-1 pr-4">{it.name || 'Producto'}</td>
                                      <td className="py-1 pr-4">{it.qty}</td>
                                      <td className="py-1 pr-4 text-right">{CLP.format(Number(it.price) || 0)}</td>
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
        </div></div>
      )}
    </Layout>
  );
}
