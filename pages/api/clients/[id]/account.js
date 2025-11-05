// /pages/client/[id]/account.js
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axiosClient from '../../../config/axios';

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return '—';
  }
};

export default function ClientAccountPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const res = await axiosClient.get(`clients/${id}`); // ← /api/clients/[id]
        setData(res?.data ?? null);
      } catch (e) {
        console.error(e);
        setErr('No se pudo cargar la cuenta del cliente.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totals = data?.totals || { ordersTotal: 0, paymentsTotal: 0, balance: 0 };
  const orders = data?.orders || [];
  const payments = data?.payments || [];
  const client = data?.client;

  const headerLeft = useMemo(() => CLP.format(totals.ordersTotal || 0), [totals]);
  const headerMid = useMemo(() => CLP.format(totals.paymentsTotal || 0), [totals]);
  const headerRight = useMemo(() => CLP.format(totals.balance || 0), [totals]);

  return (
    <Layout>
      {loading && <p className="text-gray-600">Cargando cuenta…</p>}
      {!loading && err && <p className="text-rose-600">{err}</p>}
      {!loading && !err && (
        <>
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-coffee-900">
              {client?.name || 'Cliente'}{client?.local_name ? ` · ${client.local_name}` : ''}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">Dirección:</span> {client?.dir1 || '—'}
              {' · '}
              <span className="font-medium">Ciudad:</span> {client?.ciudad || '—'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Total pedidos</div>
              <div className="text-lg font-semibold text-coffee-900">{headerLeft}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Total abonos</div>
              <div className="text-lg font-semibold text-emerald-700">-{headerMid}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-gray-500 text-sm">Saldo</div>
              <div className="text-lg font-semibold text-rose-600">{headerRight}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pedidos */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-coffee-900 font-semibold">🛒 Pedidos</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full table-auto">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs text-gray-600 uppercase">
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Local</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {orders.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-3 text-gray-500">Sin pedidos</td></tr>
                    )}
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-2">{fmtDate(o.date)}</td>
                        <td className="px-4 py-2">{o.clientLocal || '—'}</td>
                        <td className="px-4 py-2 text-right">{CLP.format(Number(o.total) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Abonos */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-coffee-900 font-semibold">💳 Abonos</span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full table-auto">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs text-gray-600 uppercase">
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Método</th>
                      <th className="px-4 py-2">Nota</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {payments.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-3 text-gray-500">Sin abonos</td></tr>
                    )}
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2">{fmtDate(p.paidAt)}</td>
                        <td className="px-4 py-2">{(p.method || 'efectivo')[0].toUpperCase() + (p.method || 'efectivo').slice(1)}</td>
                        <td className="px-4 py-2">{p.note || '—'}</td>
                        <td className="px-4 py-2 text-right text-emerald-700">-{CLP.format(Number(p.amount) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
