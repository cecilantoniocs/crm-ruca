import { useEffect } from 'react';
import axiosClient from '@/config/axios';
import { getCurrentUser } from '@/helpers/permissions';

function safeGetMe() {
  // Intenta auth local y fallback a localStorage
  try {
    const me = getCurrentUser?.();
    if (me) return me;
  } catch {}
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('userData') : null;
    return raw ? JSON.parse(raw) : null;
  } catch {}
  return null;
}

export default function CourierLocationBeacon({ intervalMs = 5 * 60 * 1000 }) {
  // Evita SSR
  if (typeof window === 'undefined') return null;

  useEffect(() => {
    const me = safeGetMe();

    // Normaliza flags
    const isAdmin = !!(me?.is_admin || me?.isAdmin);
    const canDeliver =
        me?.can_deliver === true ||
        me?.canDeliver === true ||
        String(me?.can_deliver || me?.canDeliver).toLowerCase() === 'true';


    // <<< CLAVE: rastrear si es admin (testing) O si puede repartir >>>
    if (!isAdmin && !canDeliver) {
      // console.debug('[Beacon] skip: no admin ni can_deliver');
      return;
    }

    const pingOnce = () => {
      if (!('geolocation' in navigator)) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy } = pos.coords || {};
          try {
            await axiosClient.post('/gps/ping', {
              lat: latitude,
              lng: longitude,
              accuracy,
            });
            // console.debug('[Beacon] ping ok', latitude, longitude, accuracy);
          } catch (e) {
            console.warn('[Beacon] ping fail', e?.message || e);
          }
        },
        (err) => {
          // Si el usuario denegó anteriormente, no se vuelve a pedir sin intervención
          console.warn('[Beacon] geo error', err?.code, err?.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') pingOnce();
    };

    // Dispara al inicio respetando permisos
    try {
      navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((st) => {
          if (st.state === 'granted' || st.state === 'prompt') pingOnce();
          st.onchange = () => {
            if (st.state === 'granted') pingOnce();
          };
        })
        .catch(() => pingOnce());
    } catch {
      pingOnce();
    }

    // Repite cada X min y al volver a pestaña
    const id = window.setInterval(pingOnce, intervalMs);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return null;
}
