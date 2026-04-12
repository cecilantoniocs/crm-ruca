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

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Notificación', body: event.data?.text() || '' };
  }

  const title = payload.title || 'Notificación';
  const options = {
    body: payload.body || '',
    icon: '/icon-192-maskable.png',
    badge: '/icon-192-maskable.png',
    data: payload.data || {},
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: abrir (o enfocar) la app y navegar a la URL indicada
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una pestaña abierta, enfocarla y navegar
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      // Si no hay pestaña abierta, abrir una nueva
      return self.clients.openWindow(url);
    })
  );
});

// Fetch vacío (igual cuenta como SW válido para PWA)
self.addEventListener('fetch', (event) => {
  // Aquí podrías agregar estrategia de caché si quieres (Stale-While-Revalidate, etc.)
});
