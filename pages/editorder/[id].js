// pages/editorder/[id].js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import Select from 'react-select';
import { ArrowLeft, Save, Trash2, Plus, User, DollarSign } from 'lucide-react';
import { getCurrentSeller, getClients } from '../../helpers';

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

const statusOpts = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'entregado', label: 'Entregado' },
];

const paymentOpts = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
];

const norm = (v) => (v ?? '').toString().trim().toLowerCase();
const toStatus = (v) => norm(v) || 'pendiente';
const toPayment = (v) => {
  const x = norm(v);
  return x === 'transferencia' ? 'transferencia' : x === 'cheque' ? 'cheque' : 'efectivo';
};

// fecha: permitir hasta 1 semana atrás
const weekAgoISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// url segura (evita error "Invalid url")
const toUrlOrNull = (v) => {
  const s = (v ?? '').toString().trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return s;
  } catch {
    return null;
  }
};

// pill cartera (mismo estilo que client.js)
const pillCls = 'inline-flex items-center rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium';
const ownerPill = (o) => {
  const v = (o || '').toString().toLowerCase();
  const label = v === 'cecil' ? 'Cecil' : v === 'rucapellan' ? 'Rucapellan' : '—';
  const cls =
    v === 'rucapellan'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : v === 'cecil'
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : 'bg-gray-50 text-gray-700 ring-gray-200';
  return <span className={`${pillCls} ${cls}`}>{label}</span>;
};

