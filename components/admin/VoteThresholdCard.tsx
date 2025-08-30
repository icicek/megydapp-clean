// components/admin/VoteThresholdCard.tsx
'use client';

import { useEffect, useState } from 'react';

export default function VoteThresholdCard({
  onSaved,
  initialValue,
}: { onSaved?: (n: number)=>void; initialValue?: number }) {
  const [value, setValue] = useState<number>(initialValue ?? 3);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/settings', { credentials: 'include', cache: 'no-store' });
        const d = await r.json();
        if (d?.success) setValue(d.voteThreshold ?? 3);
      } catch {}
    })();
  }, []);

  async function save() {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteThreshold: value, changedBy: 'admin_ui' }),
      });
      const d = await r.json();
      if (d?.success) {
        setMsg('✅ Saved'); onSaved?.(d.voteThreshold);
      } else {
        setMsg(`❌ ${d?.error || 'Save failed'}`);
      }
    } catch (e:any) { setMsg(`❌ ${e?.message || 'Save failed'}`); }
    finally { setLoading(false); }
  }

  return (
    <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800">
      <div className="text-sm font-semibold mb-2 text-white">Community Vote Threshold</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={50}
          value={value}
          onChange={(e)=> setValue(Number(e.target.value))}
          className="w-24 px-2 py-1 rounded bg-neutral-800 text-white border border-neutral-700"
        />
        <button
          onClick={save}
          disabled={loading}
          className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {msg && <div className="mt-2 text-xs text-neutral-300">{msg}</div>}
      <div className="mt-1 text-[11px] text-neutral-500">Affects auto-deadcoin promotion (YES ≥ threshold).</div>
    </div>
  );
}
