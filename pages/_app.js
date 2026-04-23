// pages/_app.js
import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axiosClient from '../config/axios';
import 'leaflet/dist/leaflet.css';

const PUBLIC_ROUTES = ['/login']; // agrega aquí rutas públicas extra si tuvieras

function AuthGuard({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const path = router.pathname;

    // Si la ruta es pública, no chequeamos nada
    if (PUBLIC_ROUTES.includes(path)) {
      setReady(true);
      return;
    }

    try {
      const isAuth = localStorage.getItem('isAuth') === 'true';
      const user = JSON.parse(localStorage.getItem('userData') || 'null');

      if (!isAuth || !user) {
        // Redirige a login y vuelve a la ruta original tras loguear
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        router.replace(`/login?next=${next}`);
        return;
      }
    } catch {
      // si falla el parseo, tratamos como no autenticado
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.replace(`/login?next=${next}`);
      return;
    }

    setReady(true);
  }, [router.pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-600">
        Cargando…
      </div>
    );
  }

  return children;
}

function UpdateBanner({ onUpdate }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] flex items-center justify-between gap-3 bg-brand-600 text-white px-4 py-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-lg">🚀</span>
        <span>Nueva versión disponible</span>
      </div>
      <button
        onClick={onUpdate}
        className="shrink-0 rounded-lg bg-white text-brand-600 font-semibold text-sm px-4 py-1.5 hover:bg-brand-50 active:scale-95 transition-transform"
      >
        Actualizar
      </button>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  // Ping de actividad (last_seen_at) cada 60s cuando la pestaña está visible
  useEffect(() => {
    let timer;

    const ping = () => {
      try {
        const isAuth = localStorage.getItem('isAuth') === 'true';
        if (!isAuth) return;
        axiosClient.post('auth/ping', {
          path: typeof window !== 'undefined' ? window.location.pathname : '',
        }).catch(() => {});
      } catch {
        // no-op
      }
    };

    const start = () => {
      ping(); // ping inicial
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          ping();
        }
      }, 60_000);
    };

    const onFocus = () => ping();
    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };

    start();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Registro del Service Worker (necesario para push notifications)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const registerSW = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    // fix: en Next.js el evento 'load' ya pasó cuando el useEffect corre
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  // Detección de nueva versión via polling al servidor.
  // Más confiable que SW update detection, funciona en iOS y Android.
  useEffect(() => {
    let knownVersion = null;
    let timer = null;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        if (knownVersion === null) {
          knownVersion = v; // baseline: versión con la que abrió la app
        } else if (v !== knownVersion) {
          setShowUpdateBanner(true);
          clearInterval(timer); // dejar de consultar una vez detectado
        }
      } catch {
        // silencioso — sin conexión o error de red
      }
    };

    checkVersion(); // check inmediato al abrir
    timer = setInterval(checkVersion, 5 * 60_000); // luego cada 5 min
    return () => clearInterval(timer);
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  return (
    <>
      {showUpdateBanner && <UpdateBanner onUpdate={handleUpdate} />}
      <AuthGuard>
        <Component {...pageProps} />
      </AuthGuard>
    </>
  );
}
