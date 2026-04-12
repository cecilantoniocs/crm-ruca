// /components/Analytics/KpiCard.js
import React from 'react';

const COLOR = {
  blue   : 'text-blue-600 bg-blue-50',
  emerald: 'text-emerald-600 bg-emerald-50',
  amber  : 'text-amber-600 bg-amber-50',
  rose   : 'text-rose-600 bg-rose-50',
  violet : 'text-violet-600 bg-violet-50',
  sky    : 'text-sky-600 bg-sky-50',
};

export default function KpiCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const cls = COLOR[color] || COLOR.blue;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {Icon && (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${cls}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-coffee leading-none">{value}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}
