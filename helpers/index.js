// helpers/index.js
import axiosClient from '../config/axios';

export const getCurrentSeller = () =>
  JSON.parse(localStorage.getItem('userData') || 'null');

export const getClients = async (ownerId, q) => {
  const params = new URLSearchParams();
  if (ownerId) params.set('ownerId', ownerId);
  if (q && String(q).trim()) params.set('q', q.trim());
  const qs = params.toString() ? `?${params.toString()}` : '';
  // 👇 importante: NADA de /api aquí
  return axiosClient.get(`/clients${qs}`);
};
