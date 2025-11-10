// public/sw.js

// Se instala y se activa al tiro
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// Fetch vacío (igual cuenta como SW válido para PWA)
self.addEventListener('fetch', (event) => {
  // Si quisieras cachear, aquí metes lógica luego
});
