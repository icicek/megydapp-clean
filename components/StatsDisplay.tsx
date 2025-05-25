'use client';

import React, { useEffect, useState } from 'react';

export default function StatsDisplay() {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/coincarnation/stats');
        const data = await res.json();
        setParticipantCount(data?.participantCount ?? 0);
        setTotalUsdValue(data?.totalUsdValue ?? 0);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (participantCount === null || totalUsdValue === null) {
    return <p className="text-sm text-gray-400 mt-4">Loading stats...</p>;
  }

  return (
    <div className="text-center mt-4">
      <h2 className="text-xl font-bold">🌍 Global Coincarnation Stats</h2>
      <p className="text-lg mt-2">🧑‍🚀 Participants: <strong>{participantCount}</strong></p>
      <p className="text-lg">💰 Total Revived Value: <strong>${totalUsdValue.toLocaleString()}</strong></p>
    </div>
  );
}
