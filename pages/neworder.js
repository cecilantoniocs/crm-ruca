// pages/neworder.js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import axiosClient from '../config/axios';
import Swal from 'sweetalert2';
import { getCurrentSeller, getClients } from '../helpers';
import Select from 'react-select';
import { ArrowLeft, Plus, Trash2, Calendar, DollarSign, PackagePlus, User } from 'lucide-react';

const CREATE_STATUS_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'entregado', label: 'Entregado' },
];

const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
];

const norm = (v) => (v ?? '').toString().trim().toLowerCase();
const pillCls = 'inline-flex items-center rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium';

// Valida/normaliza URL o devuelve null (evita error "Invalid url" del backend)
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

const NewOrder = () => {
  const router = useRouter();

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [couriers, setCouriers] = useState([]);          // repartidores (solo nombre/id)
  const [selectedCourierId, setSelectedCourierId] = useState(''); // repartidor elegido (opcional)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- Estado del formulario ----------
  const [clientOpt, setClientOpt] = useState(null);
  const [items, setItems] = useState([{ id: uuidv4(), product: null, qty: '', price: '' }]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState(CREATE_STATUS_OPTIONS[0]); // 'pendiente' por defecto
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_OPTIONS[0]); // 'efectivo' por defecto
  const [invoice, setInvoice] = useState(false);

  // ---------- Carga de datos ----------
  useEffect(() => {
    (async () => {
      const errors = [];

      // Clientes
      try {
        const resC = await getClients(); // helper sin ownerId
        setClients(resC?.data ?? []);
      } catch (e) {
        console.error('Error cargando clientes:', e);
        errors.push('clientes');
      }

      // Productos
      try {
        const resP = await axiosClient.get('products');
        setProducts(resP?.data ?? []);
      } catch (e) {
        console.error('Error cargando productos:', e);
        errors.push('productos');
      }

      // Repartidores
      try {
        const resCour = await axiosClient.get('couriers'); // /api/couriers
        setCouriers(resCour?.data ?? []);
      } catch (e) {
        console.error('Error cargando repartidores:', e);
        errors.push('repartidores');
      }

      if (errors.length) {
        Swal.fire('Error', `No fue posible cargar ${errors.join(', ')}.`, 'error');
      }
    })();
  }, []);

  // Preseleccionar cliente si vienen con ?clientId=...
  useEffect(() => {
    const { clientId } = router.query || {};
    if (!clientId || !clients.length) return;

    const c = clients.find((x) => String(x.id) === String(clientId));
    if (!c) return;

    const opt = {
      value: c.id,
      label: `${c.name || '—'}${c?.nombre_local ? ` — ${c.nombre_local}` : ''}`,
      __search__: `${c.name || ''} ${c.nombre_local || ''}`.toLowerCase(),
      raw: c,
    };
    setClientOpt(opt);
  }, [router.query, clients]);

  // ---------- Opciones de Select ----------
  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: `${c.name || '—'}${c?.nombre_local ? ` — ${c.nombre_local}` : ''}`,
        __search__: `${c.name || ''} ${c.nombre_local || ''}`.toLowerCase(),
        raw: c,
      })),
    [clients]
  );

  const filterClientOption = (opt, input) =>
    opt.data.__search__.includes((input || '').toLowerCase());

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name || '—',
        raw: p,
      })),
    [products]
  );

  // ---------- Cálculo de total ----------
  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = Number(it.qty);
      const pr = Number(it.price);
      if (!Number.isFinite(q) || !Number.isFinite(pr)) return acc;
      return acc + q * pr;
    }, 0);
  }, [items]);

  const CLP = useMemo(() => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }), []);

  // ---------- Handlers ----------
  const addItem = () =>
    setItems((prev) => [...prev, { id: uuidv4(), product: null, qty: '', price: '' }]);

  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const updateItem = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const todayISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const weekAgoISO = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // ---------- Validación mínima ----------
  const validateForm = () => {
    if (!clientOpt?.value) {
      Swal.fire('Falta cliente', 'Selecciona un cliente', 'warning');
      return false;
    }
    if (!items.length) {
      Swal.fire('Sin productos', 'Agrega al menos un producto', 'warning');
      return false;
    }
    for (const it of items) {
      if (!it.product?.value) {
        Swal.fire('Producto faltante', 'Selecciona un producto en cada fila', 'warning');
        return false;
      }
      const q = Number(it.qty);
      if (!Number.isFinite(q) || q <= 0) {
        Swal.fire('Cantidad inválida', 'Ingresa una cantidad mayor a 0', 'warning');
        return false;
      }
      const pr = Number(it.price);
      if (!Number.isFinite(pr) || pr <= 0) {
        Swal.fire('Precio inválido', 'Ingresa un precio mayor a 0', 'warning');
        return false;
      }
    }
    if (!deliveryDate) {
      Swal.fire('Fecha de entrega', 'Selecciona una fecha de entrega', 'warning');
      return false;
    }
    if (!status?.value) {
      Swal.fire('Falta estado', 'Selecciona el estado del pedido', 'warning');
      return false;
    }
    if (!paymentMethod?.value) {
      Swal.fire('Falta método de pago', 'Selecciona el método de pago', 'warning');
      return false;
    }
    return true;
  };

  // ---------- Submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      const seller = getCurrentSeller?.();
      const client = clients.find((c) => c.id === clientOpt.value);

      // construir items en snake_case para la API
      const builtItems = items.map((it) => {
        const p = products.find((pp) => pp.id === it.product.value);
        return {
          product_id: p?.id,
          name: p?.name,
          sku: p?.sku,
          image_url: toUrlOrNull(p?.imageUrl ?? p?.image_url), // <== evita Invalid url
          qty: Number(it.qty),
          price: Number(it.price),
          subtotal: Number(it.qty) * Number(it.price),
        };
      });

      // payload en snake_case (lo que espera /api/orders POST)
      const payload = {
        client_id: client?.id,
        client_name: client?.name,
        client_local: client?.nombre_local ?? null,
        client_owner: client?.clientOwner ?? client?.client_owner ?? null,

        seller_id: seller?.id || null,
        delivered_by: selectedCourierId || null,

        items: builtItems,
        total,
        status: norm(status.value),                 // 'pendiente' | 'entregado'
        payment_method: norm(paymentMethod.value),  // 'efectivo'|'transferencia'|'cheque'
        delivery_date: deliveryDate,                // YYYY-MM-DD
        invoice: Boolean(invoice),
      };

      await axiosClient.post('orders', payload);
      await Swal.fire('¡Creado!', 'El pedido se registró correctamente.', 'success');
      router.push('/orders');
    } catch (error) {
      console.error(error);
      Swal.fire('Error', error?.response?.data?.error || 'No se pudo crear el pedido.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Datos derivados útiles
  const selectedClientOwner = useMemo(() => {
    const raw = clientOpt?.raw;
    const owner = raw?.clientOwner ?? raw?.client_owner ?? '';
    return owner ? String(owner).toLowerCase() : '';
  }, [clientOpt]);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-coffee tracking-tight">
          Nuevo <span className="text-brand-600">Pedido</span>
        </h1>

        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee hover:bg-gray-50 active:scale-95 transition"
          title="Atrás"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <form
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          {/* Cliente */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-coffee mb-1">
              Cliente
            </label>
            <Select
              options={clientOptions}
              placeholder="Buscar por nombre o local…"
              value={clientOpt}
              onChange={setClientOpt}
              filterOption={filterClientOption}
              classNamePrefix="rs"
              components={{ IndicatorSeparator: () => null }}
              styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none' }) }}
            />
            {/* Móvil: pill bajo el selector */}
            {selectedClientOwner ? (
              <div className="mt-2 sm:hidden">
                {ownerPill(selectedClientOwner)}
              </div>
            ) : null}
          </div>

          {/* Items */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-coffee">
                Productos
              </label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 active:scale-95 transition"
              >
                <Plus size={16} />
                Añadir producto
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-gray-200 p-3"
                >
                  {/* Producto */}
                  <div className="md:col-span-5">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Producto
                    </label>
                    <Select
                      options={productOptions}
                      placeholder="Selecciona un producto…"
                      value={it.product}
                      onChange={(opt) => updateItem(it.id, { product: opt })}
                      classNamePrefix="rs"
                      components={{ IndicatorSeparator: () => null }}
                      styles={{
                        control: (base) => ({
                          ...base,
                          borderColor: '#e5e7eb',
                          boxShadow: 'none',
                          minHeight: 38,
                        }),
                      }}
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                      value={it.qty}
                      onChange={(e) =>
                        updateItem(it.id, { qty: e.target.value.replace(/[^\d]/g, '') })
                      }
                      placeholder="0"
                    />
                  </div>

                  {/* Precio */}
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Precio de venta (CLP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400">
                        <DollarSign size={16} />
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                        value={it.price}
                        onChange={(e) =>
                          updateItem(it.id, { price: e.target.value.replace(/[^\d.]/g, '') })
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="md:col-span-1 flex items-end">
                    <div className="w-full text-right text-sm font-medium text-coffee">
                      {Number(it.qty) > 0 && Number(it.price) > 0
                        ? CLP.format(Number(it.qty) * Number(it.price))
                        : '—'}
                    </div>
                  </div>

                  {/* Remove */}
                  <div className="md:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95 transition"
                      title="Quitar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fecha de entrega + Estado + Pago + Factura + Repartidor */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-5">
            {/* Fecha */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-coffee mb-1">
                Fecha de entrega
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">
                  <Calendar size={16} />
                </span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  min={weekAgoISO()}
                />
              </div>
            </div>

            {/* Estado */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-coffee mb-1">Estado</label>
              <Select
                options={CREATE_STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
                classNamePrefix="rs"
                components={{ IndicatorSeparator: () => null }}
                styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none' }) }}
              />
            </div>

            {/* Método de pago */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-coffee mb-1">Método de pago</label>
              <Select
                options={PAYMENT_OPTIONS}
                value={paymentMethod}
                onChange={setPaymentMethod}
                classNamePrefix="rs"
                components={{ IndicatorSeparator: () => null }}
                styles={{ control: (b) => ({ ...b, borderColor: '#e5e7eb', boxShadow: 'none' }) }}
              />
            </div>

            {/* Factura */}
            <div className="md:col-span-1 flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-coffee">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={invoice}
                  onChange={(e) => setInvoice(e.target.checked)}
                />
                Factura (sí/no)
              </label>
            </div>

            {/* Repartidor */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-coffee mb-1">
                Repartidor
              </label>
              <select
                value={selectedCourierId}
                onChange={(e) => setSelectedCourierId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              >
                <option value="">— Elegir —</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Total + resumen inferior */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 text-coffee">
                <User size={16} className="text-gray-400" />
                {clientOpt?.label || 'Sin cliente'}
              </span>
              {/* Escritorio: pill abajo junto al nombre */}
              <span className="hidden sm:inline">
                {selectedClientOwner ? ownerPill(selectedClientOwner) : null}
              </span>
            </div>
            <div className="text-lg font-semibold text-coffee">
              Total: {CLP.format(total || 0)}
            </div>
          </div>

          {/* Acciones */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/orders')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee hover:bg-gray-50 active:scale-95 transition"
              title="Cancelar"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
              title="Crear pedido"
            >
              <PackagePlus size={16} />
              {isSubmitting ? 'Creando…' : 'Crear pedido'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default NewOrder;
