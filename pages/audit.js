// /pages/audit.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import DateInput from '../components/DateInput';
import axiosClient from '../config/axios';
import { ShieldCheck, Search, Filter } from 'lucide-react';
import { isAdmin, getCurrentUser } from '../helpers/permissions';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

// ── Acción → etiqueta + color ──────────────────────────────────────────────
const ACTION_MAP = {
  'order.created':               { label: 'Pedido creado',             color: 'emerald' },
  'order.updated':               { label: 'Pedido editado',            color: 'blue' },
  'order.deleted':               { label: 'Pedido eliminado',          color: 'rose' },
  'order.delivered':             { label: 'Marcado entregado',         color: 'emerald' },
  'order.paid':                  { label: 'Marcado pagado',            color: 'emerald' },
  'order.unpaid':                { label: 'Desmarcado pagado',         color: 'amber' },
  'order.status_changed':        { label: 'Estado cambiado',           color: 'amber' },
  'order.payment_method_changed':{ label: 'Método de pago',            color: 'blue' },
  'order.invoice_updated':       { label: 'Factura actualizada',       color: 'blue' },
  'order.courier_assigned':      { label: 'Repartidor asignado',       color: 'blue' },
  'payment.created':             { label: 'Abono registrado',          color: 'emerald' },
  'payment.deleted':             { label: 'Abono eliminado',           color: 'rose' },
  'client.created':              { label: 'Cliente creado',            color: 'emerald' },
  'client.updated':              { label: 'Cliente editado',           color: 'blue' },
  'client.deleted':              { label: 'Cliente eliminado',         color: 'rose' },
};

const COLOR_CLS = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue:    'bg-blue-50 text-blue-700 ring-blue-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  amber:   'bg-amber-50 text-amber-700 ring-amber-200',
  gray:    'bg-gray-100 text-gray-600 ring-gray-200',
};

const ActionBadge = ({ action }) => {
  const info = ACTION_MAP[action] || { label: action, color: 'gray' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${COLOR_CLS[info.color]}`}>
      {info.label}
    </span>
  );
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AuditPage() {
  const me = useMemo(() => getCurrentUser(), []);

  const [logs, setLogs]         = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage]         = useState(0);

  // Filtros
  const [from, setFrom]           = useState(today());
  const [to, setTo]               = useState(today());
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Cargar usuarios para el filtro
  useEffect(() => {
    axiosClient.get('users').then(({ data }) => setUsers(data || [])).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const params = { from, to };
      if (userFilter !== 'all') params.userId = userFilter;
      const { data } = await axiosClient.get('audit', { params });
      setLogs(data || []);
    } catch (err) {
      setLoadError(err?.response?.data?.error || 'Error al cargar auditoría.');
    } finally {
      setLoading(false);
    }
  }, [from, to, userFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = useMemo(() => {
    if (!debounced) return logs;
    return logs.filter((l) =>
      (l.user_name || '').toLowerCase().includes(debounced) ||
      (l.description || '').toLowerCase().includes(debounced) ||
      (ACTION_MAP[l.action]?.label || l.action || '').toLowerCase().includes(debounced)
    );
  }, [logs, debounced]);

  // Resetear página al cambiar filtros
  useEffect(() => { setPage(0); }, [filtered]);

  const paginated = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  // Solo admins
  if (!isAdmin(me)) {
    return (
      <Layout>
        <p className="text-rose-600 mt-8 text-center">Acceso restringido — solo administradores.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={28} className="text-brand-600" />
        <h1 className="text-3xl font-bold text-coffee tracking-tight">
          Auditoría <span className="text-brand-600">de Actividad</span>
        </h1>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <DateInput
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <DateInput
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          >
            <option value="all">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Acción, usuario, descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-lg border border-gray-300 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
        </div>
      </div>
      </div>

      {/* Contador */}
      {!loading && !loadError && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          {debounced ? ' (filtrado)' : ''}
        </p>
      )}


      {loading && <p className="text-gray-500 text-sm">Cargando…</p>}
      {!loading && loadError && <p className="text-rose-600 text-sm">{loadError}</p>}

      {/* MOBILE: Cards */}
      {!loading && !loadError && (
        <div className="sm:hidden space-y-3">
          {filtered.length === 0 && <p className="text-gray-500 text-sm">Sin registros para este período.</p>}
          {paginated.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow p-4 space-y-2">
              <div className="flex items-center justify-between">
                <ActionBadge action={l.action} />
                <span className="text-xs text-gray-400">{fmtDateTime(l.created_at)}</span>
              </div>
              <p className="text-sm font-semibold text-coffee">{l.user_name || '—'}</p>
              {l.description && <p className="text-sm text-gray-600">{l.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP: Tabla */}
      {!loading && !loadError && (
        <div className="hidden sm:block rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="min-w-full w-full">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">Fecha y hora</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Usuario</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Acción</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-gray-500">
                    Sin registros para este período.
                  </td>
                </tr>
              )}
              {paginated.map((l, idx) => (
                <tr key={l.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                  <td className="px-5 py-3 text-sm font-medium text-coffee">{l.user_name || '—'}</td>
                  <td className="px-5 py-3"><ActionBadge action={l.action} /></td>
                  <td className="px-5 py-3 text-sm text-gray-600">{l.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && (
        <Pagination page={page} total={filtered.length} onChange={setPage} />
      )}
    </Layout>
  );
}
