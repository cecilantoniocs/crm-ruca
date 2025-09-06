// /pages/users.js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import { Search, UserPlus, MoreVertical, Trash2, Pencil, ShieldCheck } from 'lucide-react';

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get('users');
        const list = (res?.data ?? []).filter(u => String(u.role || '').toLowerCase() !== 'client');
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
        setUsers(list);
      } catch (e) {
        console.error(e);
        setLoadError('Error al cargar usuarios.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      const okRole = roleFilter === 'all' || String(u.role || '').toLowerCase() === roleFilter;
      const text = `${u.name || ''} ${u.email || ''} ${u.profileName || ''}`.toLowerCase();
      return okRole && (!q || text.includes(q));
    });
  }, [users, search, roleFilter]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    try {
      await axiosClient.delete(`users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar.');
    }
  };

  const RoleBadge = ({ role }) => {
    const r = String(role || '').toLowerCase();
    const map = {
      admin: 'bg-gray-900 text-white',
      repartidor: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      vendedor: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
      supervisor: 'bg-amber-50 text-amber-700 ring-amber-200',
    };
    const cls = map[r] || 'bg-gray-50 text-gray-700 ring-gray-200';
    return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${cls}`}>{role || '—'}</span>;
  };

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
          Gestión de <span className="text-indigo-600">Usuarios</span>
        </h1>

        <button
          onClick={() => router.push('/newuser')}
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow hover:bg-indigo-700 active:scale-95 transition"
        >
          <UserPlus size={18} />
          Nuevo Usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o perfil…"
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
          <option value="repartidor">Repartidor</option>
          <option value="supervisor">Supervisor</option>
        </select>
      </div>

      {loading && <p className="text-gray-600">Cargando usuarios…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && <p className="text-gray-600">Sin usuarios.</p>}

      {/* MOBILE: cards */}
      {!loading && filtered.length > 0 && (
        <div className="sm:hidden space-y-3">
          {filtered.map((u) => (
            <div key={u.id} className="relative bg-white rounded-xl shadow p-3 border border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{u.name || '—'}</h3>
                  <p className="text-sm text-gray-600">{u.email || '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Perfil: <span className="font-medium">{u.profileName || '—'}</span></p>
                </div>
                <RoleBadge role={u.role} />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <ShieldCheck size={14} className="text-gray-400" /> Permisos por módulo
                </span>
              </div>

              {/* acciones */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => router.push(`/edituser/${u.id}`)}
                  className="inline-flex h-8 px-3 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700 active:scale-95"
                >
                  <Pencil size={14} className="mr-1" /> Editar
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="inline-flex h-8 px-3 items-center justify-center rounded-lg bg-rose-600 text-white text-xs hover:bg-rose-700 active:scale-95"
                >
                  <Trash2 size={14} className="mr-1" /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP: tabla */}
      {!loading && filtered.length > 0 && (
        <div className="hidden sm:block">
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Nombre</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Email</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Perfil</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Rol</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((u, idx) => (
                  <tr key={u.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100`}>
                    <td className="px-6 py-3 text-sm text-gray-900">{u.name || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{u.email || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{u.profileName || '—'}</td>
                    <td className="px-6 py-3 text-sm"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-3 text-sm">
                      <div className="relative flex items-center justify-center">
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
                          onClick={() => setOpenMenuId(v => v === u.id ? null : u.id)}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === u.id && (
                          <div className="absolute right-0 top-9 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => router.push(`/edituser/${u.id}`)}
                            >
                              <div className="flex items-center gap-2"><Pencil size={14} /> Editar</div>
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                              onClick={() => handleDelete(u.id)}
                            >
                              <div className="flex items-center gap-2"><Trash2 size={14} /> Eliminar</div>
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
