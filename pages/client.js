// pages/client.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import { Phone, UserPlus, Search, MoreVertical, ShoppingCart } from 'lucide-react';

// ⬇️ Pull-to-refresh (window)
import PullToRefreshHeader from '../components/PullToRefreshHeader';
import usePullToRefreshWindow from '../hooks/usePullToRefreshWindow';

const pillCls = 'inline-flex items-center rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium';

const ClientPage = () => {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null); // id del popover abierto

  // Filtros UI
  const [ownerFilter, setOwnerFilter] = useState('all'); // all | rucapellan | cecil
  const [typeFilter, setTypeFilter] = useState('all');   // all | b2b | b2c

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

  // ✅ Refetch unificado (misma lógica que tenías)
  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');

      const params = {};
      if (debounced) params.q = debounced;
      if (ownerFilter !== 'all') params.clientOwner = ownerFilter;
      if (typeFilter !== 'all')  params.type = typeFilter;

      const res = await axiosClient.get('clients', { params });
      const ordered = (res?.data ?? []).sort((a, b) =>
        (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' })
      );
      setClients(ordered);
    } catch (err) {
      console.error(err);
      setLoadError('Error al cargar clientes.');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, ownerFilter, typeFilter]);

  // Cargar clientes cuando cambian búsqueda/filtros
  useEffect(() => {
    refetch();
  }, [refetch]);

  const normalized = (c) => {
    const clientOwner = (c.clientOwner ?? c.client_owner ?? '').toString().toLowerCase();
    const clientType  = (c.clientType  ?? c.client_type  ?? '').toString().toLowerCase();
    return { ...c, clientOwner, clientType };
  };

  const filteredClients = useMemo(() => {
    // Ya viene filtrado desde API según q/owner/type. Lo dejamos así para consistencia.
    return clients.map(normalized);
  }, [clients]);

  // acciones
  const handleEdit = (id) => router.push(`/editclient/${id}`);

  const handleDelete = async (id) => {
    const ok = window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await axiosClient.delete(`clients/${id}`);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar el cliente.');
    }
  };

  // ✅ Ir a crear pedido con el cliente preseleccionado
  const handleNewOrder = (id) => {
    router.push({
      pathname: '/neworder',
      query: { clientId: id },
    });
  };

  const stop = (e) => e.stopPropagation();

  const typePill = (t) => {
    const v = (t || '').toString().toLowerCase();
    if (v === 'b2c') {
      return (
        <span className={`${pillCls} bg-brand-50 text-brand-700 ring-brand-200`}>
          B2C
        </span>
      );
    }
    return (
      <span className={`${pillCls} bg-coffee-50 text-coffee-700 ring-coffee-200`}>
        B2B
      </span>
    );
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

  // ⬇️ Hook pull-to-refresh acoplado a window
  const { headerProps } = usePullToRefreshWindow({ onRefresh: refetch, threshold: 60 });

  return (
    <Layout>
      {/* Header de Pull-To-Refresh pegado arriba */}
      <PullToRefreshHeader {...headerProps} />

      {/* Header + acciones */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-coffee-900 tracking-tight">
          Lista de <span className="text-brand-700">Clientes</span>
        </h1>

        <button
          onClick={() => router.push('/newclient')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium shadow hover:bg-brand-700 active:scale-95 transition"
        >
          <UserPlus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Filtros superiores */}
      <div className="grid gap-3 sm:grid-cols-3 sm:items-end mb-6">
        {/* Buscar */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Nombre o local..."
              className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Asignado a */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Asignado a</label>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="rucapellan">Rucapellan</option>
            <option value="cecil">Cecil</option>
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="b2b">B2B</option>
            <option value="b2c">B2C</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-gray-600">Cargando clientes…</p>}
      {!loading && loadError && <p className="text-danger-600">{loadError}</p>}
      {!loading && !loadError && filteredClients.length === 0 && (
        <p className="text-gray-600">No hay clientes que coincidan con los filtros.</p>
      )}

      {/* MOBILE: Cards */}
      {!loading && !loadError && filteredClients.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filteredClients.map((c, idx) => {
            const isLast = idx === filteredClients.length - 1;
            const { clientType, clientOwner } = normalized(c);
            const stop = (e) => e.stopPropagation();
            return (
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
                      className={
                        `absolute right-0 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50 ` +
                        (isLast ? 'bottom-9 top-auto origin-bottom-right' : 'top-9 origin-top-right')
                      }
                      onClick={stop}
                    >
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => { setOpenMenuId(null); handleEdit(c.id); }}
                      >
                        Editar
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                        onClick={() => { setOpenMenuId(null); handleDelete(c.id); }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                {/* Título + chips */}
                <div className="pr-10">
                  <h3 className="text-base font-semibold text-coffee-900">{c.name || '—'}</h3>
                  <p className="text-sm text-gray-600">{c.nombre_local || '—'}</p>
                  <div className="mt-2 flex gap-2">
                    {typePill(clientType)}
                    {ownerPill(clientOwner)}
                  </div>
                </div>

                {/* Datos */}
                <div className="mt-3 space-y-1.5">
                  <p className="text-sm text-coffee-900"><span className="font-medium">Dirección: </span>{c.dir1 || '—'}</p>
                  <p className="text-sm text-coffee-900"><span className="font-medium">Zona: </span>{c.zona || '—'}</p>
                  <p className="text-sm text-coffee-900"><span className="font-medium">Ciudad: </span>{c.ciudad || '—'}</p>
                  <p className="text-sm text-coffee-900"><span className="font-medium">Teléfono: </span>{c.telefono || '—'}</p>
                </div>

                {/* Acciones rápidas */}
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
            );
          })}
        </div>
      )}

      {/* DESKTOP: Tabla (estilo productos) */}
      {!loading && !loadError && filteredClients.length > 0 && (
        <div className="hidden sm:block">
          {/* contenedor scroll horizontal sin centrar */}
          <div className="w-full overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full table-auto">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr className="text-left">
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Nombre</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Local</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Dirección</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Zona</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Ciudad</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Teléfono</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Tipo</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cartera</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Pedido</th>
                  <th className="px-4 lg:px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredClients.map((c, idx) => {
                  const isLast = idx === filteredClients.length - 1;
                  const { clientType, clientOwner } = normalized(c);
                  const stop = (e) => e.stopPropagation();
                  return (
                    <tr
                      key={c.id}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                    >
                      <td className="px-4 lg:px-6 py-3 text-sm text-coffee-900">{c.name || '—'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm text-coffee-900">{c.nombre_local || '—'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm text-coffee-900">{c.dir1 || '—'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm text-coffee-900">{c.zona || '—'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm text-coffee-900">{c.ciudad || '—'}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">
                        {c.telefono ? (
                          <a className="text-brand-700 hover:underline" href={`tel:${c.telefono}`}>
                            {c.telefono}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{typePill(clientType)}</td>
                      <td className="px-4 lg:px-6 py-3 text-sm">{ownerPill(clientOwner)}</td>

                      {/* Pedido */}
                      <td className="px-4 lg:px-6 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleNewOrder(c.id); }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 shadow-sm active:scale-95 transition"
                          aria-label="Nuevo pedido"
                          title="Nuevo pedido"
                        >
                          <ShoppingCart size={16} />
                        </button>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 lg:px-6 py-3">
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
                              className={
                                `absolute right-0 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50 ` +
                                (isLast ? 'bottom-9 top-auto origin-bottom-right' : 'top-9 origin-top-right')
                              }
                              onClick={stop}
                            >
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => { setOpenMenuId(null); handleEdit(c.id); }}
                              >
                                Editar
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                                onClick={() => { setOpenMenuId(null); handleDelete(c.id); }}
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ClientPage;
