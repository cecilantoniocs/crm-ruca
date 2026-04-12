// hooks/usePullToRefreshWindow.js
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pull-To-Refresh acoplado a WINDOW:
 * - Detecta swipe down cuando window.scrollY === 0
 * - No depende de qué contenedor tiene el scroll realmente
 */
export default function usePullToRefreshWindow({
  onRefresh,
  threshold = 60,   // px de “pull” para disparar
  cooldownMs = 800, // evita spam
} = {}) {
  const [pull, setPull] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const lastRefreshTsRef = useRef(0);

  const resetPull = useCallback(() => setPull(0), []);

  const triggerRefresh = useCallback(async () => {
    if (isRefreshing) return;
    const now = Date.now();
    if (now - lastRefreshTsRef.current < cooldownMs) return;

    lastRefreshTsRef.current = now;
    setIsRefreshing(true);
    try {
      await Promise.resolve(onRefresh?.());
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        resetPull();
      }, 150);
    }
  }, [onRefresh, isRefreshing, cooldownMs, resetPull]);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (isRefreshing) return;
      // Solo si estamos arriba del documento
      if (window.scrollY > 0) return;

      const t = e.touches?.[0];
      if (!t) return;
      startYRef.current = t.clientY;
      pullingRef.current = true;
      setPull(0);
    };

    const onTouchMove = (e) => {
      if (!pullingRef.current || isRefreshing) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - startYRef.current;

      if (dy > 0) {
        // Cap a 2x threshold para no estirar infinito
        const capped = Math.min(dy, threshold * 2);
        setPull(capped);

        // Evita el “rebound” del navegador
        if (e.cancelable) e.preventDefault();
      } else {
        // Si se mueve hacia arriba, cancela
        pullingRef.current = false;
        setPull(0);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current || isRefreshing) return;
      pullingRef.current = false;

      if (pull >= threshold) {
        setPull(threshold);
        triggerRefresh();
      } else {
        setPull(0);
      }
    };

    // Importante: move NO pasivo para poder preventDefault()
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isRefreshing, pull, threshold, triggerRefresh]);

  const progress = Math.max(0, Math.min(1, pull / threshold));
  const headerProps = {
    height: isRefreshing ? threshold : pull,
    progress,
    isRefreshing,
  };

  return { headerProps, isRefreshing, triggerRefresh };
}
