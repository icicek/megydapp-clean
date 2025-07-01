'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#a855f7', '#3b82f6', '#10b981', '#ef4444'];

export default function CorePointChart({ data }: { data: any }) {
  const total =
    data.coincarnation + data.referrals + data.shares + data.deadcoins || 0;

  const chartData = [
    { name: 'Coincarnation', value: data.coincarnations, color: COLORS[0] },
    { name: 'Referrals', value: data.referrals, color: COLORS[1] },
    { name: 'Shares', value: data.shares, color: COLORS[2] },
    { name: 'Deadcoins', value: data.deadcoins, color: COLORS[3] },
  ];

  return (
    <div className="w-full h-72 sm:h-80 md:h-96 bg-zinc-900 rounded-xl border border-zinc-700 p-4">
      <h4 className="text-sm font-semibold text-indigo-400 mb-4">
        📊 CorePoint Contribution Chart
      </h4>

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
            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
            formatter={(value: number) =>
              `${value.toFixed(1)} pts (${((value / total) * 100).toFixed(1)}%)`
            }
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-300 mt-4">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
            <span>{item.name}</span>
            <span className="ml-auto font-bold text-white">{item.value.toFixed(1)} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}
