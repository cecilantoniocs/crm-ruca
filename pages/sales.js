// pages/sales.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  CalendarRange,
  Receipt,
  DollarSign,
  Truck,
  Users as UsersIcon,
} from 'lucide-react';

// ⬇️ Pull-to-refresh (window)
import PullToRefreshHeader from '../components/PullToRefreshHeader';
import usePullToRefreshWindow from '../hooks/usePullToRefreshWindow';

// ---- utils ----
const norm = (v) => (v ?? '').toString().trim().toLowerCase();

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// pills estilos compartidos
const pillCls = 'inline-flex items-center rounded-full ring-1 font-medium';
const ownerPill = (o, size = 'md') => {
  const v = norm(o);
  const label = v === 'cecil' ? 'Cecil' : v === 'rucapellan' ? 'Rucapellan' : '—';
  const color =
    v === 'rucapellan'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : v === 'cecil'
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : 'bg-gray-50 text-gray-700 ring-gray-200';
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return <span className={`${pillCls} ${color} ${sizing}`}>{label}</span>;
};

// método de pago (efectivo = azul, transferencia = amarillo, cheque = gris)
const paymentToString = (val) => {
  const v = norm(val);
  if (v === 'transferencia') return 'transferencia';
  if (v === 'cheque') return 'cheque';
  return 'efectivo';
};
const PaymentPill = ({ value, size = 'md' }) => {
  const v = paymentToString(value);
  const label = v === 'transferencia' ? 'Transferencia' : v === 'cheque' ? 'Cheque' : 'Efectivo';
  const color =
    v === 'transferencia'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-sky-50 text-sky-700 ring-sky-200';
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return <span className={`${pillCls} ${color} ${sizing}`}>{label}</span>;
};

