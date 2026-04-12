// /components/Analytics/ClientPieChart.js
// ⚠️ Importar siempre con dynamic({ ssr: false }) desde la página
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = { B2B: '#2563eb', B2C: '#059669' };

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3 text-sm">
      <p className="font-semibold text-coffee mb-1">{d.type}</p>
      <p className="text-gray-600">Clientes: <span className="font-medium text-coffee">{d.count}</span></p>
      <p className="text-gray-600">Ingresos: <span className="font-medium text-coffee">{CLP.format(d.revenue)}</span></p>
      <p className="text-gray-600">Utilidad: <span className="font-medium text-coffee">{CLP.format(d.profit)}</span></p>
    </div>
  );
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function ClientPieChart({ data = [] }) {
  const filtered = data.filter((d) => d.count > 0);
  if (!filtered.length) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sin datos para el período.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="count"
          nameKey="type"
          cx="50%"
          cy="50%"
          outerRadius={100}
          labelLine={false}
          label={renderCustomLabel}
        >
          {filtered.map((entry) => (
            <Cell key={entry.type} fill={COLORS[entry.type] || '#6b7280'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={(val) => <span className="text-xs text-gray-600">{val}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
