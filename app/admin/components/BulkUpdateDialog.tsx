'use client';

import * as React from 'react';

type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';
const STATUSES: TokenStatus[] = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'];

export default function BulkUpdateDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mintsRaw, setMintsRaw] = React.useState('');
  const [status, setStatus] = React.useState<TokenStatus>('deadcoin');
  const [reason, setReason] = React.useState('');
  const [meta, setMeta] = React.useState<string>('{}');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMessage, setOkMessage] = React.useState<string | null>(null);

  const mintCount = React.useMemo(
    () => mintsRaw.split(/[\s,;]+/g).map(s => s.trim()).filter(Boolean).length,
    [mintsRaw]
  );

  async function handleSubmit() {
    setError(null);
    setOkMessage(null);

    // Meta JSON doğrula (opsiyonel ama faydalı)
    let metaObj: any = {};
    try {
      metaObj = meta.trim() ? JSON.parse(meta) : {};
    } catch {
      setError('Meta is not valid JSON.');
      return;
    }

    if (mintCount === 0) {
      setError('Paste at least one mint.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tokens/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mints: mintsRaw, // server zaten parse ediyor (string/array)
          status,
          reason: reason || null,
          meta: metaObj,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setOkMessage(`Updated ${data.okCount} item(s). ${data.failCount ? `${data.failCount} failed.` : ''}`);
      onDone?.();
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold"
      >
        Bulk Update
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-gray-900 border border-gray-700 rounded-xl shadow-xl">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="font-semibold">Bulk Update Tokens</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-300 hover:text-white"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-300">
                    Mint addresses (comma / newline / space separated)
                  </label>
                  <textarea
                    rows={6}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 font-mono"
                    placeholder="Paste mint addresses here…"
                    value={mintsRaw}
                    onChange={(e) => setMintsRaw(e.target.value)}
                  />
                  <div className="text-xs text-gray-400">{mintCount} mint(s)</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">Status</label>
                    <select
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TokenStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-gray-300">Reason (optional)</label>
                    <input
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2"
                      placeholder="e.g. Insufficient liquidity"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-300">Meta (JSON, optional)</label>
                  <textarea
                    rows={4}
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 font-mono"
                    placeholder='{"source":"manual","note":"entered by admin"}'
                    value={meta}
                    onChange={(e) => setMeta(e.target.value)}
                  />
                </div>

                {error && <div className="text-sm text-red-400">❌ {error}</div>}
                {okMessage && <div className="text-sm text-green-400">✅ {okMessage}</div>}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                  disabled={submitting}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="bg-amber-600 hover:bg-amber-700 rounded px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  disabled={submitting || mintCount === 0}
                >
                  {submitting ? 'Updating…' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
