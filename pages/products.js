// pages/products.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import { getCurrentUser, can } from '../helpers/permissions';
import PullToRefreshHeader from '../components/PullToRefreshHeader';
import usePullToRefreshWindow from '../hooks/usePullToRefreshWindow';
import {
  Search,
  PackagePlus,
  MoreVertical,
  Trash2,
  Pencil,
  Image as ImageIcon,
  RotateCcw,
  GripVertical,
} from 'lucide-react';

// DnD Kit (solo para desktop)
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function Products() {
  const router = useRouter();
  const canEdit = useMemo(() => {
    const me = getCurrentUser();
    return can('products.edit', null, me);
  }, []);
  const [products, setProducts] = useState([]);
  const [initialIds, setInitialIds] = useState([]); // para detectar cambios
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null); // menú ⋯
  const [savingOrder, setSavingOrder] = useState(false);

  // Modo reordenar (toggle único) — solo lo usamos en desktop
  const [reorderMode, setReorderMode] = useState(false);

  // DnD state (desktop)
  const [activeId, setActiveId] = useState(null);

  // Sensores DnD (desktop)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim().toLowerCase()), 280);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Cerrar menú ⋯ al click fuera
  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Refetch unificado (⚠️ NO reordenar en front)
  const refetch = useCallback(async () => {
    try {
      setLoadError('');
      const res = await axiosClient.get('products');
      const list = res?.data ?? [];
      setProducts(list);
      setInitialIds(list.map((p) => p.id));
    } catch (err) {
      console.error(err);
      setLoadError('Error al cargar productos.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // filtro (respeta orden actual)
  const filtered = useMemo(() => {
    if (!debounced) return products;
    return products.filter((p) => {
      const name = p?.name?.toLowerCase() || '';
      const cat  = p?.category?.toLowerCase() || '';
      const sku  = p?.sku?.toLowerCase() || '';
      return name.includes(debounced) || cat.includes(debounced) || sku.includes(debounced);
    });
  }, [products, debounced]);

  const stop = (e) => e.stopPropagation();

  const handleDelete = async (id) => {
    const ok = window.confirm('¿Eliminar este producto? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await axiosClient.delete(`products/${id}`);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setInitialIds((prev) => prev.filter((x) => x !== id));
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || 'No se pudo eliminar el producto.';
      if (status === 403) {
        alert('No tienes permiso para eliminar productos (products.delete).');
      } else if (status === 409) {
        alert('No se puede eliminar: el producto está asociado a pedidos.');
      } else {
        alert(msg);
      }
    }
  };

  const handleEdit = (id) => router.push(`/editproduct/${id}`);

  const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
  const fmtCost = (c) => (c == null || c === '' || Number.isNaN(Number(c)) ? '—' : CLP.format(Number(c)));
  const getImg = (p) => p?.image_url || p?.imageUrl || null;

  // PTR window
  const { headerProps } = usePullToRefreshWindow({ onRefresh: refetch, threshold: 60 });

  // ---- Detección de cambios en orden (desktop) ----
  const idsNow = products.map((p) => p.id);
  const dirty = useMemo(() => {
    if (initialIds.length !== idsNow.length) return true;
    for (let i = 0; i < idsNow.length; i++) {
      if (idsNow[i] !== initialIds[i]) return true;
    }
    return false;
  }, [initialIds, idsNow]);

  // ---- Guardar / Deshacer (desktop) ----
  const buildSortPayload = () =>
    products.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 10 }));

  const saveOrder = async () => {
    try {
      setSavingOrder(true);
      const payload = buildSortPayload();
      await axiosClient.post('products/reorder', payload); // <-- POST (endpoint abajo)
      await refetch();
      setReorderMode(false);
      alert('Orden guardado');
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'No se pudo guardar el orden.';
      alert(msg);
    } finally {
      setSavingOrder(false);
    }
  };

  const resetOrder = () => {
    // vuelve al orden que vino del backend en el último refetch
    setProducts((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      return initialIds.map((id) => map.get(id)).filter(Boolean);
    });
    setReorderMode(false);
  };

  // ---- Drag & Drop (desktop) ----
  // Nota: sólo guardamos si NO hay búsqueda activa.
  const reorderDisabled = Boolean(debounced);

  const onDragStart = (event) => setActiveId(event.active.id);

  const onDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    setProducts((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // --- Sortable row (fila de desktop) ---
  function SortableRow({ id, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 5 : undefined,
      boxShadow: isDragging ? '0 6px 18px rgba(0,0,0,0.15)' : undefined,
      background: isDragging ? 'var(--row-drag-bg, #fff)' : undefined,
    };
    return (
      <tr ref={setNodeRef} style={style} {...attributes} className="hover:bg-gray-50">
        {/* handle col */}
        <td className="px-3 py-3 text-sm w-[52px]">
          <button
            type="button"
            {...listeners}
            disabled={!reorderMode || reorderDisabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded ${
              reorderMode && !reorderDisabled
                ? 'bg-gray-100 hover:bg-gray-200 cursor-grab active:cursor-grabbing'
                : 'bg-gray-50 text-gray-300 cursor-not-allowed'
            }`}
            title={reorderDisabled ? 'Desactiva el buscador para reordenar' : 'Arrastrar para reordenar'}
          >
            <GripVertical size={16} />
          </button>
        </td>
        {children}
      </tr>
    );
  }

  // --- Click del botón único (desktop): Reordenar / Guardar ---
  const onClickReorder = async () => {
    if (!reorderMode) {
      setReorderMode(true);
      return;
    }
    // Estamos en modo reordenar -> en segundo click intentamos guardar
    if (reorderDisabled) {
      alert('Para guardar el nuevo orden, limpia el buscador primero.');
      return;
    }
    if (!dirty) {
      // No hay cambios: solo salimos
      setReorderMode(false);
      return;
    }
    if (savingOrder) return;
    await saveOrder();
  };

  return (
    <Layout>
      {/* Header PTR pegado arriba del contenido. */}
      <PullToRefreshHeader {...headerProps} />

      {/* Header de página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Maestro de <span className="text-brand-600">Productos</span>
        </h1>

        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          <button
            onClick={() => router.push('/newproduct')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium shadow hover:bg-brand-700 active:scale-95 transition"
          >
            <PackagePlus size={18} />
            Nuevo Producto
          </button>

          {/* Botón único: Reordenar -> Guardar (solo desktop) */}
          <button
            type="button"
            onClick={onClickReorder}
            className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
              reorderMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title={reorderMode ? 'Guardar nuevo orden' : 'Reordenar lista'}
          >
            <GripVertical size={16} />
            {reorderMode ? (dirty ? 'Guardar orden' : 'Salir') : 'Reordenar'}
          </button>

          {/* Reset visual (desktop) */}
          <button
            type="button"
            disabled={!dirty || savingOrder}
            onClick={resetOrder}
            className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
              dirty ? 'bg-white text-gray-700 hover:bg-gray-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title="Restaurar al último orden del backend"
          >
            <RotateCcw size={16} />
            Deshacer
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nombre, categoría o SKU…"
          className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {reorderMode && debounced && (
          <p className="hidden sm:block text-xs text-amber-700 mt-1">
            Para guardar el nuevo orden, limpia el buscador (deja vacío el campo).
          </p>
        )}
      </div>
      </div>

      {loading && <p className="text-gray-600">Cargando productos…</p>}
      {!loading && loadError && <p className="text-danger-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">No hay productos que coincidan con la búsqueda.</p>
      )}

      {/* --- MOBILE: Cards SIN reordenar (como antes) --- */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filtered.map((p) => {
            const img = getImg(p);
            return (
              <div
                key={p.id}
                className="relative bg-white rounded-xl shadow p-3 border border-gray-100"
                onClick={stop}
              >
                {/* ⋯ arriba derecha */}
                <div className="absolute right-2 top-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId((v) => (v === p.id ? null : p.id));
                    }}
                    aria-label="Más opciones"
                    title="Más opciones"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {openMenuId === p.id && (
                    <div
                      className="absolute right-0 mt-2 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50"
                      onClick={stop}
                    >
                      {canEdit && (
                        <button
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onClick={() => {
                            setOpenMenuId(null);
                            handleEdit(p.id);
                          }}
                        >
                          Editar
                        </button>
                      )}
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          setOpenMenuId(null);
                          handleDelete(p.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                {/* Imagen + título */}
                <div className="flex items-start gap-3 pr-10">
                  {img ? (
                    <img
                      src={img}
                      alt={p.name || 'Producto'}
                      className="h-14 w-14 rounded object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded bg-gray-100 flex items-center justify-center border border-gray-200">
                      <ImageIcon className="text-gray-400" size={20} />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-semibold text-coffee-900">{p.name || '—'}</h3>
                    <p className="text-sm text-gray-600">{p.category || '—'}</p>
                  </div>
                </div>

                {/* SKU — Costo — Peso */}
                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  <p className="text-sm text-coffee-900">
                    <span className="font-medium">SKU: </span>
                    {p.sku || '—'}
                  </p>
                  <p className="text-sm text-coffee-900">
                    <span className="font-medium">Costo: </span>
                    {fmtCost(p.cost)}
                  </p>
                  <p className="text-sm text-coffee-900">
                    <span className="font-medium">Peso: </span>
                    {p.weight || '—'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- DESKTOP: Tabla con drag handle --- */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              >
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    <tr className="text-left">
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 w-[52px]">Orden</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Imagen</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Producto</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Categoría</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">SKU</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Costo</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Peso</th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Acciones</th>
                    </tr>
                  </thead>

                  <SortableContext items={filtered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <tbody className="divide-y divide-gray-200">
                      {filtered.map((p) => {
                        const img = getImg(p);
                        return (
                          <SortableRow key={p.id} id={p.id}>
                            <td className="px-6 py-3 text-sm">
                              {img ? (
                                <img
                                  src={img}
                                  alt={p.name || 'Producto'}
                                  className="h-12 w-12 rounded object-cover border border-gray-200"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center border border-gray-200">
                                  <ImageIcon className="text-gray-400" size={18} />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-coffee-900">{p.name || '—'}</td>
                            <td className="px-6 py-3 text-sm text-coffee-900">{p.category || '—'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{p.sku || '—'}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{fmtCost(p.cost)}</td>
                            <td className="px-6 py-3 text-sm text-gray-600">{p.weight || '—'}</td>
                            <td className="px-6 py-3 text-sm text-center">
                              <div className="relative inline-flex">
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId((v) => (v === p.id ? null : p.id));
                                  }}
                                  aria-label="Más opciones"
                                  title="Más opciones"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {openMenuId === p.id && (
                                  <div
                                    className="absolute right-0 mt-2 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50"
                                    onClick={stop}
                                  >
                                    {canEdit && (
                                      <button
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                        onClick={() => { setOpenMenuId(null); handleEdit(p.id); }}
                                      >
                                        Editar
                                      </button>
                                    )}
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                                      onClick={() => { setOpenMenuId(null); handleDelete(p.id); }}
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </SortableRow>
                        );
                      })}
                    </tbody>
                  </SortableContext>
                </table>

                <DragOverlay>{/* overlay opcional */}</DragOverlay>
              </DndContext>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
