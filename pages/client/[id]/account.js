// /pages/client/[id]/account.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axiosClient from '../../../config/axios';
import Swal from 'sweetalert2';
import { Trash2, PlusCircle, X } from 'lucide-react';
import PaymentModal from '../../../components/PaymentModal';

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

// --- helpers formato fecha/hora ---
const fmtDate = (val) => {
  if (!val) return '—';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dLocal = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(dLocal);
  }
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
};

const fmtDateOnly = (val, tz = 'America/Santiago') => {
  if (!val) return '—';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dLocal = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: tz,
    }).format(dLocal);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
};

const fmtTimeOnly = (val, tz = 'America/Santiago') => {
  if (!val) return '—';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(d);
};

const fmtDateTime = (val, tz = 'America/Santiago') => ({
  date: fmtDateOnly(val, tz),
  time: fmtTimeOnly(val, tz),
});

const fmtDateTimeLong = (val, tz = 'America/Santiago') => {
  if (!val) return '—';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dLocal = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: tz }).format(dLocal);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(d);
};

// ===== helpers cuenta =====
function shortOrderId(id) {
  if (!id && id !== 0) return '—';
  const s = String(id);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return `#${String(n).padStart(4, '0')}`;
  }
  const cleaned = s.replace(/-/g, '');
  return `#${cleaned.slice(0, 4).toUpperCase()}`;
}

function getPaymentAmount(p) {
  const direct =
    (p && typeof p.amountTotal === 'number' && p.amountTotal) ||
    (p && typeof p.amount_total === 'number' && p.amount_total);
  if (typeof direct === 'number') return direct;
  const items = p?.items || p?.payment_items || [];
  if (Array.isArray(items) && items.length) {
    return items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  }
  return 0;
}

function buildPaidByOrderMap(payments) {
  const map = new Map();
  for (const p of payments || []) {
    const items = p?.items || [];
    for (const it of items) {
      const k = String(it.orderId ?? it.order_id ?? '');
      const amt = Number(it.amount) || 0;
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + amt);
    }
  }
  return map;
}

function buildRealPaidByOrderMap(payments) {
  const real = (payments || []).filter((p) => !String(p.id).startsWith('virtual-'));
  return buildPaidByOrderMap(real);
}

// pago real tipo "marcar pagado"
function looksLikeMarkPaidRealPayment(p) {
  if (!p || String(p.id).startsWith('virtual-')) return false;
  const items = p.items || p.payment_items || [];
  const noteTxt = String(p.note ?? p.notes ?? p.description ?? '').toLowerCase();
  const hasNoItems =
    !Array.isArray(items) || items.length === 0 || items.every((it) => !it.orderId && !it.order_id);
  const noteMatches = /(marcado|marcada)\s+como\s+pagad|pago\s+autom[aá]tico|pago\s+automatico/.test(
    noteTxt
  );
  return hasNoItems && noteMatches;
}

// genera pagos "virtuales" cuando el pedido está marcado pagado pero no hay abono que lo cubra
function synthesizePaymentsForPaidOrders(orders, payments) {
  const realPaidByOrder = buildRealPaidByOrderMap(payments); // solo pagos reales itemizados
  const out = [...payments];

  const markPaidReals = (payments || []).filter(looksLikeMarkPaidRealPayment);

  for (const o of orders || []) {
    const orderId = String(o.id);
    const total = Number(o.total) || 0;
    const already = realPaidByOrder.get(orderId) || 0;
    const remaining = Math.max(0, total - already);
    const isPaid = o.paid === true;

    if (!isPaid || remaining <= 0) continue;

    // si ya hay un pago real sin ítems que cubre el restante => no inventamos virtual
    const hasCoveringMarkPaidReal = markPaidReals.some((p) => {
      const sameClient =
        String(p.clientId ?? p.client_id ?? '') === String(o.clientId ?? o.client_id ?? '');
      if (!sameClient) return false;
      const amt = Number(getPaymentAmount(p)) || 0;
      return amt + 1 >= remaining; // tolerancia mínima
    });

    if (hasCoveringMarkPaidReal) continue;

    out.push({
      id: `virtual-${orderId}`,
      clientId: o.clientId ?? o.client_id ?? null,
      method: (o.paymentMethod || o.payment_method || 'efectivo') + ' (virtual)',
      amountTotal: remaining,
      paidAt: o.deliveredAt || o.deliveryDate || o.createdAt || o.updatedAt || null,
      note: 'Pago completo (virtual) por pedido marcado como pagado',
      items: [
        {
          id: `virtual-item-${orderId}`,
          paymentId: `virtual-${orderId}`,
          orderId: orderId,
          amount: remaining,
          note: null,
        },
      ],
    });
  }

  return out;
}

