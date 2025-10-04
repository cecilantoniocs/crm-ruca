import axios from 'axios';

const axiosClient = axios.create({
  baseURL: '/api/',            // usamos las rutas API de Next
  headers: { 'Content-Type': 'application/json' },
});

/**
 * FIX: Normaliza URLs para evitar '/api//ruta' si alguien usa axiosClient.get('/ruta').
 */
axiosClient.interceptors.request.use((config) => {
  if (typeof config.url === 'string' && config.url.startsWith('/')) {
    config.url = config.url.slice(1); // quita el slash inicial
  }
  return config;
});

export default axiosClient;
