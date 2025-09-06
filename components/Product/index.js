import React from 'react';
// Si más adelante quieres acciones (editar/eliminar), acá puedes importar router/axios/Swal.

const Product = ({ data }) => {
  const {
    name = '—',
    category = '—',
    sku = '—',
    cost = '',
    price = '',
    available = '',
    weight = '',
    imageUrl = '',
    sold = 0,
  } = data || {};

  // Helper simple para CLP (opcional; si te molesta, muestra el número crudo)
  const fmtMoney = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  };

  return (
    <tr>
      <td className="border px-4 py-2">{name}</td>
      <td className="border px-4 py-2">{category}</td>
      <td className="border px-4 py-2">{sku}</td>
      <td className="border px-4 py-2">{fmtMoney(cost)}</td>
      <td className="border px-4 py-2">{price !== '' ? fmtMoney(price) : '—'}</td>
      <td className="border px-4 py-2">{available !== '' ? available : '—'}</td>
      <td className="border px-4 py-2">{weight || '—'}</td>
      <td className="border px-4 py-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-12 h-12 object-cover rounded"
            loading="lazy"
          />
        ) : (
          <span className="text-gray-400 italic">Sin foto</span>
        )}
      </td>
      <td className="border px-4 py-2">{sold ?? 0}</td>
    </tr>
  );
};

export default Product;
