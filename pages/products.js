import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Search,
  PackagePlus,
  MoreVertical,
  Trash2,
  Pencil,
  Image as ImageIcon,
} from 'lucide-react';

export default function Products() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null); // menú ⋯ abierto

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Cerrar menú ⋯ al hacer click fuera
  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get('products');
        const ordered = (res?.data ?? []).sort((a, b) =>
          (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' })
        );
        setProducts(ordered);
      } catch (err) {
        console.error(err);
        setLoadError('Error al cargar productos.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!debounced) return products;
    return products.filter((p) => {
      const name = p?.name?.toLowerCase() || '';
      const cat = p?.category?.toLowerCase() || '';
      const sku = p?.sku?.toLowerCase() || '';
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
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar el producto.');
    }
  };

  const handleEdit = (id) => {
    // TODO: router.push(`/editproduct/${id}`)
    alert('Pronto: edición de producto.');
  };

  const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
          Maestro de <span className="text-indigo-600">Productos</span>
        </h1>

        <button
          onClick={() => router.push('/newproduct')}
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow hover:bg-indigo-700 active:scale-95 transition"
        >
          <PackagePlus size={18} />
          Nuevo Producto
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nombre, categoría o SKU…"
          className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && <p className="text-gray-600">Cargando productos…</p>}
      {!loading && loadError && <p className="text-red-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">No hay productos que coincidan con la búsqueda.</p>
      )}

      {/* MOBILE: Cards */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filtered.map((p) => (
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
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setOpenMenuId(null);
                        handleEdit(p.id);
                      }}
                    >
                      Editar
                    </button>
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
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name || 'Producto'}
                    className="h-14 w-14 rounded object-cover border border-gray-200"
                  />
                ) : (
                  <div className="h-14 w-14 rounded bg-gray-100 flex items-center justify-center border border-gray-200">
                    <ImageIcon className="text-gray-400" size={20} />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{p.name || '—'}</h3>
                  <p className="text-sm text-gray-600">{p.category || '—'}</p>
                </div>
              </div>

              {/* SKU — Costo — Peso */}
              <div className="mt-3 grid grid-cols-1 gap-1.5">
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">SKU: </span>
                  {p.sku || '—'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Costo: </span>
                  {p.cost !== undefined ? CLP.format(Number(p.cost)) : '—'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Peso: </span>
                  {p.weight || '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP: Tabla moderna sin recorte (sin overflow) */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Producto
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Costo
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Peso
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {filtered.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name || 'Producto'}
                            className="h-10 w-10 rounded object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center border border-gray-200">
                            <ImageIcon className="text-gray-400" size={16} />
                          </div>
                        )}
                        <span className="text-sm text-gray-900">{p.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">{p.category || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{p.sku || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {p.cost !== undefined ? CLP.format(Number(p.cost)) : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">{p.weight || '—'}</td>

                    {/* Acciones (⋯ con Editar/Eliminar) */}
                    <td className="px-6 py-3">
                      <div className="relative flex items-center justify-center">
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
                            className="absolute right-0 top-9 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50"
                            onClick={stop}
                          >
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                handleEdit(p.id);
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
                                handleDelete(p.id);
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
