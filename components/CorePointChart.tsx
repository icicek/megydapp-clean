'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function CorePointChart({ data }: { data: any }) {
  if (!data) return null;

  // Sayısal güvenlik ve doğru alan adları
  const c = Number(data.coincarnations) || 0;
  const r = Number(data.referrals) || 0;
  const s = Number(data.shares) || 0;
  const d = Number(data.deadcoins) || 0;

  const hasData = c > 0 || r > 0 || s > 0 || d > 0;

  const chartData = [
    { name: 'Coincarnation', value: c, color: '#a855f7' },
    { name: 'Referrals', value: r, color: '#3b82f6' },
    { name: 'Shares', value: s, color: '#10b981' },
    { name: 'Deadcoins', value: d, color: '#ef4444' },
  ];

  if (!hasData) {
    return (
      <div className="w-full bg-zinc-900 rounded-xl border border-zinc-700 p-4 text-center text-sm text-gray-400 mb-2">
        <h4 className="text-sm font-semibold text-indigo-400 mb-4">
          📊 CorePoint Contribution Chart
        </h4>
        <p>No CorePoints yet. Start contributing to see your impact!</p>
      </div>
    );
  }

  const total = c + r + s + d;

  return (
    <div className="w-full bg-zinc-900 rounded-xl border border-zinc-700 p-4 mb-2">
      <h4 className="text-sm font-semibold text-indigo-400 mb-4">
        📊 CorePoint Contribution Chart
      </h4>

      {/* Grafik alanı */}
      <div className="w-full" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="70%"
              paddingAngle={3}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                borderColor: '#374151',
              }}
              formatter={(value: number) =>
                `${value.toFixed(1)} pts (${((value / total) * 100).toFixed(1)}%)`
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Etiketler */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-300 mt-4 mb-1 px-4">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center space-x-2 shrink-0">
            <span
              className="min-w-[12px] min-h-[12px] w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            ></span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
