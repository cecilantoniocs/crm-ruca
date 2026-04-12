// public/sw.js

// NOTA: ya no forzamos skipWaiting en install; sólo al recibir el mensaje 'SKIP_WAITING'.
// Así podemos avisar primero y actualizar cuando el usuario acepte.

self.addEventListener('install', (event) => {
  // Cuando se instala (incluido un update), avisamos a las páginas abiertas.
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      // En primera instalación no habrá controller; la app lo filtra y no muestra popup.
      client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
    }
  })());
});

self.addEventListener('activate', (event) => {
  // Tomar control de todas las pestañas inmediatamente al activar
  event.waitUntil(self.clients.claim());
});

// Permitir que la página nos pida activar el SW nuevo altiro.
self.addEventListener('message', (event) => {
  const msg = event?.data;
  if (msg && msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch vacío (igual cuenta como SW válido para PWA)
self.addEventListener('fetch', (event) => {
  // Aquí podrías agregar estrategia de caché si quieres (Stale-While-Revalidate, etc.)
});
