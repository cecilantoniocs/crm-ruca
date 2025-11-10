// pages/_app.js
import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axiosClient from '../config/axios';

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

export default function App({ Component, pageProps }) {
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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => {
            console.error('Error registrando SW:', err);
          });
      });
    }
  }, []);

  
  return (
    <AuthGuard>
      <Component {...pageProps} />
    </AuthGuard>
  );
}
