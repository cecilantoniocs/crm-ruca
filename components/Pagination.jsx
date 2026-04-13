// components/Pagination.jsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 50;

/**
 * Barra de paginación reutilizable.
 * Retorna null si hay una sola página (o ninguna).
 *
 * Props:
 *   page      – índice actual (0-based)
 *   total     – total de registros sin paginar
 *   pageSize  – registros por página (default: PAGE_SIZE = 50)
 *   onChange  – callback (newPage: number) => void
 */
export default function Pagination({ page, total, pageSize = PAGE_SIZE, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to   = Math.min((page + 1) * pageSize, total);

  // Genera los números de página a mostrar (máx 7, con elipsis)
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push('...');
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 3) pages.push('...');
    pages.push(totalPages - 1);
  }

  return (
    <div className="flex items-center justify-between px-1 py-4 mt-1">
      <span className="text-sm text-gray-500">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="w-8 text-center text-sm text-gray-400 select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-brand-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p + 1}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
