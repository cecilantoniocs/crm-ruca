// components/PushNotificationButton.jsx
import { useEffect, useState, useRef } from 'react';
import { Bell, BellOff, BellRing, AlertCircle } from 'lucide-react';
import axiosClient from '@/config/axios';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const STATUS_KEY       = 'pushStatus'; // 'active' | 'error:<msg>' | unset

function urlBase64ToUint8Array(base64String) {
  if (!base64String) throw new Error('VAPID_PUBLIC_KEY no definida');
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function readStored() {
  try {
    const v = localStorage.getItem(STATUS_KEY) || '';
    if (v === 'active') return { status: 'active', error: '' };
    if (v.startsWith('error:')) return { status: 'error', error: v.slice(6) };
  } catch {}
  return { status: 'idle', error: '' };
}

export default function PushNotificationButton() {
  const init = typeof window !== 'undefined' ? readStored() : { status: 'idle', error: '' };
  const [status,   setStatus]   = useState(init.status);
  const [errorMsg, setErrorMsg] = useState(init.error);
  const regRef = useRef(null);

  const saveError = (msg) => {
    try { localStorage.setItem(STATUS_KEY, `error:${msg}`); } catch {}
    setErrorMsg(msg);
    setStatus('error');
  };

  // ── Verificar / auto-reactivar suscripción al montar ─────────────────────────
  useEffect(() => {
    if (!supported()) { setStatus('unsupported'); return; }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        regRef.current = reg;
        const sub = await reg.pushManager.getSubscription();

        if (sub) {
          try { localStorage.setItem(STATUS_KEY, 'active'); } catch {}
          setStatus('active');
          return;
        }

        const perm      = Notification.permission;
        const storedVal = localStorage.getItem(STATUS_KEY) || '';
        const wasActive = storedVal === 'active';
        const hadError  = storedVal.startsWith('error:');

        // Preservar error guardado — no pisarlo con 'idle'
        if (hadError) return;

        // Permiso concedido pero suscripción perdida (bug iOS) → re-suscribir
        if (perm === 'granted' && wasActive) {
          try {
            const newSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            if (newSub) {
              await axiosClient.post('/push/subscribe', { subscription: newSub.toJSON() });
              try { localStorage.setItem(STATUS_KEY, 'active'); } catch {}
              setStatus('active');
              return;
            }
          } catch (e) {
            saveError(`AutoResub: ${e?.name ?? '?'}: ${e?.message ?? ''}`);
            return;
          }
        }

        try { localStorage.removeItem(STATUS_KEY); } catch {}
        setStatus(perm === 'denied' ? 'blocked' : 'idle');
      } catch {
        // mantener estado previo
      }
    })();
  }, []);

  // ── Suscribir ─────────────────────────────────────────────────────────────────
  const handleActivate = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      if (!supported()) {
        throw Object.assign(new Error('Push no soportado en este navegador'), { name: 'UnsupportedError' });
      }

      // CRÍTICO iOS: requestPermission() debe iniciarse antes de cualquier await
      const permPromise = Notification.requestPermission();
      const swPromise   = regRef.current
        ? Promise.resolve(regRef.current)
        : navigator.serviceWorker.register('/sw.js');

      const [permission, reg] = await Promise.all([permPromise, swPromise]);
      regRef.current = reg;

      if (permission !== 'granted') {
        try { localStorage.removeItem(STATUS_KEY); } catch {}
        setStatus('blocked');
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      if (!sub) throw new Error('subscribe() devolvió null');

      await axiosClient.post('/push/subscribe', { subscription: sub.toJSON() });
      try { localStorage.setItem(STATUS_KEY, 'active'); } catch {}
      setStatus('active');
    } catch (e) {
      console.error('[Push]', e?.name, e?.message);
      if (e?.name === 'NotAllowedError') {
        try { localStorage.removeItem(STATUS_KEY); } catch {}
        setStatus('blocked');
      } else {
        saveError(`${e?.name ?? 'Error'}: ${e?.message ?? ''}`);
      }
    }
  };

  // ── Desuscribir ───────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    setStatus('loading');
    try {
      const reg = regRef.current ?? await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await axiosClient.delete('/push/subscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    } catch (e) {
      console.error('[Push] desactivar', e?.message);
    } finally {
      try { localStorage.removeItem(STATUS_KEY); } catch {}
      setStatus('idle');
    }
  };

  if (status === 'unsupported') return null;

  return (
    <>
      {status === 'blocked' && (
        <span
          title="Notificaciones bloqueadas. Ve a Configuración → Notificaciones y permite el acceso a esta app."
          className="flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1 cursor-default select-none"
        >
          <BellOff size={15} />
          <span className="hidden sm:inline">Bloqueadas</span>
        </span>
      )}

      {status === 'error' && (
        <button
          onClick={handleActivate}
          title={`Error: ${errorMsg} — toca para reintentar`}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors max-w-[200px]"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span className="truncate">{errorMsg || 'Error push'}</span>
        </button>
      )}

      {status === 'active' && (
        <button
          onClick={handleDeactivate}
          title="Desactivar notificaciones push"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
        >
          <BellOff size={15} />
          <span className="hidden sm:inline">Notif. activas</span>
        </button>
      )}

      {(status === 'idle' || status === 'loading') && (
        <button
          onClick={handleActivate}
          disabled={status === 'loading'}
          title="Activar notificaciones de pedidos"
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors"
        >
          {status === 'loading'
            ? <BellRing size={15} className="animate-pulse" />
            : <Bell size={15} />}
          <span className="hidden sm:inline">
            {status === 'loading' ? 'Activando…' : 'Notificaciones'}
          </span>
        </button>
      )}
    </>
  );
}
