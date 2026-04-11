// /components/DateInput.js
// Muestra la fecha en formato DD/MM/AAAA sin importar el idioma del OS.
// Internamente el value sigue siendo YYYY-MM-DD (compatible con <input type="date">).
import React from 'react';

function toDisplay(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).slice(0, 10).split('-');
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

// Ícono de calendario inline (sin dependencia de lucide para mantener el componente liviano)
const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15" height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-400 pointer-events-none shrink-0"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export default function DateInput({ value, onChange, className = '', ...props }) {
  return (
    <div className="relative inline-flex items-center">
      {/* Texto visible en DD/MM/AAAA */}
      <input
        type="text"
        readOnly
        value={toDisplay(value)}
        placeholder="DD/MM/AAAA"
        className={`pr-7 ${className}`}
        tabIndex={-1}
      />
      {/* Ícono de calendario — posicionado a la derecha igual que el reloj en type="time" */}
      <span className="absolute right-2 pointer-events-none">
        <CalendarIcon />
      </span>
      {/* Picker nativo transparente encima — captura todos los clicks */}
      <input
        type="date"
        value={value || ''}
        onChange={onChange}
        {...props}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ colorScheme: 'light' }}
      />
    </div>
  );
}
