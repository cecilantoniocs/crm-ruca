// /pages/users.js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import { Search, UserPlus, MoreVertical, Trash2, Pencil } from 'lucide-react';
import { getCurrentUser, can, isAdmin } from '../helpers/permissions';

function timeAgoLabel(iso) {
  if (!iso) return 'Nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Ahora';
  const s = Math.floor(ms / 1000);
  if (s < 10) return 'Ahora';
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

const OnlineDot = ({ online }) => (
  <span
    className={`inline-block h-2.5 w-2.5 rounded-full ${
      online ? 'bg-emerald-500' : 'bg-gray-300'
    }`}
    aria-hidden="true"
  />
);

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  // usuario actual y flags de permisos (crear/editar/eliminar)
  const me = useMemo(() => getCurrentUser(), []);
  const canCreateUsers = useMemo(() => isAdmin(me) || can('users.create', null, me), [me]);
  const canEditUsers   = useMemo(() => isAdmin(me) || can('users.edit',   null, me), [me]);
  const canDeleteUsers = useMemo(() => isAdmin(me) || can('users.delete', null, me), [me]);

  // Cerrar menú ⋯ al hacer click fuera
  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Cargar usuarios
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get('users');
        const list = (res?.data ?? [])
          .filter((u) => String(u.role || '').toLowerCase() !== 'client')
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
        setUsers(list);
      } catch (e) {
        console.error(e);
        setLoadError('Error al cargar usuarios.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sólo filtrar por texto (nombre/email)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const text = `${u.name || ''} ${u.email || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [users, search]);

  const handleDelete = async (id) => {
    if (!(isAdmin(me) || canDeleteUsers)) return;
    if (!confirm('¿Eliminar este usuario?')) return;
    try {
      await axiosClient.delete(`users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar.');
    }
  };

  const RoleBadge = ({ role }) => {
    const r = String(role || '').toLowerCase();
    const map = {
      admin: 'bg-gray-900 text-white ring-gray-900/10',
      vendedor: 'bg-blue-50 text-blue-700 ring-blue-200',
      repartidor: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
      supervisor: 'bg-red-50 text-red-700 ring-red-200',
      produccion: 'bg-green-50 text-green-700 ring-green-200',
    };
    const cls = map[r] || 'bg-gray-50 text-coffee ring-gray-200';
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${cls}`}>
        {role || '—'}
      </span>
    );
  };

  const stop = (e) => e.stopPropagation();

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Gestión de <span className="text-brand-600">Usuarios</span>
        </h1>

        {canCreateUsers && (
          <button
            onClick={() => router.push('/newuser')}
            className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium shadow hover:bg-brand-700 active:scale-95 transition"
          >
            <UserPlus size={18} />
            Nuevo Usuario
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="mb-5">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o email…"
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading && <p className="text-gray-600">Cargando usuarios…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-gray-600">Sin usuarios.</p>
      )}

      {/* MOBILE: cards */}
      {!loading && filtered.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filtered.map((u, idx) => {
            const isLast = idx === filtered.length - 1;
            const lastLabel = timeAgoLabel(u.last_seen_at);
            const hasAnyActions = canEditUsers || canDeleteUsers; // ocultar ⋯ si no hay acciones
            return (
              <div
                key={u.id}
                className="relative bg-white rounded-xl shadow p-3 border border-gray-100"
                onClick={stop}
              >
                <div className="flex items-start justify-between">
                  <div className="pr-10">
                    <h3 className="text-base font-semibold text-coffee">{u.name || '—'}</h3>
                    <p className="text-sm text-gray-600">{u.email || '—'}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <OnlineDot online={!!u.online} />
                      <span>{u.online ? 'En línea' : `Visto ${lastLabel}`}</span>
                    </p>
                  </div>

                  {hasAnyActions && (
                    <div className="relative">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition text-gray-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId((v) => (v === u.id ? null : u.id));
                        }}
                        aria-label="Más opciones"
                        title="Más opciones"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenuId === u.id && (
                        <div
                          className={
                            `absolute right-0 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-50 ` +
                            (isLast ? 'bottom-9 top-auto origin-bottom-right' : 'top-9 origin-top-right')
                          }
                          onClick={stop}
                        >
                          {canEditUsers && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                router.push(`/edituser/${encodeURIComponent(u.id)}`);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Pencil size={14} /> Editar
                              </div>
                            </button>
                          )}
                          {canDeleteUsers && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                handleDelete(u.id);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Trash2 size={14} /> Eliminar
                              </div>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <RoleBadge role={u.role} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DESKTOP: tabla */}
      {!loading && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="relative rounded-xl border border-gray-200 shadow-sm overflow-visible">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Nombre</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Email</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Rol</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((u, idx) => {
                  const isLast = idx === filtered.length - 1;
                  const lastLabel = timeAgoLabel(u.last_seen_at);
                  const hasAnyActions = canEditUsers || canDeleteUsers;
                  return (
                    <tr
                      key={u.id}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                    >
                      <td className="px-6 py-3 text-sm text-coffee">{u.name || '—'}</td>
                      <td className="px-6 py-3 text-sm text-coffee">{u.email || '—'}</td>
                      <td className="px-6 py-3 text-sm text-coffee">
                        <span className="inline-flex items-center gap-2">
                          <OnlineDot online={!!u.online} />
                          <span>{u.online ? 'En línea' : `Visto ${lastLabel}`}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <div className="relative flex items-center justify-center" onClick={stop}>
                          {hasAnyActions ? (
                            <>
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
                                onClick={() => setOpenMenuId((v) => (v === u.id ? null : u.id))}
                                aria-label="Más opciones"
                                title="Más opciones"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {openMenuId === u.id && (
                                <div
                                  className={
                                    `absolute right-0 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50 ` +
                                    (isLast ? 'bottom-9 top-auto origin-bottom-right' : 'top-9 origin-top-right')
                                  }
                                >
                                  {canEditUsers && (
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => router.push(`/edituser/${encodeURIComponent(u.id)}`)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Pencil size={14} /> Editar
                                      </div>
                                    </button>
                                  )}
                                  {canDeleteUsers && (
                                    <button
                                      className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                                      onClick={() => handleDelete(u.id)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Trash2 size={14} /> Eliminar
                                      </div>
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
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
}