export default function EditOrder() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // catálogos
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [couriers, setCouriers] = useState([]); // [{id,name}]

  // form state
  const [orderId, setOrderId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientLocal, setClientLocal] = useState('');
  const [clientOwner, setClientOwner] = useState(''); // para pill
  const [deliveryDate, setDeliveryDate] = useState(''); // YYYY-MM-DD
  const [status, setStatus] = useState('pendiente');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [invoice, setInvoice] = useState(false);
  const [deliveredBy, setDeliveredBy] = useState(''); // repartidor id

  // Ítems (UI)
  const [items, setItems] = useState([]);

  // Barra de agregado (fuera de la tabla/lista)
  const [newProd, setNewProd] = useState(null); // {value,label,_raw}
  const [newQty, setNewQty] = useState('0');
  const [newPrice, setNewPrice] = useState('');

  // ---------- carga ----------
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');

        const [{ data: order }, { data: productsList }, couriersRes] = await Promise.all([
          axiosClient.get(`orders/${id}`),
          axiosClient.get('products'),
          axiosClient.get('couriers'),
        ]);

        setProducts(productsList ?? []);
        setCouriers((couriersRes?.data ?? []).map((u) => ({ id: u.id, name: u.name })));

        const seller = getCurrentSeller?.();
        if (seller?.id) {
          const resC = await getClients(seller.id);
          setClients(resC?.data ?? []);
        } else {
          setClients([]);
        }

        // set form
        setOrderId(order.id);
        setClientId(order.clientId || '');
        setClientName(order.clientName || '');
        setClientLocal(order.clientLocal || '');
        setClientOwner((order.clientOwner || order.client_owner || '').toString().toLowerCase());
        setDeliveryDate(order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : '');
        setStatus(toStatus(order.status));
        setPaymentMethod(toPayment(order.paymentMethod));
        setInvoice(Boolean(order.invoice));
        setDeliveredBy(order.deliveredBy || '');

        const itemsUi = Array.isArray(order.items)
          ? order.items.map((it) => ({
              productId: it.productId || it.product_id || null,
              name: it.name || 'Producto',
              qty: String(Number(it.qty) || 1),
              price: String(Number(it.price) || 0),
            }))
          : [];
        setItems(itemsUi);
      } catch (e) {
        console.error(e);
        setLoadError('No se pudo cargar el pedido.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Si tenemos el clientId y la lista de clientes, aseguramos el clientOwner (por si no vino en el pedido)
  useEffect(() => {
    if (!clientId || !clients.length) return;
    const c = clients.find((x) => String(x.id) === String(clientId));
    if (!c) return;
    const owner = (c.clientOwner ?? c.client_owner ?? '').toString().toLowerCase();
    setClientOwner(owner);
    // Refrescamos nombre/local si están vacíos
    if (!clientName) setClientName(c.name || '');
    if (!clientLocal) setClientLocal(c.nombre_local || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clients]);

  // ---------- selects ----------
  // IMPORTANTE: no ofrecer productos que ya estén en la orden
  const productOptions = useMemo(() => {
    const usedIds = new Set(items.map((it) => it.productId));
    return products
      .filter((p) => !usedIds.has(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name || '—',
        _raw: p,
      }));
  }, [products, items]);

  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: `${c.name || '—'}${c.nombre_local ? ` — ${c.nombre_local}` : ''}`,
        _raw: c,
      })),
    [clients]
  );

  // ---------- cambios UI ----------
  const onPickClient = (opt) => {
    if (!opt) {
      setClientId('');
      setClientName('');
      setClientLocal('');
      setClientOwner('');
      return;
    }
    const raw = opt._raw;
    setClientId(raw.id);
    setClientName(raw.name || '');
    setClientLocal(raw.nombre_local || '');
    setClientOwner((raw.clientOwner || raw.client_owner || '').toString().toLowerCase());
  };

  const addItem = () => {
    if (!newProd?.value) {
      Swal.fire('Producto', 'Selecciona un producto', 'warning');
      return;
    }
    const q = Number(newQty);
    if (!Number.isFinite(q) || q <= 0) {
      Swal.fire('Cantidad', 'Ingresa una cantidad válida (>0)', 'warning');
      return;
    }
    const pr = Number(newPrice);
    if (!Number.isFinite(pr) || pr < 0) {
      Swal.fire('Precio', 'Ingresa un precio válido (>=0)', 'warning');
      return;
    }

    // Si el producto ya existe, solo actualizamos la cantidad (sumamos) y NO duplicamos la fila.
    const idx = items.findIndex((it) => String(it.productId) === String(newProd.value));
    if (idx >= 0) {
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx ? { ...it, qty: String(Number(it.qty) + q) } : it
        )
      );
      setNewProd(null);
      setNewQty('0');     // vuelve a 0
      setNewPrice('');
      Swal.fire('Actualizado', 'Se aumentó la cantidad del producto ya presente.', 'success');
      return;
    }

    // Si no existe, lo añadimos normalmente
    setItems((prev) => [
      ...prev,
      {
        productId: newProd.value,
        name: newProd.label || 'Producto',
        qty: String(q),
        price: String(pr),
      },
    ]);
    setNewProd(null);
    setNewQty('0');       // vuelve a 0
    setNewPrice('');
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const changeQty = (idx, v) => {
    const only = String(v).replace(/[^\d]/g, '');
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: only } : it)));
  };
  const changePrice = (idx, v) => {
    const only = String(v).replace(/[^\d.]/g, '');
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: only } : it)));
  };

  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = Number(it.qty);
      const pr = Number(it.price);
      if (!Number.isFinite(q) || !Number.isFinite(pr) || q <= 0 || pr < 0) return acc;
      return acc + q * pr;
    }, 0);
  }, [items]);

  // ---------- guardar ----------
  const validate = () => {
    if (!clientId) {
      Swal.fire('Falta cliente', 'Selecciona un cliente', 'warning');
      return false;
    }
    if (!deliveryDate) {
      Swal.fire('Fecha de entrega', 'Selecciona una fecha', 'warning');
      return false;
    }
    if (!items.length) {
      Swal.fire('Sin productos', 'Agrega al menos un producto', 'warning');
      return false;
    }
    for (const it of items) {
      if (!it.productId) {
        Swal.fire('Producto faltante', 'Todos los ítems deben tener producto', 'warning');
        return false;
      }
      const q = Number(it.qty);
      if (!Number.isFinite(q) || q <= 0) {
        Swal.fire('Cantidad inválida', 'Ingresa una cantidad válida (>0)', 'warning');
        return false;
      }
      const pr = Number(it.price);
      if (!Number.isFinite(pr) || pr < 0) {
        Swal.fire('Precio inválido', 'Ingresa un precio válido (>=0)', 'warning');
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const builtItems = items.map((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const qtyNum = Number(it.qty);
      const priceNum = Number(it.price);
      const subtotal = qtyNum * priceNum;
      const image_url = toUrlOrNull(prod?.imageUrl ?? prod?.image_url);

      return {
        product_id: prod?.id ?? it.productId ?? null,
        name: prod?.name ?? it.name ?? 'Producto',
        sku: prod?.sku ?? null,
        image_url,
        qty: qtyNum,
        price: priceNum,
        subtotal,
      };
    });

    const patch = {
      clientId,
      clientName,
      clientLocal,
      status,
      paymentMethod, // incluye cheque
      invoice,
      deliveredBy: deliveredBy || null,
      deliveryDate,
      items: builtItems,
      total: builtItems.reduce((a, b) => a + Number(b.subtotal || 0), 0),
    };

    try {
      setSaving(true);
      await axiosClient.patch(`orders/${orderId}`, patch);
      await Swal.fire('Guardado', 'Pedido actualizado correctamente', 'success');
      router.push('/orders');
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'No se pudo actualizar el pedido';
      Swal.fire('Error', msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await Swal.fire({
      title: 'Eliminar pedido',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      setDeleting(true);
      await axiosClient.delete(`orders/${orderId}`);
      await Swal.fire('Eliminado', 'El pedido fue eliminado', 'success');
      router.push('/orders');
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'No se pudo eliminar el pedido';
      Swal.fire('Error', msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedClientLabel = useMemo(() => {
    const found = clientOptions.find((o) => o.value === clientId);
    return found?.label || '';
  }, [clientOptions, clientId]);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coffee tracking-tight">
          Editar <span className="text-brand-600">Pedido</span>
        </h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee hover:bg-gray-50 active:scale-95 transition"
          title="Volver"
          aria-label="Volver"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      {loading && <p className="text-gray-600">Cargando pedido…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}

      {!loading && !loadError && (
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm relative">
            {/* MOBILE: pill arriba derecha */}
            {clientOwner ? (
              <div className="sm:hidden absolute right-4 top-4">{ownerPill(clientOwner)}</div>
            ) : null}

            {/* Cliente */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-coffee mb-1">Cliente</label>
              <Select
                options={clientOptions}
                placeholder="Buscar cliente…"
                value={clientOptions.find((o) => o.value === clientId) || null}
                onChange={onPickClient}
                isSearchable
                classNamePrefix="rs"
                components={{ IndicatorSeparator: () => null }}
                styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none' }) }}
              />
            </div>

            {/* Datos principales (alineados) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-coffee mb-1">Fecha de entrega</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  min={weekAgoISO()}
                />
              </div>

              {/* Estado */}
              <div>
                <label className="block text-sm font-medium text-coffee mb-1">Estado</label>
                <Select
                  options={statusOpts}
                  value={statusOpts.find((o) => o.value === status) || statusOpts[0]}
                  onChange={(opt) => setStatus(opt?.value || 'pendiente')}
                  classNamePrefix="rs"
                  components={{ IndicatorSeparator: () => null }}
                  styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none', minHeight: 38 }) }}
                />
              </div>

              {/* Pago */}
              <div>
                <label className="block text-sm font-medium text-coffee mb-1">Método de pago</label>
                <Select
                  options={paymentOpts}
                  value={paymentOpts.find((o) => o.value === paymentMethod) || paymentOpts[0]}
                  onChange={(opt) => setPaymentMethod(opt?.value || 'efectivo')}
                  classNamePrefix="rs"
                  components={{ IndicatorSeparator: () => null }}
                  styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none', minHeight: 38 }) }}
                />
              </div>

              {/* Repartidor */}
              <div>
                <label className="block text-sm font-medium text-coffee mb-1">Repartidor</label>
                <select
                  value={deliveredBy || ''}
                  onChange={(e) => setDeliveredBy(e.target.value || '')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                >
                  <option value="">— Elegir —</option>
                  {couriers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Factura */}
            <div className="mb-2">
              <label className="inline-flex items-center gap-2 text-sm text-coffee">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={invoice}
                  onChange={(e) => setInvoice(e.target.checked)}
                />
                Factura (sí/no)
              </label>
            </div>

            {/* Barra de agregado */}
            <div className="flex items-end gap-3 flex-col sm:flex-row sm:items-end">
              <div className="flex-1 min-w-[220px] w-full">
                <label className="block text-sm font-medium text-coffee mb-1">Productos del pedido</label>
                <Select
                  options={productOptions} // <- ya sin duplicados
                  placeholder="Buscar producto…"
                  value={newProd}
                  onChange={setNewProd}
                  isSearchable
                  classNamePrefix="rs"
                  components={{ IndicatorSeparator: () => null }}
                  styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none', minHeight: 38 }) }}
                />
              </div>
              <div className="w-full sm:w-28">
                <label className="block text-sm font-medium text-coffee mb-1">Cantidad</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                />
              </div>
              <div className="w-full sm:w-40">
                <label className="block text-sm font-medium text-coffee mb-1">Precio (CLP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">
                    <DollarSign size={16} />
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 active:scale-95 transition w-full sm:w-auto"
                >
                  <Plus size={16} />
                  Añadir
                </button>
              </div>
            </div>

            {/* ITEMS: Mobile cards / Desktop table */}
            {/* MOBILE */}
            <div className="sm:hidden mt-4 space-y-3">
              {items.length === 0 && <p className="text-sm text-gray-500">Sin productos</p>}
              {items.map((it, idx) => {
                const sub =
                  Number(it.qty) > 0 && Number(it.price) >= 0
                    ? Number(it.qty) * Number(it.price)
                    : 0;
                return (
                  <div key={idx} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-sm font-medium text-coffee truncate">
                      {it.name || 'Producto'}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Cantidad</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                          value={it.qty}
                          onChange={(e) => changeQty(idx, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Precio</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                          value={it.price}
                          onChange={(e) => changePrice(idx, e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-coffee">
                        {CLP.format(sub)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95 transition"
                        title="Quitar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP */}
            <div className="hidden sm:block mt-4 rounded-lg border border-gray-200 overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="px-3 py-2 w-1/2">Producto</th>
                    <th className="px-3 py-2 w-28">Cantidad</th>
                    <th className="px-3 py-2 w-40">Precio</th>
                    <th className="px-3 py-2 text-right w-32">Subtotal</th>
                    <th className="px-3 py-2 text-center w-16">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-gray-500">
                        Sin productos
                      </td>
                    </tr>
                  )}
                  {items.map((it, idx) => {
                    const q = Number(it.qty);
                    const p = Number(it.price);
                    const sub = Number.isFinite(q) && Number.isFinite(p) && q > 0 && p >= 0 ? q * p : 0;

                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-coffee">
                          <span className="block truncate">{it.name || 'Producto'}</span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-full rounded-lg border border-gray-300 px-2 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                            value={it.qty}
                            onChange={(e) => changeQty(idx, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            className="w-full rounded-lg border border-gray-300 px-2 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                            value={it.price}
                            onChange={(e) => changePrice(idx, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-coffee">
                          {CLP.format(sub)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95 transition"
                            title="Quitar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-right text-sm font-semibold text-coffee">
                        Total
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-coffee">
                        {CLP.format(total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Resumen inferior */}
            <div className="mt-4 flex items-start sm:items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-500 flex items-start sm:items-center gap-3 flex-1 min-w-0">
                <span className="inline-flex items-start sm:items-center gap-2 text-coffee max-w-[70%] sm:max-w-none whitespace-normal break-words leading-tight">
                  <User size={16} className="mt-[2px] sm:mt-0 text-gray-400 flex-shrink-0" />
                  <span>{selectedClientLabel || 'Sin cliente'}</span>
                </span>
                <span className="hidden sm:inline">{clientOwner ? ownerPill(clientOwner) : null}</span>
              </div>
              <div className="text-lg font-semibold text-coffee ml-3 sm:ml-6">
                Total: {CLP.format(total || 0)}
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 hover:bg-rose-100 active:scale-95 transition disabled:opacity-60 w-full sm:w-auto"
              >
                <Trash2 size={16} />
                {deleting ? 'Eliminando…' : 'Eliminar pedido'}
              </button>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => router.push('/orders')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee hover:bg-gray-50 active:scale-95 transition w-full sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 active:scale-95 transition disabled:opacity-60 w-full sm:w-auto"
                >
                  <Save size={16} />
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
