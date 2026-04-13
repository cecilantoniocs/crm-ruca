// components/PushNotificationButton.jsx
import { useEffect, useState, useRef } from 'react';
import { Bell, BellOff, BellRing, AlertCircle, X } from 'lucide-react';
import axiosClient from '@/config/axios';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const STATUS_KEY       = 'pushStatus';    // 'active' | 'error:<msg>' | unset
const DISMISSED_KEY    = 'pushDismissed';

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

// Lee el estado guardado en localStorage
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
  const [status,     setStatus]     = useState(init.status);
  const [errorMsg,   setErrorMsg]   = useState(init.error);
  const [showPrompt, setShowPrompt] = useState(false);
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
        const reg = await navigator.serviceWorker.ready;
        regRef.current = reg;
        const sub = await reg.pushManager.getSubscription();

        if (sub) {
          try { localStorage.setItem(STATUS_KEY, 'active'); } catch {}
          setStatus('active');
          return;
        }

        // No hay suscripción activa
        const perm       = Notification.permission;
        const storedVal  = localStorage.getItem(STATUS_KEY) || '';
        const wasActive  = storedVal === 'active';
        const hadError   = storedVal.startsWith('error:');

        // Si ya teníamos un error guardado, preservarlo — no pisarlo con 'idle'
        // (el useState ya lo cargó; solo evitamos que el useEffect lo limpie)
        if (hadError) return;

        // Si el permiso está concedido pero se perdió la suscripción (bug iOS común),
        // intentar re-suscribir silenciosamente sin pedir interacción al usuario.
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
            const msg = `AutoResub: ${e?.name ?? '?'}: ${e?.message ?? ''}`;
            saveError(msg);
            return;
          }
        }

        try { localStorage.removeItem(STATUS_KEY); } catch {}

        if (perm === 'denied') {
          setStatus('blocked');
        } else {
          setStatus('idle');
          if (perm === 'default' && !localStorage.getItem(DISMISSED_KEY)) {
            setTimeout(() => setShowPrompt(true), 1200);
          }
        }
      } catch (e) {
        // No limpiar localStorage — mantener estado previo si existía
      }
    })();
  }, []);

  // ── Suscribir ─────────────────────────────────────────────────────────────────
  const handleActivate = async () => {
    setShowPrompt(false);
    setStatus('loading');
    setErrorMsg('');

    try {
      if (!supported()) {
        throw Object.assign(new Error('Push no soportado'), { name: 'UnsupportedError' });
      }

      // CRÍTICO iOS: requestPermission() debe iniciarse antes de cualquier await
      const permPromise = Notification.requestPermission();
      const regPromise  = regRef.current
        ? Promise.resolve(regRef.current)
        : navigator.serviceWorker.ready;

      const [permission, reg] = await Promise.all([permPromise, regPromise]);
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
      const label = `${e?.name ?? 'Error'}: ${e?.message ?? ''}`;
      if (e?.name === 'NotAllowedError') {
        try { localStorage.removeItem(STATUS_KEY); } catch {}
        setStatus('blocked');
      } else {
        saveError(label);
      }
    }
  };

  // ── Desuscribir ───────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    setStatus('loading');
    try {
      const reg = regRef.current ?? await navigator.serviceWorker.ready;
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

  const dismissPrompt = () => {
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch {}
    setShowPrompt(false);
  };

  if (status === 'unsupported') return null;

  return (
    <>
      {/* Modal primer uso */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-8 sm:pb-0">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center">
                  <Bell size={22} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Notificaciones</p>
                  <p className="text-sm text-gray-500 mt-0.5">Recibe alertas cuando te asignen un pedido</p>
                </div>
              </div>
              <button onClick={dismissPrompt} className="shrink-0 text-gray-400 hover:text-gray-500 p-1 -mt-1 -mr-1">
                <X size={18} />
              </button>
            </div>
            <button
              onClick={handleActivate}
              className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 active:opacity-90 transition"
            >
              Activar notificaciones
            </button>
            <button onClick={dismissPrompt} className="w-full py-1 text-sm text-gray-400 hover:text-gray-600">
              Ahora no
            </button>
          </div>
        </div>
      )}

      {/* Bloqueado */}
      {status === 'blocked' && (
        <span
          title="Notificaciones bloqueadas. Ve a Configuración → Notificaciones y permite el acceso a esta app."
          className="flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1 cursor-default select-none"
        >
          <BellOff size={15} />
          <span className="hidden sm:inline">Bloqueadas</span>
        </span>
      )}

      {/* Error — muestra el mensaje para poder diagnosticar */}
      {status === 'error' && (
        <button
          onClick={handleActivate}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors max-w-[200px]"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span className="truncate">{errorMsg || 'Error push'}</span>
        </button>
      )}

      {/* Activo */}
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

      {/* Idle / Loading */}
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
