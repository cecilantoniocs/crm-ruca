// /pages/sales.js
// Rework: método de pago con toggle, header móvil (local arriba, persona abajo + ícono cuenta),
// KPIs avanzados detrás del permiso sales.kpis.view y "Total" -> "Ingresos".
// Fixes: gating por permisos + payload camelCase+snake_case para parches robustos.
// + Filtros persistentes con botón de disquete (localStorage sales.filters.v1)

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import DateInput from '../components/DateInput';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  CalendarRange,
  Receipt,
  DollarSign,
  Truck,
  Users as UsersIcon,
  ExternalLink,
  CreditCard,
  Save,
  Check,
} from 'lucide-react';

import PullToRefreshHeader from '../components/PullToRefreshHeader';
import usePullToRefreshWindow from '../hooks/usePullToRefreshWindow';
import { getCurrentUser, can, isAdmin } from '../helpers/permissions';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

// ---------- Supabase REST client (lectura vistas) ----------
const supa = (() => {
  const baseURL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
    : '';
  return axiosClient.create
    ? axiosClient.create({
        baseURL,
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      })
    : require('axios').create({
        baseURL,
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      });
})();

// ---------- utils ----------
const norm = (v) => (v ?? '').toString().trim().toLowerCase();
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

// YYYY-MM-DD en HORA LOCAL (no usar toISOString() para evitar desfase)
const toYMDLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtDateDMY = (isoOrYmd) => {
  if (!isoOrYmd) return '—';
  const s = String(isoOrYmd).slice(0, 10);
  const [yyyy, mm, dd] = s.split('-');
  if (!yyyy || !mm || !dd) return '—';
  return `${dd}/${mm}/${yyyy}`;
};
const fmtDateMobile = (isoOrYmd) => {
  if (!isoOrYmd) return '—';
  const s = String(isoOrYmd).slice(0, 10);
  const [yyyy, mm, dd] = s.split('-').map((x) => x && x.padStart(2, '0'));
  if (!yyyy || !mm || !dd) return '—';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const mIdx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${Number(dd)} ${meses[mIdx]} ${yyyy}`;
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

// método de pago
const paymentToString = (val) => {
  const v = norm(val);
  if (v === 'transferencia') return 'transferencia';
  if (v === 'cheque') return 'cheque';
  return 'efectivo';
};
const PaymentPill = ({ value, size = 'md' }) => {
  const v = paymentToString(value);
  const label =
    v === 'transferencia' ? 'Transferencia' :
    v === 'cheque'        ? 'Cheque' :
                            'Efectivo';

  const color =
    v === 'transferencia'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : v === 'cheque'
      ? 'bg-violet-50 text-violet-700 ring-violet-200'
      : 'bg-sky-50 text-sky-700 ring-sky-200';

  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return <span className={`${pillCls} ${color} ${sizing}`}>{label}</span>;
};

// Número de venta / pedido
const formatOrderNumberRaw = (o) => {
  if (o?.orderNumber != null && o.orderNumber !== '') {
    const n = String(o.orderNumber).replace(/\D/g, '');
    return '#' + String(n).padStart(4, '0');
  }
  if (o?.id) return '#' + String(o.id).slice(0, 4).toUpperCase();
  return '—';
};

// Etiqueta estilo negro
const OrderNumberTag = ({ order }) => (
  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-gray-900 text-white">
    {formatOrderNumberRaw(order)}
  </span>
);

// helpers toggle
const nextPaymentMethod = (curr) => {
  const v = paymentToString(curr);
  if (v === 'efectivo') return 'transferencia';
  if (v === 'transferencia') return 'cheque';
  return 'efectivo';
};

// Helper: fusiona camelCase + snake_case para compatibilidad backend
const withSnake = (obj = {}, extra = {}) => {
  const out = { ...obj, ...extra };
  if ('paymentMethod' in obj) out.payment_method = obj.paymentMethod;
  if ('invoiceSent'   in obj) out.invoice_sent   = obj.invoiceSent;
  if ('clientOwner'   in obj) out.client_owner   = obj.clientOwner;
  if ('deliveredBy'   in obj) out.delivered_by   = obj.deliveredBy;
  return out;
};

// ------------ componente ------------
const SalesPage = () => {
  const router = useRouter();

  // permisos
  const me = useMemo(() => getCurrentUser(), []);
  const canViewSales = useMemo(() => isAdmin(me) || can('sales.view', null, me), [me]);
  const canViewKpis  = useMemo(
    () => isAdmin(me) || can('sales.kpis.view', null, me) || can('sales.kpis', null, me),
    [me]
  );

  // acciones granulares
  const canMarkPaid     = useMemo(() => isAdmin(me) || can('sales.markPaid', null, me), [me]);
  const canUpdatePayMet = useMemo(() => isAdmin(me) || can('sales.updatePayment', null, me), [me]);
  const canUpdateInv    = useMemo(() => isAdmin(me) || can('sales.updateInvoice', null, me), [me]);

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

  // cartera, repartidor, método de pago
  const [ownerFilter, setOwnerFilter] = useState('all'); // 'all' | 'rucapellan' | 'cecil'
  const [courierFilter, setCourierFilter] = useState('all'); // 'all' | <courierId>
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all' | 'efectivo' | 'transferencia' | 'cheque'

  // nuevos filtros
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all' | 'facturado' | 'no_facturado' | 'sin_factura'
  const [paidFilter, setPaidFilter] = useState('all'); // 'all' | 'pagado' | 'no_pagado'

  const oDate = (o) => o.deliveryDate || '';
  const [openInvoiceId, setOpenInvoiceId] = useState(null);
  const [page, setPage] = useState(0);

  const { headerProps } = usePullToRefreshWindow({ onRefresh: () => refetch(), threshold: 60 });

  // ====== Persistencia de filtros (disquete) ======
  const FILTERS_KEY = 'sales.filters.v1';
  const currentFilters = useMemo(() => ({
    searchTerm,
    quickRange,
    fromDate,
    toDate,
    ownerFilter,
    courierFilter,
    paymentFilter,
    invoiceFilter,
    paidFilter,
  }), [searchTerm, quickRange, fromDate, toDate, ownerFilter, courierFilter, paymentFilter, invoiceFilter, paidFilter]);

  const [savedFilters, setSavedFilters] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const baselineSet = useRef(false);

  // Cargar filtros guardados al montar (si existen)
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(FILTERS_KEY) : null;
      if (!raw) return;
      const f = JSON.parse(raw);
      if (f && typeof f === 'object') {
        if (f.searchTerm != null) setSearchTerm(String(f.searchTerm));
        if (f.quickRange) setQuickRange(f.quickRange);
        if (f.fromDate) setFromDate(f.fromDate);
        if (f.toDate) setToDate(f.toDate);
        if (f.ownerFilter) setOwnerFilter(f.ownerFilter);
        if (f.courierFilter) setCourierFilter(f.courierFilter);
        if (f.paymentFilter) setPaymentFilter(f.paymentFilter);
        if (f.invoiceFilter) setInvoiceFilter(f.invoiceFilter);
        if (f.paidFilter) setPaidFilter(f.paidFilter);
        setSavedFilters({
          searchTerm: f.searchTerm ?? '',
          quickRange: f.quickRange ?? 'month',
          fromDate: f.fromDate ?? '',
          toDate: f.toDate ?? '',
          ownerFilter: f.ownerFilter ?? 'all',
          courierFilter: f.courierFilter ?? 'all',
          paymentFilter: f.paymentFilter ?? 'all',
          invoiceFilter: f.invoiceFilter ?? 'all',
          paidFilter: f.paidFilter ?? 'all',
        });
        baselineSet.current = true; // ya hay baseline desde storage
      }
    } catch (e) {
      console.warn('No se pudieron cargar filtros guardados', e);
    }
  }, []);

  // Si no hay baseline guardado, lo creamos cuando ya existan fechas (quickRange aplicado)
  useEffect(() => {
    if (baselineSet.current) return;
    if (!fromDate || !toDate) return;
    setSavedFilters({ ...currentFilters });
    baselineSet.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  // Muestra disquete si no hay baseline o si hay diferencias
  const isDirty = useMemo(() => {
    if (!savedFilters) return true;
    try {
      return JSON.stringify(savedFilters) !== JSON.stringify(currentFilters);
    } catch {
      return true;
    }
  }, [savedFilters, currentFilters]);

  const saveFilters = useCallback(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(currentFilters));
      setSavedFilters(currentFilters);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);
    } catch (e) {
      alert('No se pudieron guardar los filtros.');
    }
  }, [currentFilters]);

  // --- fetch server-side desde /api/sales ---
  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');

      const params = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        q: searchTerm || undefined,
        owner: ownerFilter !== 'all' ? ownerFilter : undefined,
        courierId: (courierFilter !== 'all' && courierFilter !== 'pickup') ? courierFilter : undefined,
        paymentMethod: paymentFilter !== 'all' ? paymentFilter : undefined,
        invoice: invoiceFilter !== 'all' ? invoiceFilter : undefined,
        paid: paidFilter !== 'all' ? paidFilter : undefined,
        status: 'entregado', // el backend igual lo fuerza
      };

      const [resSales, resClients, resUsers] = await Promise.all([
        axiosClient.get('sales', { params }),
        axiosClient.get('clients'),
        axiosClient.get('users'),
      ]);

      setOrders(Array.isArray(resSales?.data) ? resSales.data : []);
      setClients(resClients?.data ?? []);
      setUsers(resUsers?.data ?? []);
    } catch (e) {
      console.error(e);
      setLoadError('Error al cargar ventas.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, searchTerm, ownerFilter, courierFilter, paymentFilter, invoiceFilter, paidFilter]);

  useEffect(() => { refetch(); }, [refetch]);

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

  // Repartidores
  const repartidores = useMemo(
    () =>
      users.filter((u) => {
        const role = norm(u.role);
        const canDeliver = !!u.can_deliver;
        return role === 'repartidor' || canDeliver;
      }),
    [users]
  );

  // Rango auto (YYYY-MM-DD)
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

  const CLP = useMemo(
    () => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }),
    []
  );

  // ---- refrescar UNA orden post-PATCH ----
  const refreshOneFromView = useCallback(async (id) => {
    try {
      const qs = new URLSearchParams();
      qs.set('select', [
        'id','total','paid','delivery_date','client_id','client_name','client_local',
        'delivered_by','payment_method','invoice','invoice_sent','client_owner',
        'paid_sum','remaining','items','status'
      ].join(','));
      qs.set('id', `eq.${id}`);

      // misma vista (ya filtrada a entregados en el servidor)
      const res = await supa.get(`/sales_with_payments_items?${qs.toString()}`);
      const fresh = Array.isArray(res?.data) ? res.data[0] : null;

      if (!fresh || fresh.id == null) {
        refetch();
        return;
      }

      const normalized = {
        id:           fresh.id,
        total:        fresh.total,
        paid:         fresh.paid,
        deliveryDate: fresh.delivery_date,
        clientId:     fresh.client_id,
        clientName:   fresh.client_name,
        clientLocal:  fresh.client_local,
        deliveredBy:  fresh.delivered_by,
        paymentMethod:fresh.payment_method,
        invoice:      fresh.invoice,
        invoiceSent:  fresh.invoice_sent,
        clientOwner:  fresh.client_owner,
        paidSum:      Number(fresh.paid_sum ?? 0),
        remaining:    Number(
          fresh.remaining ??
          Math.max(
            0,
            (Number(fresh.total) || 0) - (Number(fresh.paid_sum) || 0)
          )
        ),
        items: Array.isArray(fresh.items) ? fresh.items : [],
        status: fresh.status,
      };

      setOrders((prev) => prev.map((o) => (o.id === id ? normalized : o)));
    } catch (err) {
      console.error('refreshOneFromView error', err);
      refetch();
    }
  }, [refetch]);

  // Filtrado (ya viene ENTREGADO desde el API; no se filtra por status aquí)
  const filtered = useMemo(() => {
    let rows = orders;

    const qRaw = searchTerm.trim().toLowerCase();
    if (qRaw) {
      const qDigits = qRaw.replace(/\D/g, '');
      rows = rows.filter((o) => {
        const client = (o.clientName || '').toLowerCase();
        const local = (o.clientLocal || '').toLowerCase();
        let byNumber = false;
        if (qDigits) {
          if (o?.orderNumber != null && o.orderNumber !== '') {
            const onum = String(o.orderNumber).replace(/\D/g, '');
            if (onum.includes(qDigits)) byNumber = true;
          } else if (o?.id) {
            byNumber = String(o.id).toLowerCase().includes(qRaw);
          }
        }
        return byNumber || client.includes(qRaw) || local.includes(qRaw);
      });
    }

    if (fromDate && toDate) {
      rows = rows.filter((o) => {
        const dYMD = String(oDate(o) || '').slice(0, 10);
        return dYMD >= fromDate && dYMD <= toDate;
      });
    }

    if (ownerFilter !== 'all') {
      rows = rows.filter((o) => norm(o.clientOwner) === ownerFilter);
    }
    if (courierFilter === 'pickup') {
      rows = rows.filter((o) => o.isPickup === true);
    } else if (courierFilter !== 'all') {
      rows = rows.filter((o) => String(o.deliveredBy) === String(courierFilter));
    }
    if (invoiceFilter !== 'all') {
      if (invoiceFilter === 'facturado') {
        rows = rows.filter((o) => !!o.invoice && !!o.invoiceSent);
      } else if (invoiceFilter === 'no_facturado') {
        rows = rows.filter((o) => !!o.invoice && !o.invoiceSent);
      } else if (invoiceFilter === 'sin_factura') {
        rows = rows.filter((o) => !o.invoice);
      }
    }
    if (paidFilter !== 'all') {
      rows = rows.filter((o) => (paidFilter === 'pagado' ? !!o.paid : !o.paid));
    }
    if (paymentFilter !== 'all') {
      rows = rows.filter((o) => paymentToString(o.paymentMethod) === paymentFilter);
    }

    return rows;
  }, [orders, searchTerm, fromDate, toDate, ownerFilter, courierFilter, invoiceFilter, paidFilter, paymentFilter]);

  // Resetear página al cambiar filtros
  useEffect(() => { setPage(0); }, [filtered]);

  const paginated = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  // Totales
  const totals = useMemo(() => {
    const count = filtered.length;
    const sum = filtered.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const unpaid = filtered.filter((o) => !o.paid).length;
    const unpaidAmount = filtered.reduce((acc, o) => acc + (Number(o.remaining) || 0), 0);
    const noInvoiced = filtered.filter((o) => !!o.invoice && !o.invoiceSent).length;
    const products = filtered.reduce(
      (acc, o) => acc + ((o.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0)),
      0
    );

    return {
      count,
      sum,
      unpaid,
      unpaidAmount,
      noInvoiced,
      products,
    };
  }, [filtered]);

  // Helpers patch
  const applyLocal = (id, patch) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // Toggle pagado/no pagado
  // ✅ Repara borrado de abonos al pasar a "No pagado"
  const togglePaid = async (id) => {
    if (!canMarkPaid) return;
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;

    const newPaid = !prev.paid;

    // Optimista para KPIs
    if (!newPaid) {
      applyLocal(id, { paid: false, paidSum: 0, remaining: Number(prev.total) || 0 });
    } else {
      applyLocal(id, { paid: true, remaining: 0 });
    }

    try {
      const payload = newPaid
        // Al marcar pagado: crea abono automático con el método actual
        ? withSnake({ paid: true, paymentMethod: paymentToString(prev.paymentMethod) }, { action: 'mark_paid' })
        // Al marcar NO pagado: borra todos los abonos (flag que espera tu API)
        : withSnake({ paid: false }, { wipePayments: true, action: 'mark_paid' });

      await axiosClient.patch(`orders/${id}`, payload);
      await refreshOneFromView(id);
    } catch (e) {
      console.error(e);
      // Revertir si falla
      applyLocal(id, { paid: prev.paid, paidSum: prev.paidSum, remaining: prev.remaining });
      alert('No se pudo actualizar "Pago".');
    }
  };

  // Toggle cíclico método de pago
  const cyclePayment = async (id) => {
    if (!canUpdatePayMet) return;
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    const next = nextPaymentMethod(prev.paymentMethod);

    // Optimista
    applyLocal(id, { paymentMethod: next });

    try {
      await axiosClient.patch(`orders/${id}`, withSnake({ paymentMethod: next }, { action: 'update_payment' }));
      await refreshOneFromView(id);
    } catch (e) {
      console.error(e);
      // revert
      applyLocal(id, { paymentMethod: prev.paymentMethod });
      alert('No se pudo actualizar el método de pago.');
    }
  };

  const updateInvoiceStatus = async (id, state) => {
    if (!canUpdateInv) return;
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;

    let patch;
    if (state === 'sin_factura') {
      patch = { invoice: false, invoiceSent: false };
    } else if (state === 'no_facturada') {
      patch = { invoice: true, invoiceSent: false };
    } else {
      patch = { invoice: true, invoiceSent: true };
    }

    applyLocal(id, patch);
    try {
      await axiosClient.patch(
        `orders/${id}`,
        withSnake(patch, { action: 'update_invoice' })
      );
      await refreshOneFromView(id);
    } catch (e) {
      console.error(e);
      applyLocal(id, { invoice: prev.invoice, invoiceSent: prev.invoiceSent });
      alert('No se pudo actualizar la factura.');
    }
  };

  // Toggle rápido SOLO móvil: Facturada <-> No facturada (bloqueado si Sin factura)
  const toggleInvoiceMobile = async (id) => {
    if (!canUpdateInv) return;
    const prev = orders.find((o) => o.id === id);
    if (!prev) return;
    if (!prev.invoice) return; // Sin factura => bloqueado

    const next = { invoice: true, invoiceSent: !prev.invoiceSent };

    // Optimista
    applyLocal(id, next);
    try {
      await axiosClient.patch(`orders/${id}`, withSnake(next, { action: 'update_invoice' }));
      await refreshOneFromView(id);
    } catch (e) {
      console.error(e);
      applyLocal(id, { invoice: prev.invoice, invoiceSent: prev.invoiceSent });
      alert('No se pudo actualizar la factura.');
    }
  };

  const fmtDateShort = (iso) => fmtDateDMY(iso);

  const invoiceView = (o, size = 'md') => {
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

  const goClientAccount = (clientId) => {
    if (!clientId) return;
    router.push(`/client/${clientId}/account`);
  };

  useEffect(() => {
    const close = () => {
      setOpenInvoiceId(null);
    };
    const onDocDown = () => close();
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, []);

  const stopPD = (e) => e.stopPropagation();

  return (
    <Layout>
      <PullToRefreshHeader {...headerProps} />

      {/* Header + KPIs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Panel de <span className="text-brand-600">Ventas</span>
        </h1>

        {canViewSales && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {/* Básicos */}
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="text-gray-500">Ventas</div>
              <div className="font-semibold text-coffee-900">{totals.count}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="text-gray-500">Productos vendidos</div>
              <div className="font-semibold text-coffee-900">{totals.products}</div>
            </div>

            {/* Avanzados */}
            {canViewKpis && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <div className="text-gray-500">No pagadas</div>
                  <div className="font-semibold text-rose-700">{totals.unpaid}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <div className="text-gray-500">No facturadas</div>
                  <div className="font-semibold text-rose-700">{totals.noInvoiced}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <div className="text-gray-500">Total por cobrar</div>
                  <div className="font-semibold text-rose-700">{CLP.format(totals.unpaidAmount)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <div className="text-gray-500">Ingresos</div>
                  <div className="font-semibold text-coffee-900">{CLP.format(totals.sum)}</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          {/* Buscador */}
          <div className="col-span-2 sm:mr-3">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por #venta, cliente o local…"
                className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Rápidos */}
          <div className="col-span-2 sm:mr-3">
            <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-300 overflow-hidden">
              <button className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'today' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`} onClick={() => setQuickRange('today')} type="button">Hoy</button>
              <button className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'week' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`} onClick={() => setQuickRange('week')} type="button">Semana</button>
              <button className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'month' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`} onClick={() => setQuickRange('month')} type="button">Mes</button>
              <button className={`px-3 py-2 text-sm flex-1 sm:flex-none text-center ${quickRange === 'range' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`} onClick={() => setQuickRange('range')} type="button" title="Rango">
                <CalendarRange size={16} className="inline -mt-0.5" />
              </button>
            </div>
          </div>

          {/* Fechas */}
          <div className="sm:mr-3">
            <DateInput
              wrapperClass="w-[90%] sm:w-[138px]"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
              value={fromDate}
              onChange={(e) => { setQuickRange('range'); setFromDate(e.target.value); }}
            />
          </div>
          <div className="sm:mr-3">
            <DateInput
              wrapperClass="w-[90%] sm:w-[138px]"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
              value={toDate}
              onChange={(e) => { setQuickRange('range'); setToDate(e.target.value); }}
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
              <option value="all">Todos</option>
              <option value="rucapellan">Rucapellan</option>
              <option value="cecil">Cecil</option>
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
              <option value="pickup">Retiro en bodega</option>
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

          {/* Pago (estado) */}
          <div className="flex itemscenter gap-2 sm:mr-3">
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

          {/* Método de pago */}
          <div className="flex items-center gap-2 sm:mr-3">
            <CreditCard size={16} className="text-gray-500 hidden sm:inline" />
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white w-full sm:w-[112px]"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              title="Método de pago"
            >
              <option value="all">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {/* Botón Guardar filtros (disquete) */}
          <div className="col-span-2 sm:ml-auto sm:mr-0 flex items-center justify-end w-full">
            <div className="inline-flex items-center gap-2">
              {justSaved && (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-sm">
                  <Check size={16} /> Guardado
                </span>
              )}
              {isDirty && (
                <button
                  type="button"
                  onClick={saveFilters}
                  title="Guardar filtros por defecto"
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                >
                  <Save size={16} /> Guardar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estado */}
      {loading && <p className="text-gray-600">Cargando ventas…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}
      {!loading && !loadError && filtered.length > 0 && (
        <>
          {/* MOBILE */}
          <div className="sm:hidden space-y-3">
            {paginated.map((o, idx) => {
              const c = clientMap.get(o.clientId);
              const owner = norm(c?.clientOwner || c?.client_owner || o.clientOwner);
              const { label: invLabel, cls: invCls } = invoiceView(o, 'sm');

              const sumItems = (o.items ?? []).reduce(
                (acc, it) =>
                  acc +
                  (Number(it.subtotal) ||
                    (Number(it.qty) * Number(it.price) || 0)),
                0
              );
              const totalDisplay = CLP.format(Number(o.total) || sumItems);

              const localTxt = o.clientLocal || '—';
              const personTxt = o.clientName || '—';

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
                      {/* LOCAL ARRIBA */}
                      <h3 className="text-base font-semibold text-coffee-900 leading-tight break-words">
                        {localTxt}
                      </h3>

                      {/* Persona abajo + cuenta */}
                      <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-700">
                        <span className="truncate max-w-[60vw]">{personTxt}</span>
                        {o.clientId && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded hover:bg-gray-100 p-1 text-gray-600"
                            title="Ver cuenta del cliente"
                            aria-label="Ver cuenta del cliente"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => goClientAccount(o.clientId)}
                          >
                            <ExternalLink size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <OrderNumberTag order={o} />
                      {ownerPill(owner, 'sm')}
                    </div>
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    {fmtDateMobile(o.deliveryDate)}
                  </div>

                  <div className="mt-3 rounded-lg border border-amber-200 p-3 bg-amber-50">
                    <ul className="space-y-1 text-sm">
                      {(o.items ?? []).length === 0 && (
                        <li className="text-gray-500">Sin productos</li>
                      )}
                      {(o.items ?? []).map((it, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between"
                        >
                          <span className="text-gray-700">
                            {it.name || 'Producto'} × {it.qty}
                          </span>
                          <span className="text-gray-900 font-medium">
                            {CLP.format(
                              Number(it.subtotal) ||
                                (Number(it.qty) * Number(it.price) || 0)
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-sm font-semibold text-coffee-900">
                      <span>Total</span>
                      <span>{totalDisplay}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* MÉTODO DE PAGO */}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => canUpdatePayMet && cyclePayment(o.id)}
                        className={`inline-flex items-center gap-2 ${!canUpdatePayMet ? 'opacity-60 cursor-not-allowed' : ''}`}
                        title={canUpdatePayMet ? 'Cambiar método de pago' : 'Sin permiso'}
                        disabled={!canUpdatePayMet}
                      >
                        <PaymentPill value={o.paymentMethod} size="sm" />
                      </button>

                      {/* Factura móvil */}
                      {(() => {
                        const disabled = !o.invoice || !canUpdateInv; // sin factura o sin permiso
                        return (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => !disabled && toggleInvoiceMobile(o.id)}
                            className={`inline-flex items-center gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                            title={
                              !canUpdateInv
                                ? 'Sin permiso'
                                : !o.invoice
                                ? 'Sin factura (cámbialo solo desde Orders)'
                                : 'Alternar Facturada / No facturada'
                            }
                            disabled={disabled}
                          >
                            <span className={invCls}>{invLabel}</span>
                          </button>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={((e) => e.stopPropagation())}
                        onClick={() => canMarkPaid && togglePaid(o.id)}
                        className={`${paidPillCls(o.paid, 'sm')} ${!canMarkPaid ? 'opacity-60 cursor-not-allowed' : ''}`}
                        title={canMarkPaid ? 'Marcar pago' : 'Sin permiso'}
                        disabled={!canMarkPaid}
                      >
                        {o.paid ? 'Pagado' : 'No pagado'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP */}
          <div className="hidden sm:block">
            <div className="rounded-xl border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full table-fixed">
                  <colgroup>
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '240px' }} />
                    <col style={{ width: '180px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '160px' }} />
                    <col style={{ width: '160px' }} />
                    <col style={{ width: '200px' }} />
                    <col />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr className="text-left">
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Venta
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Local
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Cliente
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Cartera
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Repartidor
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">
                        Items
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Método
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Factura
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Pago
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200">
                    {paginated.map((o, idx) => {
                      const c = clientMap.get(o.clientId);
                      const owner = norm(c?.clientOwner || c?.client_owner || o.clientOwner);
                      const courier = userMap.get(o.deliveredBy);
                      const items = o.items ?? [];
                      const { label: invLabel, cls: invCls } = invoiceView(o);
                      const localText = o.clientLocal || '—';

                      const canInvBtn = !!o.invoice && canUpdateInv;

                      return (
                        <React.Fragment key={o.id}>
                          <tr
                            className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                          >
                            <td className="px-6 py-3 text-sm text-coffee-900 whitespace-nowrap">
                              <OrderNumberTag order={o} />
                            </td>
                            <td className="px-6 py-3 text-sm text-coffee-900 whitespace-nowrap">
                              {fmtDateDMY(o.deliveryDate)}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-700">
                              <div className="inline-flex items-start gap-2">
                                <span
                                  className="block whitespace-normal break-words leading-tight"
                                  style={{
                                    width: '20ch',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                  title={localText}
                                >
                                  {localText}
                                </span>
                                {o.clientId && (
                                  <button
                                    type="button"
                                    onPointerDown={stopPD}
                                    onClick={() => goClientAccount(o.clientId)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 text-gray-600 shrink-0"
                                    title="Ver cuenta del cliente (abonar desde ahí)"
                                    aria-label="Ver cuenta del cliente"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-sm text-coffee-900">
                              {o.clientName || '—'}
                            </td>
                            <td className="px-6 py-3 text-sm">
                              {ownerPill(owner)}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-700">
                              {courier?.name || '—'}
                            </td>
                            <td className="px-6 py-3 text-sm text-center whitespace-nowrap">
                              {items.length}
                            </td>

                            {/* MÉTODO DE PAGO */}
                            <td className="px-6 py-3 text-sm whitespace-nowrap">
                              <button
                                type="button"
                                className={`inline-flex items-center gap-2 ${!canUpdatePayMet ? 'opacity-60 cursor-not-allowed' : ''}`}
                                onPointerDown={stopPD}
                                onClick={() => canUpdatePayMet && cyclePayment(o.id)}
                                title={canUpdatePayMet ? 'Cambiar método de pago' : 'Sin permiso'}
                                disabled={!canUpdatePayMet}
                              >
                                <PaymentPill value={o.paymentMethod} />
                              </button>
                            </td>

                            {/* Factura */}
                            <td className="px-6 py-3 text-sm whitespace-nowrap">
                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  onPointerDown={stopPD}
                                  onClick={() => {
                                    if (!canInvBtn) return;
                                    setOpenInvoiceId((v) => (v === o.id ? null : o.id));
                                  }}
                                  className={`inline-flex items-center gap-2 ${!canInvBtn ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  title={
                                    !canUpdateInv
                                      ? 'Sin permiso'
                                      : !o.invoice
                                      ? 'Sin factura (cámbialo solo desde Orders)'
                                      : 'Cambiar estado de factura'
                                  }
                                  disabled={!canInvBtn}
                                >
                                  <span className={invCls}>{invLabel}</span>
                                </button>

                                {openInvoiceId === o.id && (
                                  <div
                                    className="absolute top-full left-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-50 flex flex-col"
                                    onPointerDown={stopPD}
                                  >
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                                      title="Sin factura se gestiona desde Orders"
                                      disabled
                                    >
                                      Sin factura
                                    </button>
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => {
                                        setOpenInvoiceId(null);
                                        updateInvoiceStatus(o.id, 'no_facturada');
                                      }}
                                    >
                                      No facturada
                                    </button>
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => {
                                        setOpenInvoiceId(null);
                                        updateInvoiceStatus(o.id, 'facturada');
                                      }}
                                    >
                                      Facturada
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-3 text-sm whitespace-nowrap">
                              <button
                                type="button"
                                onPointerDown={stopPD}
                                onClick={() => canMarkPaid && togglePaid(o.id)}
                                className={`${paidPillCls(o.paid)} inline-flex items-center gap-1 ${!canMarkPaid ? 'opacity-60 cursor-not-allowed' : ''}`}
                                title={canMarkPaid ? 'Marcar pago' : 'Sin permiso'}
                                disabled={!canMarkPaid}
                              >
                                {o.paid ? 'Pagado' : 'No pagado'}
                              </button>
                            </td>
                            <td className="px-6 py-3 text-sm text-right font-semibold text-coffee-900 whitespace-nowrap">
                              {CLP.format(Number(o.total) || 0)}
                            </td>
                          </tr>

                          <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td colSpan={11} className="px-6 pb-4">
                              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-4">
                                <h4 className="text-sm font-semibold text-coffee-900 mb-2">
                                  Detalle de productos
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full table-fixed">
                                    <colgroup>
                                      <col style={{ width: '55%' }} />
                                      <col style={{ width: '15%' }} />
                                      <col style={{ width: '15%' }} />
                                      <col style={{ width: '15%' }} />
                                    </colgroup>
                                    <thead>
                                      <tr className="text-left text-xs uppercase tracking-wide text-gray-700 border-b border-amber-100">
                                        <th className="py-1 pr-2">Producto</th>
                                        <th className="py-1 pr-2">Cantidad</th>
                                        <th className="py-1 pr-2 text-right">Precio</th>
                                        <th className="py-1 pr-0 text-right">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="text-sm text-gray-800">
                                      {items.length === 0 && (
                                        <tr>
                                          <td colSpan={4} className="py-2 text-gray-600">
                                            Sin productos
                                          </td>
                                        </tr>
                                      )}
                                      {items.map((it, i) => (
                                        <tr key={i} className="border-t border-amber-100">
                                          <td className="py-1 pr-2">
                                            {it.name || 'Producto'}
                                          </td>
                                          <td className="py-1 pr-2">
                                            {it.qty}
                                          </td>
                                          <td className="py-1 pr-2 text-right">
                                            {CLP.format(Number(it.price) || 0)}
                                          </td>
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
        </>
      )}

      {!loading && !loadError && (
        <Pagination page={page} total={filtered.length} onChange={setPage} />
      )}
    </Layout>
  );
};

export default SalesPage;
