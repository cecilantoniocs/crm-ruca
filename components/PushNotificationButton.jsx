// components/PushNotificationButton.jsx
// Botón para activar/desactivar las notificaciones push.
// Mostrado a repartidores, admins y supervisores (ver Header/index.js).

import { useEffect, useState, useRef } from 'react';
import { Bell, BellOff, BellRing, AlertCircle, X } from 'lucide-react';
import axiosClient from '@/config/axios';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const STATUS_KEY   = 'pushStatus';    // 'active' cuando hay suscripción activa
const DISMISSED_KEY = 'pushDismissed'; // 'true' cuando el usuario cerró el modal

function urlBase64ToUint8Array(base64String) {
  if (!base64String) throw new Error('VAPID_PUBLIC_KEY no definida en env');
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationButton() {
  // Inicializa desde localStorage para evitar parpadeo en cada navegación.
  // El useEffect verifica la suscripción real de forma asíncrona.
  const [status, setStatus] = useState(() => {
    if (typeof window === 'undefined') return 'idle';
    return localStorage.getItem(STATUS_KEY) === 'active' ? 'active' : 'idle';
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const regRef = useRef(null); // SW registration cacheada

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('denied');
      return;
    }

    (async () => {
      try {
        // Pre-calentar la referencia al SW para que subscribe() sea más rápido
        const reg = await navigator.serviceWorker.ready;
        regRef.current = reg;

        const sub = await reg.pushManager.getSubscription();

        if (sub) {
          // Suscripción activa confirmada
          localStorage.setItem(STATUS_KEY, 'active');
          setStatus('active');
        } else {
          localStorage.removeItem(STATUS_KEY);

          if (Notification.permission === 'denied') {
            // El usuario bloqueó permisos desde ajustes del sistema
            setStatus('denied');
          } else {
            setStatus('idle');
            // Mostrar modal si nunca se le preguntó y no lo cerró antes
            if (
              Notification.permission === 'default' &&
              !localStorage.getItem(DISMISSED_KEY)
            ) {
              setTimeout(() => setShowPrompt(true), 1200);
            }
          }
        }
      } catch {
        setStatus('idle');
      }
    })();
  }, []);

  // ── Suscribir ────────────────────────────────────────────────────────────────
  const handleActivate = async () => {
    setShowPrompt(false);
    setStatus('loading');
    setErrorMsg('');

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw Object.assign(new Error('Push no soportado en este dispositivo'), { name: 'UnsupportedError' });
      }

      // Usar SW cacheado (ya resuelto en useEffect) o esperar
      const reg = regRef.current ?? (await navigator.serviceWorker.ready);

      // 1. Pedir permiso — debe estar en el mismo hilo que el gesto del usuario
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // Usuario negó → marcar como denied, ocultar botón
        setStatus('denied');
        return;
      }

      // 2. Suscribir (inmediatamente después del permiso)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      if (!sub) {
        throw new Error('pushManager.subscribe() devolvió null');
      }

      // 3. Guardar en backend
      await axiosClient.post('/push/subscribe', { subscription: sub.toJSON() });

      localStorage.setItem(STATUS_KEY, 'active');
      setStatus('active');
    } catch (e) {
      console.error('[Push] activar —', e?.name, e?.message);
      localStorage.removeItem(STATUS_KEY);

      if (e?.name === 'NotAllowedError' || Notification.permission === 'denied') {
        setStatus('denied');
      } else {
        const label = e?.name && e.name !== 'Error'
          ? `${e.name}: ${e.message}`
          : (e?.message || 'Error desconocido');
        setErrorMsg(label);
        setStatus('error');
      }
    }
  };

  // ── Desuscribir ──────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    setStatus('loading');
    try {
      const reg = regRef.current ?? (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await axiosClient.delete('/push/subscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    } catch (e) {
      console.error('[Push] desactivar —', e?.message);
    } finally {
      localStorage.removeItem(STATUS_KEY);
      setStatus('idle');
    }
  };

  const dismissPrompt = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShowPrompt(false);
  };

  // Push no disponible en este dispositivo/navegador
  if (status === 'denied') return null;

  return (
    <>
      {/* ── Modal automático de primer uso ────────────────────────────────────── */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-8 sm:pb-0">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center">
                  <Bell size={22} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Notificaciones de pedidos</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Recibe alertas cuando te asignen un pedido nuevo
                  </p>
                </div>
              </div>
              <button
                onClick={dismissPrompt}
                className="shrink-0 text-gray-400 hover:text-gray-500 p-1 -mt-1 -mr-1"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <button
              onClick={handleActivate}
              className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 active:opacity-90 transition"
            >
              Activar notificaciones
            </button>
            <button
              onClick={dismissPrompt}
              className="w-full py-1 text-sm text-gray-400 hover:text-gray-600"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}

      {/* ── Botón en el header ─────────────────────────────────────────────────── */}
      {status === 'error' && (
        <button
          onClick={handleActivate}
          title={`Error al activar: ${errorMsg} — toca para reintentar`}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
        >
          <AlertCircle size={15} />
          <span className="hidden sm:inline">Error push</span>
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