const SalesPage = () => {
  const router = useRouter();

  // Datos
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [quickRange, setQuickRange] = useState('month'); // 'today' | 'week' | 'month' | 'range'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // cartera (clientOwner) y repartidor
  const [ownerFilter, setOwnerFilter] = useState('all'); // 'all' | 'rucapellan' | 'cecil'
  const [courierFilter, setCourierFilter] = useState('all'); // 'all' | <courierId>

  // nuevos filtros
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all' | 'facturado' | 'no_facturado' | 'sin_factura'
  const [paidFilter, setPaidFilter] = useState('all'); // 'all' | 'pagado' | 'no_pagado'

  const oDate = (o) => o.deliveredAt || o.deliveryDate || o.createdAt || '';

  // ✅ Refetch unificado (misma lógica que tenías)
  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');

      const [resO, resC, resU] = await Promise.all([
        axiosClient.get('sales'),
        axiosClient.get('clients'),
        axiosClient.get('users'),
      ]);

      setOrders(resO?.data ?? []);
      setClients(resC?.data ?? []);
      setUsers(resU?.data ?? []);
    } catch (e) {
      console.error(e);
      setLoadError('Error al cargar ventas.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Maps
  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  // Repartidores: role === 'repartidor' o flag can_deliver === true (según backend)
  const repartidores = useMemo(
    () =>
      users.filter((u) => {
        const role = norm(u.role);
        const canDeliver = !!u.can_deliver;
        return role === 'repartidor' || canDeliver;
      }),
    [users]
  );

  // Rango auto
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

    const toISODate = (d) => d.toISOString().slice(0, 10);
    setFromDate(toISODate(start));
    setToDate(toISODate(end));
  }, [quickRange]);

  const CLP = useMemo(
    () => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }),
    []
  );

  // Filtrado
  const filtered = useMemo(() => {
    let rows = orders;

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) => {
        const client = (o.clientName || '').toLowerCase();
        const local = (o.clientLocal || '').toLowerCase();
        return client.includes(q) || local.includes(q);
      });
    }

    if (fromDate && toDate) {
      const from = new Date(fromDate + 'T00:00:00');
      const to = new Date(toDate + 'T23:59:59');
      rows = rows.filter((o) => {
        const d = new Date(oDate(o));
        return d >= from && d <= to;
      });
    }

    // cartera (clientOwner)
    if (ownerFilter !== 'all') {
      rows = rows.filter((o) => {
        const c = clientMap.get(o.clientId);
        const owner = norm(c?.clientOwner || c?.client_owner);
        return owner === ownerFilter;
      });
    }

    // repartidor
    if (courierFilter !== 'all') {
      rows = rows.filter((o) => String(o.deliveredBy) === String(courierFilter));
    }

    // facturado / no facturado / sin factura
    if (invoiceFilter !== 'all') {
      if (invoiceFilter === 'facturado') {
        rows = rows.filter((o) => !!o.invoice && !!o.invoiceSent);
      } else if (invoiceFilter === 'no_facturado') {
        rows = rows.filter((o) => !!o.invoice && !o.invoiceSent);
      } else if (invoiceFilter === 'sin_factura') {
        rows = rows.filter((o) => !o.invoice);
      }
    }

    // pagado / no pagado
    if (paidFilter !== 'all') {
      rows = rows.filter((o) => (paidFilter === 'pagado' ? !!o.paid : !o.paid));
    }

    return rows;
  }, [orders, searchTerm, fromDate, toDate, ownerFilter, courierFilter, invoiceFilter, paidFilter, clientMap]);

  // Totales
  const totals = useMemo(() => {
    const count = filtered.length;
    const sum = filtered.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const unpaid = filtered.filter((o) => !o.paid).length;
    const invoiced = filtered.filter((o) => !!o.invoice && o.invoiceSent).length;
    const products = filtered.reduce(
      (acc, o) =>
        acc +
        (o.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0),
      0
    );
    return { count, sum, unpaid, invoiced, products };
  }, [filtered]);

  // Patch local
  const applyLocal = (id, patch) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // Pago: toggle pagado/no pagado
  const togglePaid = async (id) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    const patch = { paid: !prev.paid };
    applyLocal(id, patch);
    try {
      await axiosClient.patch(`orders/${id}`, patch);
    } catch (e) {
      console.error(e);
      applyLocal(id, { paid: prev.paid });
      alert('No se pudo actualizar "Pago".');
    }
  };

  // Factura enviada
  const toggleInvoiceSent = async (id) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;

    if (!prev.invoice) {
      if (prev.invoiceSent) {
        applyLocal(id, { invoiceSent: false });
        try {
          await axiosClient.patch(`orders/${id}`, { invoiceSent: false });
        } catch (e) {
          console.error(e);
          applyLocal(id, { invoiceSent: true });
        }
      }
      return;
    }

    const patch = { invoiceSent: !prev.invoiceSent };
    applyLocal(id, patch);
    try {
      await axiosClient.patch(`orders/${id}`, patch);
    } catch (e) {
      console.error(e);
      applyLocal(id, { invoiceSent: prev.invoiceSent });
      alert('No se pudo actualizar "Factura".');
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
    } catch {
      return '—';
    }
  };

  // clases de pills de factura/pago (sin iconos internos)
  const invoicePill = (o, size = 'md') => {
    const hasInv = !!o.invoice;
    const sent = !!o.invoiceSent;
    const label = hasInv ? (sent ? 'Facturada' : 'No facturada') : 'Sin factura';
    const color = hasInv
      ? sent
        ? 'bg-orange-50 text-orange-700 ring-orange-200'
        : 'bg-violet-50 text-violet-700 ring-violet-200'
      : 'bg-gray-50 text-gray-500 ring-gray-200';
    const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
    return { label, cls: `${pillCls} ${color} ${sizing}` };
  };

  const paidPillCls = (paid, size = 'md') => {
    const color = paid
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-rose-50 text-rose-700 ring-rose-200';
    const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
    return `${pillCls} ${color} ${sizing}`;
  };

  // ⬇️ Hook pull-to-refresh acoplado a window
  const { headerProps } = usePullToRefreshWindow({ onRefresh: refetch, threshold: 60 });

  return (
    <Layout>
      {/* Header de Pull-To-Refresh pegado arriba */}
      <PullToRefreshHeader {...headerProps} />

      {/* Header + KPIs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-coffee-900 tracking-tight">
          Panel de <span className="text-brand-700">Ventas</span>
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Ventas</div>
            <div className="font-semibold text-coffee-900">{totals.count}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Total</div>
            <div className="font-semibold text-coffee-900">{CLP.format(totals.sum)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">No pagadas</div>
            <div className="font-semibold text-rose-700">{totals.unpaid}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Facturadas</div>
            <div className="font-semibold text-orange-700">{totals.invoiced}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Productos vendidos</div>
            <div className="font-semibold text-coffee-900">{totals.products}</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          {/* Buscador */}
          <div className="col-span-2 sm:mr-3">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por cliente o local…"
                className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Rápidos */}
          <div className="col-span-2 sm:mr-3">
            <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-300 overflow-hidden">
              <button
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'today' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('today')}
                type="button"
              >
                Hoy
              </button>
              <button
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'week' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('week')}
                type="button"
              >
                Semana
              </button>
              <button
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'month' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('month')}
                type="button"
              >
                Mes
              </button>
              <button
                className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'range' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setQuickRange('range')}
                type="button"
                title="Rango"
              >
                <CalendarRange size={16} className="inline -mt-0.5" />
              </button>
            </div>
          </div>

          {/* Fechas */}
          <div className="sm:mr-3">
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-[90%] sm:w-[138px]"
              value={fromDate}
              onChange={(e) => {
                setQuickRange('range');
                setFromDate(e.target.value);
              }}
            />
          </div>
          <div className="sm:mr-3">
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-[90%] sm:w-[138px]"
              value={toDate}
              onChange={(e) => {
                setQuickRange('range');
                setToDate(e.target.value);
              }}
            />
          </div>

          {/* Cartera */}
          <div className="flex items-center gap-2 sm:mr-3">
            <UsersIcon size={16} className="text-gray-500 hidden sm:inline" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-full sm:w-[112px]"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              title="Cartera"
            >
              {[
                { value: 'all', label: 'Todos' },
                { value: 'rucapellan', label: 'Rucapellan' },
                { value: 'cecil', label: 'Cecil' },
              ].map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Repartidor */}
          <div className="flex items-center gap-2 sm:mr-3">
            <Truck size={16} className="text-gray-500 hidden sm:inline" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-full sm:w-[112px]"
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              title="Repartidor"
            >
              <option value="all">Todos</option>
              {repartidores.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name || r.email || 'Repartidor'}
                </option>
              ))}
            </select>
          </div>

          {/* Factura */}
          <div className="flex items-center gap-2 sm:mr-3">
            <Receipt size={16} className="text-gray-500 hidden sm:inline" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-full sm:w-[112px]"
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value)}
              title="Factura"
            >
              <option value="all">Todas</option>
              <option value="facturado">Facturado</option>
              <option value="no_facturado">No facturado</option>
              <option value="sin_factura">Sin factura</option>
            </select>
          </div>

          {/* Pago */}
          <div className="flex items-center gap-2 sm:mr-3">
            <DollarSign size={16} className="text-gray-500 hidden sm:inline" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-full sm:w-[112px]"
              value={paidFilter}
              onChange={(e) => setPaidFilter(e.target.value)}
              title="Pago"
            >
              <option value="all">Todas</option>
              <option value="pagado">Pagado</option>
              <option value="no_pagado">No pagado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Estado */}
      {loading && <p className="text-gray-600">Cargando ventas…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">No hay ventas que coincidan con los filtros.</p>
      )}

      {/* MOBILE */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filtered.map((o, idx) => {
            const c = clientMap.get(o.clientId);
            const owner = norm(c?.clientOwner || c?.client_owner);
            const { label: invLabel, cls: invCls } = invoicePill(o, 'sm');

            return (
              <div
                key={o.id}
                className={`rounded-xl p-3 border ${
                  idx % 2 === 0
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="pr-2">
                    <h3 className="text-base font-semibold text-coffee-900">{o.clientName || '—'}</h3>
                    <p className="text-sm text-gray-600">{o.clientLocal || '—'}</p>
                  </div>
                  {/* Cartera pill */}
                  <div className="shrink-0">{ownerPill(owner, 'sm')}</div>
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {fmtDate(o.deliveredAt || o.deliveryDate)}
                </div>

                {/* Items (móvil se mantiene igual) */}
                <div className="mt-3 rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <ul className="space-y-1 text-sm">
                    {(o.items ?? []).length === 0 && <li className="text-gray-500">Sin productos</li>}
                    {(o.items ?? []).map((it, i) => (
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

                {/* Método + Pago + Factura + Total */}
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap max-w-[70%]">
                    <PaymentPill value={o.paymentMethod} size="sm" />
                    <button
                      type="button"
                      onClick={() => togglePaid(o.id)}
                      className={paidPillCls(o.paid, 'sm')}
                      title="Marcar pago"
                    >
                      {o.paid ? 'Pagado' : 'No pagado'}
                    </button>
                    <button
                      type="button"
                      onClick={() => o.invoice && toggleInvoiceSent(o.id)}
                      disabled={!o.invoice}
                      className={`${invCls} ${!o.invoice ? 'cursor-not-allowed opacity-70' : ''}`}
                      title={o.invoice ? 'Marcar facturación' : 'Pedido sin factura'}
                    >
                      {invLabel}
                    </button>
                  </div>

                  <div className="text-base font-semibold text-coffee-900 shrink-0">
                    {CLP.format(Number(o.total) || 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DESKTOP */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Fecha</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Local</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cartera</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Repartidor</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Items</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Método</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Factura</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Pago</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-right">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {filtered.map((o, idx) => {
                    const c = clientMap.get(o.clientId);
                    const owner = norm(c?.clientOwner || c?.client_owner);
                    const courier = userMap.get(o.deliveredBy);
                    const items = o.items ?? [];
                    const { label: invLabel, cls: invCls } = invoicePill(o);

                    return (
                      <React.Fragment key={o.id}>
                        <tr
                          className={`${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          } hover:bg-gray-100 transition-colors`}
                        >
                          <td className="px-6 py-3 text-sm text-coffee-900 whitespace-nowrap">{fmtDate(o.deliveredAt || o.deliveryDate)}</td>
                          <td className="px-6 py-3 text-sm text-coffee-900">{o.clientName || '—'}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{o.clientLocal || '—'}</td>
                          <td className="px-6 py-3 text-sm">{ownerPill(owner)}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{courier?.name || '—'}</td>
                          <td className="px-6 py-3 text-sm text-center whitespace-nowrap">{items.length}</td>
                          <td className="px-6 py-3 text-sm whitespace-nowrap">
                            <PaymentPill value={o.paymentMethod} />
                          </td>
                          <td className="px-6 py-3 text-sm whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => o.invoice && toggleInvoiceSent(o.id)}
                              disabled={!o.invoice}
                              className={`${invCls} inline-flex items-center gap-1 ${!o.invoice ? 'cursor-not-allowed opacity-70' : ''}`}
                              title={o.invoice ? 'Marcar facturación' : 'Pedido sin factura'}
                            >
                              {invLabel}
                            </button>
                          </td>
                          <td className="px-6 py-3 text-sm whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => togglePaid(o.id)}
                              className={`${paidPillCls(o.paid)} inline-flex items-center gap-1`}
                              title="Marcar pago"
                            >
                              {o.paid ? 'Pagado' : 'No pagado'}
                            </button>
                          </td>
                          <td className="px-6 py-3 text-sm text-right font-semibold text-coffee-900 whitespace-nowrap">
                            {CLP.format(Number(o.total) || 0)}
                          </td>
                        </tr>

                        {/* Detalle de productos (SOLO desktop: café crema) */}
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td colSpan={10} className="px-6 pb-4">
                            <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-4">
                              <h4 className="text-sm font-semibold text-coffee-900 mb-2">Detalle de productos</h4>
                              <div className="overflow-x-auto">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-700 border-b border-amber-100">
                                      <th className="py-1 pr-4">Producto</th>
                                      <th className="py-1 pr-4">Cantidad</th>
                                      <th className="py-1 pr-4 text-right">Precio</th>
                                      <th className="py-1 pr-0 text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-sm text-gray-800">
                                    {items.length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="py-2 text-gray-600">Sin productos</td>
                                      </tr>
                                    )}
                                    {items.map((it, i) => (
                                      <tr key={i} className="border-t border-amber-100">
                                        <td className="py-1 pr-4">{it.name || 'Producto'}</td>
                                        <td className="py-1 pr-4">{it.qty}</td>
                                        <td className="py-1 pr-4 text-right">{CLP.format(Number(it.price) || 0)}</td>
                                        <td className="py-1 pr-0 text-right">
                                          {CLP.format(
                                            Number(it.subtotal) ||
                                              (Number(it.qty) * Number(it.price) || 0)
                                          )}
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
};

export default SalesPage;
