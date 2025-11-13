// /hooks/usePwaUpdater.ts
import { useEffect, useState } from 'react';

export default function usePwaUpdater() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // cuando hay una nueva versión descargándose…
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // instalada + ya había un controlador => hay update disponible
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedRefresh(true);
            setWaitingSW(reg.waiting || sw);
          }
        });
      });

      // si ya estaba esperando (p. ej., recarga posterior)
      if (reg.waiting) {
        setNeedRefresh(true);
        setWaitingSW(reg.waiting);
      }
    });

    // tras hacer skipWaiting el navegador cambia el controlador => recargamos
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  const doRefresh = () => waitingSW?.postMessage({ type: 'SKIP_WAITING' });
  return { needRefresh, doRefresh };
}
