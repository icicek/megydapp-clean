//components/StatsDisplay.tsx
'use client';

import React, { useEffect, useState } from 'react';

const STATS_POLL_MS = 60_000;

export default function StatsDisplay() {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function fetchStats() {
      if (document.visibilityState !== 'visible') return;

      try {
        const res = await fetch('/api/coincarnation/stats', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!alive) return;

        setParticipantCount(Number(data?.participantCount ?? 0));
        setTotalUsdValue(Number(data?.totalUsdValue ?? 0));
      } catch (err) {
        if (!alive) return;
        console.error('Failed to fetch stats:', err);
      }
    }

    fetchStats();

    const onFocus = () => fetchStats();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStats();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const interval = window.setInterval(fetchStats, STATS_POLL_MS);

    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  if (participantCount === null || totalUsdValue === null) {
    return <p className="text-sm text-gray-400 mt-4">Loading stats...</p>;
  }

  return (
    <div className="text-center mt-4">
      <h2 className="text-xl font-bold">🌍 Global Coincarnation Stats</h2>
      <p className="text-lg mt-2">
        🧑‍🚀 Participants: <strong>{participantCount}</strong>
      </p>
      <p className="text-lg">
        💰 Total Revived Value: <strong>${totalUsdValue.toLocaleString()}</strong>
      </p>
    </div>
  );
}