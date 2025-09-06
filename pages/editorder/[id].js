// pages/editorder/[id].js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import Select from 'react-select';
import { ArrowLeft, Save, Trash2, Plus, X } from 'lucide-react';
import { getCurrentSeller, getClients } from '../../helpers';

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const statusOpts = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'cancelado', label: 'Cancelado' },
];
const paymentOpts = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
];
const statusToString = (v) => (v ?? '').toString().trim().toLowerCase();
const paymentToString = (v) =>
  (v ?? '').toString().trim().toLowerCase() === 'transferencia' ? 'transferencia' : 'efectivo';

export default function EditOrder() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // datos auxiliares
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);

  // form state
  const [orderId, setOrderId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientLocal, setClientLocal] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState('pendiente');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [invoice, setInvoice] = useState(false);
  const [items, setItems] = useState([]); // [{productId, name, qty, price}]

  // para agregar ítem
  const [newProd, setNewProd] = useState(null);
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState('');

  // cargar pedido + catálogos
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');

        const [{ data: order }, { data: productsList }] = await Promise.all([
          axiosClient.get(`orders/${id}`),
          axiosClient.get('products'),
        ]);
        setProducts(productsList ?? []);

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
        setDeliveryDate(order.deliveryDate ? order.deliveryDate.slice(0, 10) : '');
        setStatus(statusToString(order.status) || 'pendiente');
        setPaymentMethod(paymentToString(order.paymentMethod));
        setInvoice(Boolean(order.invoice));
        setItems(
          Array.isArray(order.items)
            ? order.items.map((it) => ({
                productId: it.productId || '',
                name: it.name || '',
                qty: Number(it.qty) || 0,
                price: Number(it.price) || 0,
              }))
            : []
        );
      } catch (e) {
        console.error(e);
        setLoadError('No se pudo cargar el pedido.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // options
  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: `${c.name || '—'}${c.nombre_local ? ` — ${c.nombre_local}` : ''}`,
        _raw: c,
      })),
    [clients]
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        _raw: p,
      })),
    [products]
  );

  // helpers
  const total = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.qty) * Number(it.price) || 0), 0),
    [items]
  );

  const onPickClient = (opt) => {
    if (!opt) {
      setClientId('');
      setClientName('');
      setClientLocal('');
      return;
    }
    const raw = opt._raw;
    setClientId(raw.id);
    setClientName(raw.name || '');
    setClientLocal(raw.nombre_local || '');
  };

  const addItem = () => {
    if (!newProd) return;
    const p = newProd._raw;
    const qty = Math.max(1, Number(newQty) || 1);
    const price = Number(newPrice);
    if (!Number.isFinite(price) || price <= 0) {
      Swal.fire('Precio inválido', 'Ingresa un precio de venta válido', 'warning');
      return;
    }
    setItems((prev) => [
      ...prev,
      { productId: p.id, name: p.name, qty, price },
    ]);
    setNewProd(null);
    setNewQty(1);
    setNewPrice('');
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!clientId) return Swal.fire('Falta cliente', 'Selecciona un cliente', 'warning');
    if (items.length === 0) return Swal.fire('Sin productos', 'Agrega al menos un producto', 'warning');

    const payload = {
      id: orderId,
      clientId,
      clientName,
      clientLocal,
      deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
      status,
      paymentMethod,
      invoice,
      items: items.map((it) => ({
        productId: it.productId,
        name: it.name,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        subtotal: (Number(it.qty) * Number(it.price)) || 0,
      })),
      total: items.reduce((acc, it) => acc + ((Number(it.qty) * Number(it.price)) || 0), 0),
      updatedAt: new Date().toISOString(),
    };

    try {
      setSaving(true);
      await axiosClient.put(`orders/${orderId}`, payload);
      await Swal.fire('Guardado', 'Pedido actualizado correctamente', 'success');
      router.push('/orders');
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo actualizar el pedido', 'error');
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
      Swal.fire('Error', 'No se pudo eliminar el pedido', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      {/* Header con botón Atrás a la derecha */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
          Editar <span className="text-indigo-600">Pedido</span>
        </h1>

        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition"
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
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {/* Cliente */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <Select
                options={clientOptions}
                placeholder="Buscar cliente…"
                value={clientOptions.find((o) => o.value === clientId) || null}
                onChange={onPickClient}
                isSearchable
                classNamePrefix="select"
              />
            </div>

            {/* Datos principales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha entrega</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <Select
                  options={statusOpts}
                  value={statusOpts.find((o) => o.value === status) || statusOpts[0]}
                  onChange={(opt) => setStatus(opt?.value || 'pendiente')}
                  classNamePrefix="select"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
                <Select
                  options={paymentOpts}
                  value={paymentOpts.find((o) => o.value === paymentMethod) || paymentOpts[0]}
                  onChange={(opt) => setPaymentMethod(opt?.value || 'efectivo')}
                  classNamePrefix="select"
                />
              </div>
            </div>

            {/* Factura */}
            <div className="mt-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={invoice}
                  onChange={(e) => setInvoice(e.target.checked)}
                />
                ¿Factura?
              </label>
            </div>

            {/* Ítems */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Productos del pedido</h3>

              {/* Agregar item */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                  <Select
                    options={productOptions}
                    placeholder="Buscar producto…"
                    value={newProd}
                    onChange={setNewProd}
                    isSearchable
                    classNamePrefix="select"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    onClick={addItem}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 active:scale-95 transition"
                  >
                    <Plus size={16} />
                    Añadir
                  </button>
                </div>
              </div>

              {/* Tabla de items (más compacta en móvil) */}
              <div className="rounded-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full table-fixed md:table-auto">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-[11px] sm:text-xs uppercase tracking-wide text-gray-600">
                      <th className="px-2 py-1 sm:px-4 sm:py-2 w-1/2 md:w-auto">Producto</th>
                      <th className="px-2 py-1 sm:px-4 sm:py-2 w-12 md:w-auto">Cant.</th>
                      {/* Móvil: encabezado 'Precio' a la izquierda; Desktop: a la derecha */}
                      <th className="px-1 py-1 sm:px-4 sm:py-2 w-16 md:w-auto text-left md:text-right">Precio</th>
                      {/* Menor separación entre Precio y Subtotal en móvil */}
                      <th className="pl-1 pr-2 py-1 sm:px-4 sm:py-2 w-20 md:w-auto text-right">Subtotal</th>
                      <th className="px-2 py-1 sm:px-4 sm:py-2 w-12 md:w-auto text-center">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-xs sm:text-sm">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-gray-500">
                          Sin productos
                        </td>
                      </tr>
                    )}
                    {items.map((it, idx) => {
                      const subtotal = Number(it.qty) * Number(it.price) || 0;
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-1 sm:px-4 sm:py-2">
                            <span className="block truncate max-w-[11rem] sm:max-w-none">
                              {it.name || 'Producto'}
                            </span>
                          </td>
                          <td className="px-2 py-1 sm:px-4 sm:py-2">
                            <input
                              type="number"
                              min="1"
                              className="w-14 sm:w-24 rounded-lg border border-gray-300 px-2 py-1 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm"
                              value={it.qty}
                              onChange={(e) =>
                                updateItem(idx, { qty: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          {/* Móvil: input más angosto y menos padding a la derecha */}
                          <td className="px-1 py-1 sm:px-4 sm:py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-16 sm:w-28 text-right rounded-lg border border-gray-300 px-2 py-1 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm"
                              value={it.price}
                              onChange={(e) =>
                                updateItem(idx, { price: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          {/* Móvil: menos espacio izquierdo y ancho fijo pequeño */}
                          <td className="pl-1 pr-2 py-1 sm:px-4 sm:py-2 text-right font-medium text-gray-900">
                            <span className="inline-block w-20 sm:w-auto text-right">
                              {CLP.format(subtotal)}
                            </span>
                          </td>
                          <td className="px-2 py-1 sm:px-4 sm:py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 active:scale-95 transition"
                              title="Quitar"
                            >
                              <X size={14} className="sm:hidden" />
                              <X size={16} className="hidden sm:inline-block" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot>
                      <tr>
                        <td
                          colSpan={3}
                          className="px-2 py-2 sm:px-4 sm:py-3 text-right text-xs sm:text-sm font-semibold text-gray-700"
                        >
                          Total
                        </td>
                        <td className="px-2 py-2 sm:px-4 sm:py-3 text-right text-sm sm:text-base font-semibold text-gray-900">
                          {CLP.format(total)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Acciones - mejor spacing en móvil */}
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
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition w-full sm:w-auto"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 active:scale-95 transition disabled:opacity-60 w-full sm:w-auto"
                  >
                    <Save size={16} />
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
