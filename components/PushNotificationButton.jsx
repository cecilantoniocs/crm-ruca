// components/PushNotificationButton.jsx
// Botón para que el repartidor active/desactive las notificaciones push.
// Solo se renderiza para usuarios con can_deliver = true.

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import axiosClient from '@/config/axios';
import { getCurrentUser } from '@/helpers/permissions';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getOrCreateSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub;
}

export default function PushNotificationButton() {
  const [status, setStatus] = useState('idle'); // 'idle'|'active'|'denied'|'loading'

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Detectar si ya hay suscripción activa
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setStatus('active');
      } catch {}
    })();
  }, []);

  const handleActivate = async () => {
    setStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      const sub = await getOrCreateSubscription();
      if (!sub) { setStatus('denied'); return; }

      await axiosClient.post('/push/subscribe', { subscription: sub.toJSON() });
      setStatus('active');
    } catch (e) {
      console.error('[Push] activar error', e);
      setStatus('idle');
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
      <Bell size={15} className={status === 'loading' ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">
        {status === 'loading' ? 'Activando…' : 'Activar notificaciones'}
      </span>
    </button>
  );
}
