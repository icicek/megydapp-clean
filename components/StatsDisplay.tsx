'use client';

import React, { useEffect, useState } from 'react';

export default function StatsDisplay() {
  const [stats, setStats] = useState({ participantCount: 0, totalUsdValue: 0 });

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/coincarnation/stats');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10 saniyede bir güncelle

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center mt-4">
      <h2 className="text-xl font-bold">🌍 Global Coincarnation Stats</h2>
      <p className="text-lg mt-2">🧑‍🚀 Participants: <strong>{stats.participantCount}</strong></p>
      <p className="text-lg">💰 Total Revived Value: <strong>${stats.totalUsdValue.toLocaleString()}</strong></p>
    </div>
  );
}
