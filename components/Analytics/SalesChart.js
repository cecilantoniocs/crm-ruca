// /components/Analytics/SalesChart.js
// ⚠️ Este componente se importa siempre con dynamic({ ssr: false }) desde la página
import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

function fmtAxisDate(dateStr, granularity) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (granularity === 'month') {
      return d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
    }
    if (granularity === 'week') {
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    }
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
}

const CustomTooltip = ({ active, payload, label, granularity }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3 text-sm">
      <p className="font-semibold text-coffee mb-1">{fmtAxisDate(label, granularity)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {CLP.format(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function SalesChart({ data = [], granularity = 'day' }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sin datos para el período seleccionado.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#059669" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => fmtAxisDate(v, granularity)}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => {
            if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
            if (v >= 1000)    return `$${(v / 1000).toFixed(0)}k`;
            return `$${v}`;
          }}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip granularity={granularity} />} />
        <Legend
          formatter={(val) => (
            <span className="text-xs text-gray-600">{val}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Ventas"
          stroke="#2563eb"
          strokeWidth={2}
          fill="url(#gradRevenue)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="profit"
          name="Utilidad"
          stroke="#059669"
          strokeWidth={2}
          fill="url(#gradProfit)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
