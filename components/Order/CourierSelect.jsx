// /components/CourierSelect.jsx
import React, { useEffect, useState } from 'react';
import axiosClient from '@/config/axios';

export default function CourierSelect({
  id = 'delivered_by',
  label = 'Repartidor asignado',
  value,
  onChange,
  required = false,
  className = 'w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600',
  placeholder = 'Seleccionar…',
}) {
  const [options, setOptions] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadError('');
        // FIX: endpoint correcto
        const { data } = await axiosClient.get('couriers');
        if (!alive) return;
        setOptions(data.map((u) => ({ value: u.id, label: u.name })));
      } catch (e) {
        if (!alive) return;
        setLoadError('No se pudieron cargar repartidores');
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>
        {label}
      </label>

      <select
        id={id}
        name={id}
        className={className}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value || null)}
        required={required}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {loadError ? (
        <p className="mt-1 text-xs text-red-600">{loadError}</p>
      ) : null}
    </div>
  );
}
