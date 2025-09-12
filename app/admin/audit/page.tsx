'use client';

import { useEffect, useState } from 'react';

type AuditRow = {
  id: number;
  ts: string;
  admin_wallet: string;
  action: string;
  target_mint: string | null;
  prev_status: string | null;
  new_status: string | null;
  ip: string | null;
  ua: string | null;
  extra: any;
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [action, setAction] = useState('');
  const [wallet, setWallet] = useState('');
  const [mint, setMint] = useState('');

  async function fetchData(cursor?: string | null) {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (action) params.set('action', action);
    if (wallet) params.set('wallet', wallet);
    if (mint) params.set('mint', mint);
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/admin/audit?${params.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const json = await res.json();
    setRows((r) => (cursor ? [...r, ...json.items] : json.items));
    setNextCursor(json.nextCursor);
    setLoading(false);
  }

  useEffect(() => {
    fetchData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => fetchData(null);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin Audit Log</h1>

      <div className="flex gap-2">
        <input className="border px-3 py-2 rounded w-40" placeholder="action"
               value={action} onChange={(e) => setAction(e.target.value)} />
        <input className="border px-3 py-2 rounded w-56" placeholder="admin wallet"
               value={wallet} onChange={(e) => setWallet(e.target.value)} />
        <input className="border px-3 py-2 rounded w-56" placeholder="mint"
               value={mint} onChange={(e) => setMint(e.target.value)} />
        <button className="px-4 py-2 rounded bg-black text-white"
                onClick={onSearch} disabled={loading}>
          Search
        </button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Admin</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Mint</th>
              <th className="text-left p-2">From → To</th>
              <th className="text-left p-2">IP</th>
              <th className="text-left p-2">UA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.id}</td>
                <td className="p-2">{new Date(r.ts).toLocaleString()}</td>
                <td className="p-2">{r.admin_wallet}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2">{r.target_mint || '-'}</td>
                <td className="p-2">
                  {(r.prev_status || '-') + ' → ' + (r.new_status || '-')}
                </td>
                <td className="p-2">{r.ip || '-'}</td>
                <td className="p-2 truncate max-w-[240px]" title={r.ua || ''}>{r.ua || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <button className="px-4 py-2 rounded border" onClick={() => fetchData(nextCursor)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
