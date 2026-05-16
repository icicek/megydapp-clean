// components/CorePointChart.tsx

'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type CorePointBreakdown = {
  coincarnations?: number;
  referrals?: number;
  shares?: number;
  deadcoins?: number;
};

export default function CorePointChart({ data }: { data: CorePointBreakdown }) {
  if (!data) return null;

  const c = Number(data.coincarnations) || 0;
  const r = Number(data.referrals) || 0;
  const s = Number(data.shares) || 0;
  const d = Number(data.deadcoins) || 0;

  const total = c + r + s + d;
  const hasData = total > 0;

  const chartData = [
    { name: 'Coincarnation', value: c, color: '#a855f7' },
    { name: 'Referrals', value: r, color: '#3b82f6' },
    { name: 'Shares', value: s, color: '#10b981' },
    { name: 'Deadcoins', value: d, color: '#ef4444' },
  ].filter((item) => item.value > 0);

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-zinc-300">
          No CorePoint composition yet.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Your contribution mix will appear after Coincarnations, shares, referrals, or deadcoin revivals.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-[260px] w-full sm:h-[360px] lg:h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="#18181b"
              strokeWidth={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>

            <Tooltip
              cursor={false}
              contentStyle={{
                backgroundColor: '#020617',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                borderRadius: '14px',
                color: '#f8fafc',
                boxShadow: '0 18px 45px rgba(0,0,0,0.45)',
              }}
              itemStyle={{
                color: '#f8fafc',
                fontWeight: 700,
              }}
              labelStyle={{
                color: '#cbd5e1',
                fontWeight: 800,
              }}
              formatter={(value: number, name: string) => [
                `${Number(value).toFixed(1)} CP (${((Number(value) / total) * 100).toFixed(1)}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
        {chartData.map((item) => (
          <div
            key={item.name}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate font-semibold">{item.name}</span>
            <span className="ml-auto shrink-0 text-xs font-bold text-zinc-500">
              {((item.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}