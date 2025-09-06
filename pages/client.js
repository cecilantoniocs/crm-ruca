import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { getCurrentSeller, getClients } from '../helpers';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import {
  Phone,
  Pencil,
  Trash2,
  UserPlus,
  Search,
  MoreVertical,
  ShoppingCart,
} from 'lucide-react';
import { getCurrentUser, can, isAdmin, canAny } from '../helpers/permissions';
const user = getCurrentUser();

const ClientPage = () => {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null); // id de menú abierto (móvil/desktop)

  // Debounce 300ms
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
        const seller = getCurrentSeller?.();
        if (!seller?.id) {
          setClients([]);
          setLoadError('No se encontró el vendedor actual.');
          return;
        }
        const res = await getClients(seller.id);
        const ordered = (res?.data ?? []).sort((a, b) =>
          (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' })
        );
        setClients(ordered);
      } catch (err) {
        console.error(err);
        setLoadError('Error al cargar clientes.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredClients = useMemo(() => {
    if (!debounced) return clients;
    return clients.filter((c) => {
      const name = c?.name?.toLowerCase() || '';
      const local = c?.nombre_local?.toLowerCase() || '';
      return name.includes(debounced) || local.includes(debounced);
    });
  }, [clients, debounced]);

  // acciones
  const handleEdit = (id) => router.push(`/editclient/${id}`);
  const handleDelete = async (id) => {
    const ok = window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await axiosClient.delete(`users/${id}`);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar el cliente.');
    }
  };
  const handleNewOrder = (id) => {
    // TODO: cuando exista la página, navegar con:
    // router.push(`/neworder?clientId=${id}`)
    alert('Pronto: crear nuevo pedido para este cliente.');
  };

  // evitar que click dentro del menú cierre el menú (por el listener global)
  const stop = (e) => e.stopPropagation();

  return (
    <Layout>
      {/* Header modernizado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
          Lista de <span className="text-indigo-600">Clientes</span>
        </h1>

        <button
          onClick={() => router.push('/newclient')}
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow hover:bg-indigo-700 active:scale-95 transition"
        >
          <UserPlus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Buscador estilizado */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Buscar por nombre o local..."
          className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && <p className="text-gray-600">Cargando clientes…</p>}
      {!loading && loadError && <p className="text-red-600">{loadError}</p>}
      {!loading && !loadError && filteredClients.length === 0 && (
        <p className="text-gray-600">No hay clientes que coincidan con la búsqueda.</p>
      )}

      {/* MOBILE: Cards */}
      {!loading && !loadError && filteredClients.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filteredClients.map((c) => (
            <div
              key={c.id}
              className="relative bg-white rounded-xl shadow p-3 border border-gray-100"
              onClick={stop}
            >
              {/* Botón ⋯ arriba derecha */}
              <div className="absolute right-2 top-2">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((v) => (v === c.id ? null : c.id));
                  }}
                  aria-label="Más opciones"
                  title="Más opciones"
                >
                  <MoreVertical size={18} />
                </button>

                {/* Menú flotante */}
                {openMenuId === c.id && (
                  <div
                    className="absolute right-0 mt-2 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-10"
                    onClick={stop}
                  >
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setOpenMenuId(null);
                        handleEdit(c.id);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        setOpenMenuId(null);
                        handleDelete(c.id);
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>

              {/* Título */}
              <div className="pr-10">
                <h3 className="text-base font-semibold text-gray-900">{c.name || '—'}</h3>
                <p className="text-sm text-gray-600">{c.nombre_local || '—'}</p>
              </div>

              {/* Dirección → Zona → Ciudad → Teléfono */}
              <div className="mt-3 space-y-1.5">
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Dirección: </span>
                  {c.dir1 || '—'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Zona: </span>
                  {c.zona || '—'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Ciudad: </span>
                  {c.ciudad || '—'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Teléfono: </span>
                  {c.telefono || '—'}
                </p>
              </div>

              {/* Acciones: Llamar + Nuevo pedido (abajo derecha) */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {c.telefono && (
                    <a
                      href={`tel:${c.telefono}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm active:scale-95 transition"
                      aria-label="Llamar"
                      title="Llamar"
                    >
                      <Phone size={18} />
                    </a>
                  )}
                </div>

                <button
                  onClick={() => handleNewOrder(c.id)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 shadow-sm active:scale-95 transition"
                  aria-label="Nuevo pedido"
                  title="Nuevo pedido"
                >
                  <ShoppingCart size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP: Tabla moderna con ⋯ y Pedido */}
      {!loading && !loadError && filteredClients.length > 0 && (
        <div className="hidden sm:block" onClick={stop}>
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Local
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Dirección
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Zona
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Ciudad
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Teléfono
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">
                      Pedido
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredClients.map((c, idx) => (
                    <tr
                      key={c.id}
                      className={`${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } hover:bg-gray-100 transition-colors`}
                    >
                      <td className="px-6 py-3 text-sm text-gray-900">{c.name || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{c.nombre_local || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{c.dir1 || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{c.zona || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{c.ciudad || '—'}</td>
                      <td className="px-6 py-3 text-sm">
                        {c.telefono ? (
                          <a className="text-indigo-600 hover:underline" href={`tel:${c.telefono}`}>
                            {c.telefono}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Pedido */}
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNewOrder(c.id);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 shadow-sm active:scale-95 transition"
                          aria-label="Nuevo pedido"
                          title="Nuevo pedido"
                        >
                          <ShoppingCart size={16} />
                        </button>
                      </td>

                      {/* Acciones (⋯ con Editar/Eliminar) */}
                      <td className="px-6 py-3">
                        <div className="relative flex items-center justify-center">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId((v) => (v === c.id ? null : c.id));
                            }}
                            aria-label="Más opciones"
                            title="Más opciones"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openMenuId === c.id && (
                            <div
                              className="absolute right-0 top-9 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-10"
                              onClick={stop}
                            >
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleEdit(c.id);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleDelete(c.id);
                                }}
                              >
                                Eliminar
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
        </div>
      )}
    </Layout>
  );
};

export default ClientPage;
