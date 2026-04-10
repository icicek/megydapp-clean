//app/admin/components/BulkUpdateDialog.tsx
'use client';

import * as React from 'react';

type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';
const STATUSES: TokenStatus[] = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'];

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[$()*+./?[\\\]^{|}-]/g, '\\$&') + '=([^;]*)')
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  return meta?.content || getCookie('csrf') || null;
}

export default function BulkUpdateDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mintsRaw, setMintsRaw] = React.useState('');
  const [status, setStatus] = React.useState<TokenStatus>('deadcoin');
  const [reason, setReason] = React.useState('');
  const [meta, setMeta] = React.useState<string>('{}');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMessage, setOkMessage] = React.useState<string | null>(null);
  const [okItems, setOkItems] = React.useState<
    Array<{ mint: string; status: TokenStatus; statusAt: string; invalidation?: any }>
  >([]);
  const [failItems, setFailItems] = React.useState<Array<{ mint: string; error: string }>>([]);

  const mintCount = React.useMemo(
    () => mintsRaw.split(/[\s,;]+/g).map(s => s.trim()).filter(Boolean).length,
    [mintsRaw]
  );

  async function handleSubmit() {
    setError(null);
    setOkMessage(null);
    setOkItems([]);
    setFailItems([]);

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
      const csrf = getCsrfToken();
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.set('X-Requested-With', 'fetch');
      if (csrf) headers.set('x-csrf-token', csrf);

      const res = await fetch('/api/admin/tokens/bulk', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          mints: mintsRaw,
          status,
          reason: reason || null,
          meta: metaObj,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setOkItems(Array.isArray(data?.ok) ? data.ok : []);
      setFailItems(Array.isArray(data?.fail) ? data.fail : []);

      setOkMessage(
        `Updated ${data.okCount} item(s). ${data.failCount ? `${data.failCount} failed.` : ''}`
      );

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

                {okMessage && (
                  <div className="space-y-3">
                    <div className="text-sm text-green-400">✅ {okMessage}</div>

                    {okItems.length > 0 && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-green-300 mb-2">
                          Successful updates
                        </div>
                        <div className="max-h-40 overflow-auto space-y-1">
                          {okItems.map((item) => (
                            <div
                              key={`${item.mint}-${item.statusAt}`}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <span className="font-mono text-green-200 break-all">{item.mint}</span>
                              <span className="shrink-0 text-green-300">{item.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {failItems.length > 0 && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-red-300 mb-2">
                          Failed updates
                        </div>
                        <div className="max-h-48 overflow-auto space-y-2">
                          {failItems.map((item, idx) => (
                            <div
                              key={`${item.mint}-${idx}`}
                              className="rounded border border-red-500/10 bg-black/20 px-2 py-2"
                            >
                              <div className="font-mono text-xs text-red-200 break-all">{item.mint}</div>
                              <div className="mt-1 text-xs text-red-300/90">{item.error}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                      >
                        Close dialog
                      </button>
                    </div>
                  </div>
                )}
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
