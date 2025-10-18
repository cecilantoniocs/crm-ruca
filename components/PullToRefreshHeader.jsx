// components/PullToRefreshHeader.jsx
import React from 'react';

/**
 * Header visual del Pull-To-Refresh.
 * Recibe height (px), progress (0..1) e isRefreshing.
 *
 * Se espera que se renderice DENTRO del contenedor scrollable, arriba del contenido.
 */
export default function PullToRefreshHeader({ height = 0, progress = 0, isRefreshing = false }) {
  // Mensaje dinámico simple
  const label = isRefreshing
    ? 'Actualizando…'
    : progress >= 1
    ? 'Suelta para actualizar'
    : 'Desliza hacia abajo para actualizar';

  return (
    <div
      aria-hidden="true"
      style={{ height: `${Math.max(0, height)}px` }}
      className="w-full overflow-hidden"
    >
      <div className="flex h-full items-center justify-center text-sm text-gray-600">
        <div className="flex items-center gap-2">
          {/* Spinner / Indicador */}
          <div
            className={[
              'h-4 w-4 rounded-full border-2',
              isRefreshing ? 'animate-spin border-gray-400 border-t-transparent' : 'border-gray-300',
            ].join(' ')}
            style={{
              // cuando no está refrescando, usamos el progreso para indicar "llenado" con rotate
              transform: isRefreshing ? 'none' : `rotate(${progress * 180}deg)`,
              transition: isRefreshing ? 'none' : 'transform 120ms ease',
            }}
          />
          <span className="select-none">{label}</span>
        </div>
      </div>
    </div>
  );
}
