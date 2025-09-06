import axios from 'axios';

const axiosClient = axios.create({
  baseURL: '/api/',            // <- importante: usamos las rutas API de Next
  headers: { 'Content-Type': 'application/json' },
});

export default axiosClient;
