// components/PaymentModal.jsx
import React, { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function PaymentModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error = '',
  context = null, // { orderId, clientId, clientName, method? }
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setAmount('');
    setNote('');
    setPaidAt(todayISO());
    if (context?.method) setMethod(String(context.method));
    else setMethod('efectivo');
  }, [isOpen, context?.orderId, context?.clientId]);

  if (!isOpen) return null;

  const submit = async () => {
    const amountNum = Number(amount);
    if (!context?.orderId || !context?.clientId) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    if (!paidAt) return;

    await onSubmit({
      amount: amountNum,
      method,
      paidAt,
      note: note || '',
    });
  };

  return (
    <div className="fixed inset-0 z-[999]">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={loading ? undefined : onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-coffee">Registrar abono</h3>
            <p className="mt-1 text-sm text-gray-600">
              Cliente:{' '}
              <span className="font-medium text-coffee">
                {context?.clientName || '—'}
              </span>
            </p>
            {context?.orderId ? (
              <p className="mt-0.5 text-xs text-gray-500">Pedido: #{context.orderId}</p>
            ) : null}
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Monto */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Monto (CLP)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">
                  <DollarSign size={16} />
                </span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ''))
                  }
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Método */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Método de pago
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Fecha del pago
              </label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>

            {/* Nota */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Nota (opcional)
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 resize-none"
                placeholder="Detalle del abono (opcional)"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={loading ? undefined : onClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee hover:bg-gray-50 active:scale-95 transition disabled:opacity-60"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={submit}
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-60 active:scale-95 transition"
            >
              {loading ? 'Guardando…' : 'Registrar abono'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