// ---------- Modal base ----------
function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-coffee-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// 🔑 helper: normalizamos permisos a formato con punto
function normalizePermList(rawList = [], isAdminFlag = false) {
  let arr = Array.isArray(rawList) ? rawList : [];

  // pasamos todo a lowercase y cambiamos ":" -> "."
  arr = arr.map((p) =>
    String(p || '')
      .toLowerCase()
      .replace(/:/g, '.')
      .trim()
  );

  // si es admin, forzamos los 2 permisos críticos
  if (isAdminFlag) {
    if (!arr.includes('client.account.read')) arr.push('client.account.read');
    if (!arr.includes('client.account.charge')) arr.push('client.account.charge');
  }

  // sacamos duplicados
  return Array.from(new Set(arr));
}

export default function ClientAccountPage() {
  const router = useRouter();
  const { id } = router.query;

  // permisos del usuario logueado (normalizados con '.')
  const [userPerms, setUserPerms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [couriers, setCouriers] = useState([]); // {id,name}

  const [isMobile, setIsMobile] = useState(false);

  // PaymentModal state
  const [pmOpen, setPmOpen] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState('');
  const [pmCtx, setPmCtx] = useState(null);

  // Modales detalle
  const [orderInfoOpen, setOrderInfoOpen] = useState(false);
  const [orderInfo, setOrderInfo] = useState(null);
  const [payInfoOpen, setPayInfoOpen] = useState(false);
  const [payInfo, setPayInfo] = useState(null);

  // detectar mobile
  useEffect(() => {
    const detect = () =>
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    detect();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', detect);
      return () => window.removeEventListener('resize', detect);
    }
  }, []);

  // helper permisos ya normalizados
  const canReadAccount = useMemo(
    () => userPerms.includes('client.account.read'),
    [userPerms]
  );
  const canChargeAccount = useMemo(
    () => userPerms.includes('client.account.charge'),
    [userPerms]
  );

  // cargar permisos + data
  const bootstrap = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setErr('');

      // 0) info usuario logueado
      const meRes = await axiosClient.get('auth/me').catch(() => ({ data: {} }));
      const meUser = meRes?.data?.user || {};
      const rawPerms = meUser.permissions || [];
      const isAdmin = !!meUser.is_admin;
      const effectivePerms = normalizePermList(rawPerms, isAdmin);
      setUserPerms(effectivePerms);

      if (!effectivePerms.includes('client.account.read')) {
        setClient(null);
        setOrders([]);
        setPayments([]);
        setCouriers([]);
        setErr('No tienes permiso para ver esta cuenta.');
        return { orders: [], payments: [] };
      }

      // 1) Cliente
      const resClient = await axiosClient.get(`clients/${id}`);
      const c = resClient?.data?.client ?? resClient?.data ?? null;
      if (!c || !c.id) {
        setClient(null);
        setErr('Cliente no encontrado.');
        setOrders([]);
        setPayments([]);
        return { orders: [], payments: [] };
      }
      setClient(c);

      // 2) Pedidos + Pagos + Repartidores
      const [resSales, resPayments, resCouriers] = await Promise.all([
        axiosClient
          .get('sales', { params: { clientId: c.id } })
          .catch(() => ({ data: [] })),
        axiosClient
          .get('payments', { params: { clientId: c.id, include: 'items' } })
          .catch(() => ({ data: [] })),
        axiosClient.get('couriers').catch(() => ({ data: [] })),
      ]);

      const allOrders = Array.isArray(resSales?.data) ? resSales.data : [];
      const filteredOrders = allOrders.filter(
        (o) => String(o.clientId) === String(c.id)
      );

      const rawPay = resPayments?.data;
      const rows = Array.isArray(rawPay)
        ? rawPay
        : Array.isArray(rawPay?.rows)
        ? rawPay.rows
        : [];
      const filteredPayments = rows.filter(
        (p) => String(p.clientId) === String(c.id)
      );

      const paymentsWithVirtuals = synthesizePaymentsForPaidOrders(
        filteredOrders,
        filteredPayments
      );

      setOrders(filteredOrders);
      setPayments(paymentsWithVirtuals);
      setCouriers(
        (resCouriers?.data ?? []).map((u) => ({
          id: String(u.id),
          name: u.name,
        }))
      );

      return { orders: filteredOrders, payments: paymentsWithVirtuals };
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 404) setErr('Cliente no encontrado.');
      else setErr('No se pudo cargar la cuenta del cliente.');
      setClient(null);
      setOrders([]);
      setPayments([]);
      return { orders: [], payments: [] };
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!router.isReady || !id) return;
    bootstrap();
  }, [router.isReady, id, bootstrap]);

  // ===== Helpers UI =====
  function paymentOrderCell(p) {
    const items = p?.items || [];
    if (!items.length) return '—';
    const first = items[0];
    const firstOrderRaw = first.orderId ?? first.order_id;
    const display = shortOrderId(firstOrderRaw);
    const rest = items.length - 1;
    return rest > 0 ? `${display} +${rest}` : display;
  }

  // Pendiente REAL por pedido (solo pagos reales itemizados)
  function getRealPendingForOrder(order) {
    const realPaidMap = buildRealPaidByOrderMap(payments);
    const paid = realPaidMap.get(String(order.id)) || 0;
    const tot = Number(order.total) || 0;
    return Math.max(0, tot - paid);
  }

  // Mostrar botón "Abonar"? (si está marcado pagado, no mostrar)
  function shouldShowAbonar(order) {
    const pending = getRealPendingForOrder(order);
    return !order.paid && pending > 0;
  }

  // --- abrir PaymentModal ---
  const openPaymentModalForOrder = (order) => {
    if (!order) return;
    if (!canChargeAccount) {
      Swal.fire('Sin permiso', 'No puedes registrar abonos.', 'info');
      return;
    }
    setPmError('');
    setPmCtx({
      orderId: String(order.id),
      clientId: String(order.clientId ?? order.client_id ?? ''),
      clientName: client?.name || '—',
      method: String(order.paymentMethod || order.payment_method || 'efectivo'),
      _suggestedAmount: getRealPendingForOrder(order),
    });
    setPmOpen(true);
  };

  // Enviar abono
  const handleSubmitPayment = async ({ amount, method, paidAt, note }) => {
    if (!pmCtx?.orderId || !pmCtx?.clientId) return;
    if (!canChargeAccount) {
      setPmError('No tienes permiso para abonar.');
      return;
    }

    const order = orders.find((o) => String(o.id) === String(pmCtx.orderId));
    const pendingBefore = order ? getRealPendingForOrder(order) : 0;
    const amt = Number(amount || 0);

    if (amt <= 0) {
      setPmError('El monto debe ser mayor a 0.');
      return;
    }
    if (order && amt > pendingBefore) {
      setPmError(
        `El abono no puede exceder lo pendiente (${CLP.format(pendingBefore)}).`
      );
      return;
    }

    setPmLoading(true);
    setPmError('');
    try {
      const payload = {
        clientId: pmCtx.clientId,
        method: method || 'efectivo',
        amountTotal: amt,
        paidAt: paidAt || undefined,
        note: note || null,
        items: [{ orderId: pmCtx.orderId, amount: amt, note: note || null }],
      };

      await axiosClient.post('payments', payload);

      // Si se cubrió el total con este abono, marcar pagado.
      if (order && Math.round((pendingBefore - amt) * 100) <= 0) {
        try {
          await axiosClient.patch(`orders/${pmCtx.orderId}`, { paid: true });
        } catch (ePatch) {
          console.warn('No se pudo marcar el pedido como pagado:', ePatch);
        }
      }

      setPmOpen(false);
      await bootstrap();
      Swal.fire('Abono registrado', 'El abono se registró correctamente.', 'success');
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        'No se pudo registrar el abono';
      setPmError(msg);
    } finally {
      setPmLoading(false);
    }
  };

  // Eliminar un abono (reales y virtuales)
  const handleDeletePayment = async (payment) => {
    if (!payment?.id) return;

    if (!canChargeAccount) {
      Swal.fire('Sin permiso', 'No puedes eliminar abonos.', 'info');
      return;
    }

    const isVirtual = String(payment.id).startsWith('virtual-');

    // CASO 1: abono virtual -> sólo marcar pedido como no pagado
    if (isVirtual) {
      const orderId = String(payment.id).replace('virtual-', '');
      const ok = await Swal.fire({
        title: 'Eliminar abono automático',
        text: 'Esto marcará el pedido como no pagado.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
      });
      if (!ok.isConfirmed) return;

      try {
        await axiosClient.patch(`orders/${orderId}`, { paid: false, wipePayments: true });
        await bootstrap();
        Swal.fire('Listo', 'El pedido quedó como no pagado.', 'success');
      } catch (e) {
        console.error(e);
        const msg =
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          'No se pudo actualizar el pedido';
        Swal.fire('Error', msg, 'error');
      }
      return;
    }

    // CASO 2: abono real en BD -> borrar sólo ese abono.
    const ok = await Swal.fire({
      title: 'Eliminar abono',
      text: 'Esta acción no se puede deshacer. El/los pedido(s) quedará(n) como no pagado(s).',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;

    try {
      // 1) borrar el abono en backend (el backend además pone paid:false a los pedidos afectados)
      await axiosClient.delete(`payments/${payment.id}`);

      // 2) recargar data fresca
      await bootstrap();

      Swal.fire('Eliminado', 'El abono fue eliminado y el pedido quedó no pagado.', 'success');
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        'No se pudo eliminar el abono';
      Swal.fire('Error', msg, 'error');
    }
  };

  // Abrir detalle de pedido
  const openOrderDetail = async (orderId) => {
    try {
      setOrderInfo(null);
      const res = await axiosClient.get(`orders/${orderId}`);
      const o = res?.data;
      if (!o?.id) return;
      const courierName =
        couriers.find((c) => String(c.id) === String(o.deliveredBy))?.name ||
        couriers.find((c) => String(c.id) === String(o.delivered_by))?.name ||
        '—';
      const owner =
        (o.clientOwner ??
          o.client_owner ??
          client?.clientOwner ??
          client?.client_owner) || '—';
      setOrderInfo({
        id: o.id,
        items: Array.isArray(o.items) ? o.items : [],
        courier: courierName,
        owner,
        createdAt: o.createdAt || o.created_at || null,
        deliveryDate: o.deliveryDate || o.delivery_date || null,
        deliveredAt: o.deliveredAt || o.delivered_at || null,
        paid: !!o.paid,
      });
      setOrderInfoOpen(true);
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo cargar el detalle del pedido', 'error');
    }
  };

  // Abrir detalle de abono (solo móvil)
  const openPaymentDetailMobile = async (payment) => {
    if (!isMobile) return;
    const paidAt =
      payment.paidAt ||
      payment.paid_at ||
      payment.date ||
      payment.created_at;
    const method = (payment.method || payment.payment_method || 'efectivo').toString();
    const note = payment.note ?? payment.notes ?? '—';
    const amount = getPaymentAmount(payment);
    const items = payment.items || [];
    setPayInfo({
      orders: items
        .map((it) => String(it.orderId ?? it.order_id))
        .filter(Boolean),
      paidAt,
      method,
      note,
      amount,
    });
    setPayInfoOpen(true);
  };

  // KPIs totales (dinero)
  const totals = useMemo(() => {
    const ordersTotal = orders.reduce(
      (acc, o) => acc + (Number(o.total) || 0),
      0
    );
    const paymentsTotal = payments.reduce(
      (acc, p) => acc + (Number(getPaymentAmount(p)) || 0),
      0
    );
    const balance = paymentsTotal - ordersTotal;
    return { ordersTotal, paymentsTotal, balance };
  }, [orders, payments]);

  // === KPIs comerciales por cliente ===
  const commercialStats = useMemo(() => {
    const ventas = orders.length;

    let totalQty = 0;
    const qtyMap = new Map();

    for (const o of orders) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const q = Number(it.qty) || 0;
        totalQty += q;
        const name = it.name || 'Producto';
        qtyMap.set(name, (qtyMap.get(name) || 0) + q);
      }
    }

    const topEntries = [...qtyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    const topProducts = topEntries.map(
      ([name, qty]) => `${qty}× ${name}`
    );

    return {
      ventas,
      totalQty,
      topProducts,
    };
  }, [orders]);

  return (
    <Layout>
      {loading && <p className="text-gray-600 mb-4">Cargando cuenta…</p>}

      {!loading && err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 mb-4">
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* Header cliente */}
          <div className="mb-6 rounded-xl bg-gradient-to-br from-brand-400 to-brand-500 px-5 py-4 shadow-sm">
            {client?.local_name && (
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-800 mb-0.5">
                {client.name}
              </p>
            )}
            <h1 className="text-2xl font-bold text-coffee-900 leading-tight">
              {client?.local_name || client?.name || 'Cliente'}
            </h1>
            <p className="text-sm text-coffee-700 mt-1.5">
              {client?.dir1 || client?.address || '—'}
              {(client?.ciudad || client?.city)
                ? ` · ${client?.ciudad || client?.city}`
                : ''}
            </p>
          </div>

          {/* Actividad comercial */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Ventas</div>
              <div className="text-lg font-semibold text-coffee-900">
                {commercialStats.ventas}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Unidades vendidas</div>
              <div className="text-lg font-semibold text-coffee-900">
                {commercialStats.totalQty || 0}
              </div>
            </div>
          </div>

          {/* KPIs de plata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Total pedidos</div>
              <div className="text-lg font-semibold text-coffee-900">
                {CLP.format(totals.ordersTotal || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Total abonos</div>
              <div className="text-lg font-semibold text-emerald-700">
                +{CLP.format(totals.paymentsTotal || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Saldo</div>
              <div className="text-lg font-semibold text-rose-600">
                {CLP.format(totals.balance || 0)}
              </div>
            </div>
          </div>

          {/* Layout: 1/3 pedidos — 2/3 abonos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pedidos */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-coffee-900 font-semibold">🚚 Ventas</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-y-auto max-h-[400px] sm:max-h-none">
                <table className="w-full table-auto">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="text-left text-xs text-gray-600 uppercase">
                      <th className="px-4 py-2">Pedido</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-center">Abonar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-gray-500">
                          Sin pedidos
                        </td>
                      </tr>
                    )}
                    {orders.map((o) => {
                      const canAbonar = shouldShowAbonar(o) && canChargeAccount;
                      return (
                        <tr key={o.id}>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              className="text-brand-700 hover:underline"
                              onClick={() => openOrderDetail(o.id)}
                              title="Ver detalle del pedido"
                            >
                              {shortOrderId(o.id)}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            {fmtDate(
                              o.deliveredAt ||
                                o.deliveryDate ||
                                o.createdAt
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {CLP.format(Number(o.total) || 0)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {canAbonar ? (
                              <button
                                type="button"
                                onClick={() => openPaymentModalForOrder(o)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 transition"
                                title="Abonar a este pedido"
                                aria-label="Abonar a este pedido"
                              >
                                <PlusCircle size={16} />
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            {/* Abonos */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-coffee-900 font-semibold">💳 Abonos</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-y-auto max-h-[400px] sm:max-h-none">
                <table className="w-full table-auto">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="text-left text-xs text-gray-600 uppercase">
                      <th className="px-4 py-2">Pedido</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2 hidden sm:table-cell">Método</th>
                      <th className="px-4 py-2 hidden sm:table-cell">Nota</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                      <th className="px-2 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-gray-500">
                          Sin abonos
                        </td>
                      </tr>
                    )}
                    {payments.map((p) => {
                      const amount = getPaymentAmount(p);
                      const paidAt =
                        p.paidAt ||
                        p.paid_at ||
                        p.date ||
                        p.created_at;
                      const method = (
                        p.method ||
                        p.payment_method ||
                        'efectivo'
                      ).toString();
                      const note = p.note ?? p.notes ?? '—';
                      const isVirtual = String(p.id).startsWith('virtual-');

                      return (
                        <tr key={p.id}>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              className="text-brand-700 hover:underline sm:cursor-default"
                              onClick={() => openPaymentDetailMobile(p)}
                              title="Ver detalle del abono (móvil)"
                            >
                              {paymentOrderCell(p)}
                            </button>
                          </td>
                          <td className="px-4 py-2">{fmtDate(paidAt)}</td>
                          <td className="px-4 py-2 hidden sm:table-cell">
                            {method.slice(0, 1).toUpperCase() + method.slice(1)}
                          </td>
                          <td className="px-4 py-2 hidden sm:table-cell">
                            {note || '—'}
                          </td>
                          <td className="px-4 py-2 text-right text-emerald-700">
                            +{CLP.format(Number(amount) || 0)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {canChargeAccount ? (
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p)}
                                className={`inline-flex items-center justify-center h-8 w-8 rounded-full border ${
                                  isVirtual
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95'
                                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95'
                                } transition`}
                                title={
                                  isVirtual
                                    ? 'Quitar abono automático y marcar no pagado'
                                    : 'Eliminar abono'
                                }
                                aria-label={
                                  isVirtual
                                    ? 'Quitar abono automático y marcar no pagado'
                                    : 'Eliminar abono'
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>

          {/* PaymentModal compartido */}
          <PaymentModal
            isOpen={pmOpen}
            onClose={() => setPmOpen(false)}
            onSubmit={handleSubmitPayment}
            loading={pmLoading}
            error={pmError}
            context={pmCtx}
          />

          {/* Modal: Detalle de Pedido */}
          <Modal
            open={orderInfoOpen}
            onClose={() => setOrderInfoOpen(false)}
            title={`Detalle del pedido ${orderInfo?.id ? shortOrderId(orderInfo.id) : ''}`}
          >
            {!orderInfo ? (
              <p className="text-sm text-gray-600">Cargando…</p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Repartidor:</span>{' '}
                    {orderInfo.courier || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Cartera:</span>{' '}
                    {String(orderInfo.owner || '—').charAt(0).toUpperCase() +
                      String(orderInfo.owner || '—').slice(1)}
                  </div>
                  <div>
                    <span className="font-medium">Creado:</span>{' '}
                    {fmtDateTimeLong(orderInfo.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Entrega:</span>{' '}
                    {fmtDateTimeLong(orderInfo.deliveredAt || orderInfo.deliveryDate)}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full table-auto">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-xs text-gray-600 uppercase">
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-sm">
                      {orderInfo.items?.length ? (
                        orderInfo.items.map((it) => {
                          const q = Number(it.qty) || 0;
                          const pr = Number(it.price) || 0;
                          const sub = Number(it.subtotal) || q * pr;
                          return (
                            <tr key={it.id || `${it.productId}-${Math.random()}`}>
                              <td className="px-3 py-2">{it.name || 'Producto'}</td>
                              <td className="px-3 py-2 text-right">{q}</td>
                              <td className="px-3 py-2 text-right">{CLP.format(pr)}</td>
                              <td className="px-3 py-2 text-right">{CLP.format(sub)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-gray-500">
                            Sin ítems
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Modal>

          {/* Modal: Detalle de Abono (solo móvil) */}
          <Modal
            open={payInfoOpen && isMobile}
            onClose={() => setPayInfoOpen(false)}
            title="Detalle del abono"
          >
            {!payInfo ? (
              <p className="text-sm text-gray-600">Cargando…</p>
            ) : (
              <div className="space-y-2 text-sm text-gray-700">
                <div>
                  <span className="font-medium">Pedido(s):</span>{' '}
                  {Array.isArray(payInfo.orders) && payInfo.orders.length
                    ? payInfo.orders.map((oid, idx) => (
                        <span key={oid}>
                          {shortOrderId(oid)}
                          {idx < payInfo.orders.length - 1 ? ', ' : ''}
                        </span>
                      ))
                    : '—'}
                </div>
                <div>
                  <span className="font-medium">Fecha abono:</span>{' '}
                  {fmtDate(payInfo.paidAt)}
                </div>
                <div>
                  <span className="font-medium">Método:</span>{' '}
                  {payInfo.method.slice(0, 1).toUpperCase() + payInfo.method.slice(1)}
                </div>
                <div>
                  <span className="font-medium">Nota:</span>{' '}
                  {payInfo.note || '—'}
                </div>
                <div>
                  <span className="font-medium">Monto:</span>{' '}
                  {CLP.format(Number(payInfo.amount) || 0)}
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </Layout>
  );
}
