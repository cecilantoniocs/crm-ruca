// pages/sales.js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  Calendar,
  CalendarRange,
  Receipt,
  DollarSign,
  Truck,
  Users as UsersIcon,
  Navigation,
} from 'lucide-react';

const statusToString = (val) => {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim().toLowerCase();
  if (typeof val === 'object') {
    if ('value' in val) return String(val.value).trim().toLowerCase();
    if ('label' in val) return String(val.label).trim().toLowerCase();
  }
  return String(val).trim().toLowerCase();
};

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

const labelSocio = (user) => {
  if (!user) return '—';
  return user.partnerTag ? String(user.partnerTag).toUpperCase() : (user.name || '—');
};

// === helper pill método de pago (solo display)
const paymentToString = (val) => {
  if (!val) return 'efectivo';
  const v = String(val).trim().toLowerCase();
  return v === 'transferencia' ? 'transferencia' : 'efectivo';
};
const PaymentPill = ({ value, size = 'md' }) => {
  const v = paymentToString(value);
  const label = v === 'transferencia' ? 'Transferencia' : 'Efectivo';
  const color =
    v === 'transferencia'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
      : 'bg-sky-50 text-sky-700 ring-sky-200';
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full ring-1 font-medium ${color} ${sizing}`}>
      {label}
    </span>
  );
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
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [courierFilter, setCourierFilter] = useState('all');

  const oDate = (o) => o.deliveredAt || o.deliveryDate || o.createdAt || '';

  // Cargar
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError('');

        // Ventas (solo entregadas) desde API nueva
        const resO = await axiosClient.get('sales');
        const list = resO?.data ?? [];
        setOrders(list);

        // Clientes desde API de clientes
        const resC = await axiosClient.get('clients');
        setClients(resC?.data ?? []);

        // Usuarios del sistema (admin/vendedor/repartidor)
        const resU = await axiosClient.get('users');
        setUsers(resU?.data ?? []);
      } catch (e) {
        console.error(e);
        setLoadError('Error al cargar ventas.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const repartidores = useMemo(
    () => users.filter((u) => String(u.role || '').toLowerCase() === 'repartidor'),
    [users]
  );

  // Opciones socio (placeholder simple)
  const socioOptions = [{ id: 'all', label: 'Todos' }];

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
      const day = (d.getDay() + 6) % 7;
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

    if (partnerFilter !== 'all') {
      rows = rows.filter((o) => {
        const c = clientMap.get(o.clientId);
        const ownerId = c?.ownerId || c?.sellerId || null;
        return ownerId === partnerFilter;
      });
    }

    if (courierFilter !== 'all') {
      rows = rows.filter((o) => o.deliveredBy === courierFilter);
    }

    return rows;
  }, [orders, searchTerm, fromDate, toDate, partnerFilter, courierFilter, clientMap]);

  // Totales (No pagadas)
  const totals = useMemo(() => {
    const count = filtered.length;
    const sum = filtered.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const unpaid = filtered.filter((o) => !o.paid).length;
    const invoiced = filtered.filter((o) => !!o.invoice && o.invoiceSent).length;
    return { count, sum, unpaid, invoiced };
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

  // Factura enviada (respeta si el pedido es con/sin factura)
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

  const mapsUrl = (addr) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`;

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
    } catch {
      return '—';
    }
  };

  return (
    <Layout>
      {/* Header + KPIs */}
      <div className="mb-6 space-y-3 sm:space-y-0 sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Panel de <span className="text-indigo-600">Ventas</span>
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Ventas</div>
            <div className="font-semibold text-gray-900">{totals.count}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Total</div>
            <div className="font-semibold text-gray-900">{CLP.format(totals.sum)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">No pagadas</div>
            <div className="font-semibold text-rose-700">{totals.unpaid}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="text-gray-500">Facturadas</div>
            <div className="font-semibold text-indigo-700">{totals.invoiced}</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3 sm:items-end sm:flex-row sm:justify-between">
        {/* Buscador */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente o local…"
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Rango + selects */}
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              className={`px-3 py-2 text-sm ${quickRange === 'today' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setQuickRange('today')}
              type="button"
            >
              Hoy
            </button>
            <button
              className={`px-3 py-2 text-sm ${quickRange === 'week' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setQuickRange('week')}
              type="button"
            >
              Semana
            </button>
            <button
              className={`px-3 py-2 text-sm ${quickRange === 'month' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setQuickRange('month')}
              type="button"
            >
              Mes
            </button>
            <button
              className={`px-3 py-2 text-sm ${quickRange === 'range' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setQuickRange('range')}
              type="button"
              title="Rango"
            >
              <CalendarRange size={16} className="inline -mt-0.5" />
            </button>
          </div>

          {/* Rango manual */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                value={fromDate}
                onChange={(e) => {
                  setQuickRange('range');
                  setFromDate(e.target.value);
                }}
              />
              <span className="text-gray-500 text-xs">a</span>
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                value={toDate}
                onChange={(e) => {
                  setQuickRange('range');
                  setToDate(e.target.value);
                }}
              />
            </div>
          </div>

          {/* Socio */}
          <div className="flex items-center gap-2">
            <UsersIcon size={16} className="text-gray-500" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white"
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
            >
              {socioOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Repartidor */}
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-gray-500" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white"
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {repartidores.map((r) => (
                <option key={r.id} value={r.id}>{r.name || 'Repartidor'}</option>
              ))}
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
          {filtered.map((o) => {
            const c = clientMap.get(o.clientId);
            const addr = c?.dir1 || '—';
            const courier = userMap.get(o.deliveredBy);
            const owner = c ? userMap.get(c.ownerId || c.sellerId) : null;

            const invoiceLabel = o.invoice
              ? (o.invoiceSent ? 'Facturada' : 'No facturada')
              : 'Sin factura';
            const invoiceCls = o.invoice
              ? (o.invoiceSent
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                  : 'bg-gray-50 text-gray-700 ring-gray-200')
              : 'bg-gray-50 text-gray-500 ring-gray-200';

            return (
              <div key={o.id} className="bg-white rounded-xl shadow p-3 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{o.clientName || '—'}</h3>
                    <p className="text-sm text-gray-600">{o.clientLocal || '—'}</p>
                  </div>
                  <div className="text-sm text-gray-500">{fmtDate(o.deliveredAt || o.deliveryDate)}</div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">Dirección: </span>
                    {addr}
                  </p>
                  {addr && (
                    <a
                      href={mapsUrl(addr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200"
                      title="Abrir en Google Maps"
                      aria-label="Abrir en Google Maps"
                    >
                      <Navigation size={16} />
                    </a>
                  )}
                </div>

                <div className="mt-2 text-sm text-gray-700 flex items-center justify-between">
                  <span>
                    <span className="text-gray-500">Socio: </span>{labelSocio(owner)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Truck size={14} className="text-gray-400" />
                    {courier?.name || '—'}
                  </span>
                </div>

                {/* Items */}
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

                {/* Método + Pago + Factura + Total (compacto) */}
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap max-w-[70%]">
                    <PaymentPill value={o.paymentMethod} size="sm" />
                    <button
                      type="button"
                      onClick={() => togglePaid(o.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                        o.paid
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-gray-50 text-gray-700 ring-gray-200'
                      }`}
                      title="Marcar pago"
                    >
                      <DollarSign size={12} />
                      {o.paid ? 'Pagado' : 'No pagado'}
                    </button>
                    <button
                      type="button"
                      onClick={() => o.invoice && toggleInvoiceSent(o.id)}
                      disabled={!o.invoice}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${invoiceCls} ${
                        !o.invoice ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                      title={o.invoice ? 'Marcar facturación' : 'Pedido sin factura'}
                    >
                      <Receipt size={12} />
                      {invoiceLabel}
                    </button>
                  </div>

                  <div className="text-base font-semibold text-gray-900 shrink-0">
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
              <table className="min-w-[1050px] w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Fecha</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Local</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Socio</th>
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
                    const owner = c ? userMap.get(c.ownerId || c.sellerId) : null;
                    const courier = userMap.get(o.deliveredBy);
                    const items = o.items ?? [];

                    const invoiceLabel = o.invoice
                      ? (o.invoiceSent ? 'Facturada' : 'No facturada')
                      : 'Sin factura';
                    const invoiceCls = o.invoice
                      ? (o.invoiceSent
                          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                          : 'bg-gray-50 text-gray-700 ring-gray-200')
                      : 'bg-gray-50 text-gray-500 ring-gray-200';

                    return (
                      <React.Fragment key={o.id}>
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                          <td className="px-6 py-3 text-sm text-gray-700">{fmtDate(o.deliveredAt || o.deliveryDate)}</td>
                          <td className="px-6 py-3 text-sm text-gray-900">{o.clientName || '—'}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{o.clientLocal || '—'}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{labelSocio(owner)}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{courier?.name || '—'}</td>
                          <td className="px-6 py-3 text-sm text-center">{items.length}</td>
                          <td className="px-6 py-3 text-sm">
                            <PaymentPill value={o.paymentMethod} />
                          </td>
                          <td className="px-6 py-3 text-sm">
                            <button
                              type="button"
                              onClick={() => o.invoice && toggleInvoiceSent(o.id)}
                              disabled={!o.invoice}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${invoiceCls} ${
                                !o.invoice ? 'cursor-not-allowed opacity-70' : ''
                              }`}
                              title={o.invoice ? 'Marcar facturación' : 'Pedido sin factura'}
                            >
                              <Receipt size={14} />
                              {invoiceLabel}
                            </button>
                          </td>
                          <td className="px-6 py-3 text-sm">
                            <button
                              type="button"
                              onClick={() => togglePaid(o.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${
                                o.paid
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                  : 'bg-gray-50 text-gray-700 ring-gray-200'
                              }`}
                              title="Marcar pago"
                            >
                              <DollarSign size={14} />
                              {o.paid ? 'Pagado' : 'No pagado'}
                            </button>
                          </td>
                          <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                            {CLP.format(Number(o.total) || 0)}
                          </td>
                        </tr>

                        {/* Detalle de productos (SIEMPRE visible) */}
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td colSpan={10} className="px-6 pb-4">
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
                                    {items.length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="py-2 text-gray-500">Sin productos</td>
                                      </tr>
                                    )}
                                    {items.map((it, i) => (
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
          </div>
        </div>
      )}
    </Layout>
  );
};

export default SalesPage;
