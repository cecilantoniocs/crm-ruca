// /helpers/index.js
import axiosClient from '../config/axios';

/** Devuelve el usuario guardado en localStorage (si existe). */
export function getCurrentSeller() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('userData') : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Trae clientes SIN filtrar por ownerId.
 *
 * Uso nuevo (recomendado):
 *   getClients({ q: 'texto', clientOwner: 'cecil'|'rucapellan', type: 'b2b'|'b2c' })
 *
 * Uso legacy (compat):
 *   getClients(ownerId, q)  // ownerId se ignora para no restringir resultados
 */
export function getClients(arg1, q) {
  const params = {};
  if (arg1 && typeof arg1 === 'object') {
    const { q: qParam, clientOwner, type } = arg1;
    if (qParam && String(qParam).trim()) params.q = String(qParam).trim();
    if (clientOwner && clientOwner !== 'all') params.clientOwner = String(clientOwner).toLowerCase();
    if (type && type !== 'all') params.type = String(type).toLowerCase();
  } else {
    // Compat: getClients(ownerId, q) -> ignoramos ownerId, solo aplicamos q
    if (q && String(q).trim()) params.q = String(q).trim();
  }
  return axiosClient.get('clients', { params });
}

/** Lista de productos (puedes pasar query params si tu API los usa) */
export function getAllProducts(params) {
  return axiosClient.get('products', { params });
}

/** Lista de repartidores (can_deliver = true) */
export function getCouriers({ debug = false } = {}) {
  const params = {};
  if (debug) params.debug = '1';
  return axiosClient.get('couriers', { params });
}

/* ===========================
 * Pagos / Abonos (Payments)
 * ===========================
 * Endpoints previstos:
 *   GET    /api/payments                (filtros: clientId, from, to, method)
 *   POST   /api/payments
 *   PATCH  /api/payments/:id
 *   DELETE /api/payments/:id
 *   GET    /api/clients/:id/account     (estado de cuenta del cliente)
 */

/** Lista de pagos con filtros opcionales (clientId, rangos de fecha, método, etc.) */
export function getPayments(params) {
  return axiosClient.get('payments', { params });
}

/** Lista de pagos por cliente específico (azúcar sobre getPayments) */
export function getPaymentsByClient(clientId, params = {}) {
  return axiosClient.get('payments', { params: { clientId, ...params } });
}

/** Crea un pago (payload { clientId, amount, method, date, note, allocations[] ... }) */
export function createPayment(payload) {
  return axiosClient.post('payments', payload);
}

/** Actualiza un pago existente (monto, fecha, nota, asignaciones, etc.) */
export function updatePayment(paymentId, payload) {
  return axiosClient.patch(`payments/${paymentId}`, payload);
}

/** Elimina un pago por id */
export function deletePayment(paymentId) {
  return axiosClient.delete(`payments/${paymentId}`);
}

/** Estado de cuenta de un cliente (saldo, total adeudado, pagos, movimientos, etc.) */
export function getClientAccount(clientId, params) {
  return axiosClient.get(`clients/${clientId}/account`, { params });
}
