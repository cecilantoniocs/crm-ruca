// components/CourierLocationBeacon.jsx
// Envía la ubicación del repartidor al servidor mientras la app está abierta.
// - Usa watchPosition (una sola solicitud continua) en vez de getCurrentPosition + intervalo.
// - Nunca dispara el diálogo del sistema automáticamente: muestra un banner
//   que el usuario toca para activar. Así el repartidor decide cuándo otorgar permiso.
// - En iOS el permiso se resetea al cerrar la PWA; el banner reaparece al abrir.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import axiosClient from '@/config/axios';
import { getCurrentUser } from '@/helpers/permissions';

function safeGetMe() {
  try { const me = getCurrentUser?.(); if (me) return me; } catch {}
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('userData') : null;
    return raw ? JSON.parse(raw) : null;
  } catch {}
  return null;
}

// Tracking adaptativo:
// - En movimiento (≥ MOVE_THRESHOLD_M desplazado): ping cada INTERVAL_MOVING ms
// - Detenido: ping cada INTERVAL_STOPPED ms (heartbeat para confirmar que sigue activo)
// - Ruido GPS: ignorar desplazamientos < MIN_DISTANCE_M metros
const MIN_DISTANCE_M      = 15;          // filtro de ruido GPS
const MOVE_THRESHOLD_M    = 50;          // a partir de aquí se considera "en movimiento"
const INTERVAL_MOVING     = 15_000;      // 15 s cuando se mueve
const INTERVAL_STOPPED    = 90_000;      // 90 s cuando está detenido

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CourierLocationBeacon() {
  if (typeof window === 'undefined') return null;

  const me = safeGetMe();
  const canDeliver =
    me?.can_deliver === true ||
    me?.canDeliver === true ||
    String(me?.can_deliver || me?.canDeliver).toLowerCase() === 'true';

  // Solo para repartidores (can_deliver = true)
  if (!canDeliver) return null;

  return <BeaconInner />;
}

const SS_KEY = 'beaconPermState';

function BeaconInner() {
  // 'unknown' | 'prompt' | 'granted' | 'denied'
  // Leer desde sessionStorage para no mostrar el banner en cada navegación de página
  const [permState, setPermState] = useState(() => {
    try { return sessionStorage.getItem(SS_KEY) || 'unknown'; } catch { return 'unknown'; }
  });
  const [dismissed, setDismissed] = useState(false);

  const savePermState = (state) => {
    setPermState(state);
    try { sessionStorage.setItem(SS_KEY, state); } catch {}
  };
  const watchIdRef   = useRef(null);
  const lastPosRef   = useRef(null); // { lat, lng }
  const lastPingRef  = useRef(0);    // timestamp ms

  const sendPing = useCallback(async (lat, lng, accuracy) => {
    try {
      await axiosClient.post('/gps/ping', { lat, lng, accuracy });
    } catch (e) {
      console.warn('[Beacon] ping fail', e?.message || e);
    }
  }, []);

  const onPosition = useCallback((pos) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const now  = Date.now();
    const last = lastPosRef.current;

    const distM    = last ? distanceMeters(last.lat, last.lng, lat, lng) : Infinity;
    const moving   = distM >= MOVE_THRESHOLD_M;
    const interval = moving ? INTERVAL_MOVING : INTERVAL_STOPPED;
    const elapsed  = now - lastPingRef.current;

    // Ignorar si no pasó el intervalo correspondiente Y el movimiento es ruido GPS
    if (elapsed < interval && distM < MIN_DISTANCE_M) return;
    // En movimiento: ping al llegar al intervalo; detenido: esperar el heartbeat
    if (elapsed < interval) return;

    lastPosRef.current  = { lat, lng };
    lastPingRef.current = now;
    sendPing(lat, lng, accuracy);
  }, [sendPing]);

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null) return; // ya activo
    if (!('geolocation' in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        savePermState('granted');
        setDismissed(false);
        onPosition(pos);
      },
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) {
          savePermState('denied');
        } else {
          console.warn('[Beacon] geo error', err.code, err.message);
        }
        stopWatch();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, [onPosition]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Al montar: consultar estado del permiso sin disparar el diálogo
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      savePermState('denied');
      return;
    }

    // Si sessionStorage ya indica 'granted', iniciar tracking inmediatamente sin esperar la API
    if (permState === 'granted') {
      startWatch();
    }

    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        savePermState(status.state); // 'granted' | 'prompt' | 'denied'

        // Si ya está concedido, iniciar tracking silenciosamente
        if (status.state === 'granted') startWatch();

        // Reaccionar si el usuario cambia el permiso desde configuración
        status.onchange = () => {
          savePermState(status.state);
          if (status.state === 'granted') {
            startWatch();
          } else {
            stopWatch();
          }
        };
      })
      .catch(() => {
        // Navegador no soporta Permissions API (ej. Firefox antiguo, iOS parcial)
        // Si ya teníamos 'granted' en sesión, intentar iniciar tracking directamente
        if (permState === 'granted') { startWatch(); return; }
        savePermState('prompt');
      });

    return () => stopWatch();
  }, []); // eslint-disable-line

  // Reactivar tracking cuando el repartidor vuelve a la pestaña (y el watch fue detenido)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && permState === 'granted') {
        startWatch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [permState, startWatch]);

  // ── UI ──────────────────────────────────────────────────────────────────────

  // Ya concedido y activo → sin UI
  if (permState === 'granted') return null;

  // Banner descartado temporalmente
  if (dismissed) return null;

  // Permiso denegado explícitamente
  if (permState === 'denied') {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm">
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200 shadow-lg px-4 py-3">
          <MapPin size={20} className="text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-rose-700">Ubicación bloqueada</p>
            <p className="text-rose-600 mt-0.5">
              Ve a Configuración → Privacidad → Ubicación y permite el acceso a esta app.
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-rose-400 hover:text-rose-600">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Estado 'prompt' o 'unknown' → banner para que el repartidor active el tracking
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm">
      <button
        onClick={startWatch}
        className="w-full flex items-center gap-3 rounded-xl bg-brand-600 text-white shadow-lg px-4 py-3 hover:bg-brand-700 active:scale-95 transition-transform"
      >
        <MapPin size={20} className="shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm">Activar seguimiento de ubicación</p>
          <p className="text-xs opacity-80">Toca aquí y elige <strong>"Permitir siempre"</strong> para no volver a ver este mensaje</p>
        </div>
      </button>
    </div>
  );
}
