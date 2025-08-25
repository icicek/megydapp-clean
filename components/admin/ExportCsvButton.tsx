'use client';

import { useState } from 'react';

type Props = {
  q: string;
  status: string; // '', 'healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'
  className?: string;
};

export default function ExportCsvButton({ q, status, className }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tokens/export.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // same-origin cookie
        body: JSON.stringify({ q, status }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tokens_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export CSV failed:', e);
      alert('Export failed. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={[
        'bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm',
        'disabled:opacity-60',
        className || '',
      ].join(' ')}
      aria-label="Export CSV"
    >
      {loading ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
