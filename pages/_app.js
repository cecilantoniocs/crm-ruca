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

  // Registro del Service Worker + manejo de updates con prompt
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      // Solo recargamos si no estamos en medio de un login/navegación crítica
      const isLoggingIn = window.location.pathname === '/login';
      if (!isLoggingIn) window.location.reload();
    };

    const promptUserToRefresh = (registration) => {
      if (!registration || !registration.waiting) return;

      // POPUP simple. Si tienes un hook/UX propio, reemplaza este confirm por tu UI.
      const accept = window.confirm('Hay una nueva versión de la app. ¿Actualizar ahora?');
      if (accept) {
        // Pedimos al SW nuevo que se active inmediatamente
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    const onMessageFromSW = async (event) => {
      // SW nos avisa que hay una nueva versión instalada y “waiting”
      if (event?.data?.type === 'SW_UPDATE_AVAILABLE' && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) promptUserToRefresh(reg);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.addEventListener('message', onMessageFromSW);

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Si ya hay una versión esperando (por ejemplo, volviste a la pestaña luego de un deploy)
        if (registration.waiting) {
          promptUserToRefresh(registration);
        }

        // Detecta cuando aparece un nuevo SW (updatefound)
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            // Cuando el nuevo SW termina de instalarse y ya existe un controller,
            // significa que es un update (no la primera instalación)
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              promptUserToRefresh(registration);
            }
          });
        });
      } catch (err) {
        console.error('Error registrando SW:', err);
      }
    };

    // Registrar al cargar
    window.addEventListener('load', registerSW);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessageFromSW);
      window.removeEventListener('load', registerSW);
    };
  }, []);

  return (
    <AuthGuard>
      <Component {...pageProps} />
    </AuthGuard>
  );
}
