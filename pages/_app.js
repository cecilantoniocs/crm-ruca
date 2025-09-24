// pages/_app.js
import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

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
  return (
    <AuthGuard>
      <Component {...pageProps} />
    </AuthGuard>
  );
}
