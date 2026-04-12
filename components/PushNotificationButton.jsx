// components/PushNotificationButton.jsx
// Botón para activar/desactivar las notificaciones push.
// Mostrado a repartidores, admins y supervisores (ver Header/index.js).

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, AlertCircle } from 'lucide-react';
import axiosClient from '@/config/axios';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  if (!base64String) throw new Error('VAPID public key no definida');
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationButton() {
  // 'idle' | 'active' | 'denied' | 'loading' | 'error'
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('denied');
      return;
    }
    // Detectar si ya hay suscripción activa al cargar
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setStatus('active');
      } catch {}
    })();
  }, []);

  const handleActivate = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('denied');
        return;
      }

      // iOS requiere que requestPermission y serviceWorker.ready se resuelvan
      // lo más cerca posible del gesto del usuario.
      // Ejecutar ambos en paralelo para minimizar el delay antes de subscribe().
      const [permission, reg] = await Promise.all([
        Notification.requestPermission(),
        navigator.serviceWorker.ready,
      ]);

      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      // subscribe() debe llamarse inmediatamente después del permission grant
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      if (!sub) {
        setStatus('error');
        setErrorMsg('No se pudo crear la suscripción push');
        return;
      }

      await axiosClient.post('/push/subscribe', { subscription: sub.toJSON() });
      setStatus('active');
    } catch (e) {
      console.error('[Push] activar error', e);
      setStatus('error');
      setErrorMsg(e?.message || 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    setStatus('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await axiosClient.delete('/push/subscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus('idle');
    } catch (e) {
      console.error('[Push] desactivar error', e);
      setStatus('idle');
    }
  };

  if (status === 'denied') return null;

  if (status === 'error') {
    return (
      <button
        onClick={handleActivate}
        title={`Error: ${errorMsg} — Tap para reintentar`}
        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
      >
        <AlertCircle size={15} />
        <span className="hidden sm:inline">Error — Reintentar</span>
      </button>
    );
  }

  if (status === 'active') {
    return (
      <button
        onClick={handleDeactivate}
        title="Desactivar notificaciones de pedidos"
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
      >
        <BellOff size={15} />
        <span className="hidden sm:inline">Notificaciones activas</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleActivate}
      disabled={status === 'loading'}
      title="Activar notificaciones de pedidos"
      className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 transition-colors px-2 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-50"
    >
      {status === 'loading'
        ? <BellRing size={15} className="animate-pulse" />
        : <Bell size={15} />
      }
      <span className="hidden sm:inline">
        {status === 'loading' ? 'Activando…' : 'Activar notificaciones'}
      </span>
    </button>
  );
}
