// components/CorePointChart.tsx

'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useEffect, useState } from 'react';

type CorePointBreakdown = {
  coincarnations?: number;
  referrals?: number;
  shares?: number;
  deadcoins?: number;
};

const COLORS = {
  coincarnations: '#a855f7',
  referrals: '#f59e0b',
  shares: '#22d3ee',
  deadcoins: '#8b5cf6',
};

function formatCp(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });
}

export default function CorePointChart({ data }: { data: CorePointBreakdown }) {
  if (!data) return null;

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();

    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const raw = {
    coincarnations: Number(data.coincarnations) || 0,
    referrals: Number(data.referrals) || 0,
    shares: Number(data.shares) || 0,
    deadcoins: Number(data.deadcoins) || 0,
  };

  // Chart is visual composition. Negative/net-reversed categories should not create broken pie slices.
  const chartData = [
    {
      key: 'coincarnations',
      name: 'Coincarnations',
      value: Math.max(0, raw.coincarnations),
      color: COLORS.coincarnations,
    },
    {
      key: 'referrals',
      name: 'Referrals',
      value: Math.max(0, raw.referrals),
      color: COLORS.referrals,
    },
    {
      key: 'shares',
      name: 'Shares',
      value: Math.max(0, raw.shares),
      color: COLORS.shares,
    },
    {
      key: 'deadcoins',
      name: 'Deadcoins',
      value: Math.max(0, raw.deadcoins),
      color: COLORS.deadcoins,
    },
  ].filter((item) => item.value > 0);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const hasData = total > 0;

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-zinc-300">
          No CorePoint composition yet.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Your value mix will appear after Coincarnations, shares, referrals, or deadcoin revivals.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full [&_svg_*]:outline-none [&_svg_*:focus]:outline-none [&_svg_*:focus-visible]:outline-none">
      <div className="relative h-[280px] w-full sm:h-[340px] lg:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart
            margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
            className="[&_*:focus]:outline-none [&_*:focus-visible]:outline-none"
          >
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="#18181b"
              strokeWidth={2}
              rootTabIndex={-1}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>

            {isDesktop && (
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
                  `${formatCp(Number(value))} CP · ${((Number(value) / total) * 100).toFixed(1)}%`,
                  name,
                ]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
              Total
            </p>
            <p className="mt-1 text-2xl font-black text-white sm:text-3xl">
              {formatCp(total)}
            </p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              CorePoint
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
        {chartData.map((item) => (
          <div
            key={item.key}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />

            <div className="min-w-0">
              <p className="truncate text-xs font-black text-zinc-200">
                {item.name}
              </p>
              <p className="text-[10px] font-semibold text-zinc-500">
                {formatCp(item.value)} CP
              </p>
            </div>

            <span className="ml-auto shrink-0 text-xs font-black text-zinc-400">
              {((item.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">
        Net view. Reversals and blacklist adjustments are reflected in CorePoint totals.
      </p>
    </div>
  );
}