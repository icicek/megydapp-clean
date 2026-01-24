'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ---------------- CSRF helpers ---------------- */
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

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function sendJSON<T>(url: string, method: 'POST' | 'PUT', body: any): Promise<T> {
  const token = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };
  if (token) headers['x-csrf-token'] = token;

  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

// admin_config returns { success, value }
type BoolConfigResponse = { success: boolean; value: unknown };
const asBool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'on';
  }
  return false;
};

export default function AdminPanel() {
  const [claimOpen, setClaimOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setMsg(null);
        const resp = await getJSON<BoolConfigResponse>('/api/admin/config/claim_open');
        if (resp?.success) setClaimOpen(asBool(resp.value));
      } catch (e: any) {
        setMsg(`❌ ${e?.message || 'Failed to load claim_open'}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleClaim() {
    setSaving(true);
    setMsg(null);
    try {
      // Control panel standard: POST { value: "true/false" }
      await sendJSON('/api/admin/config/claim_open', 'POST', { value: String(!claimOpen) });
      setClaimOpen(!claimOpen);
      setMsg('✅ Claim setting saved');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Failed to save claim_open'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">🛠 Admin Panel (Legacy)</h1>
            <p className="text-sm text-white/60 mt-1">
              Multi-phase system is active. Distribution Pool & Snapshot controls are managed in the new panels.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin/control"
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            >
              Control Panel
            </Link>
            <Link
              href="/admin/phases"
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            >
              Phases
            </Link>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            {msg}
          </div>
        )}

        <section className="rounded-2xl border border-white/10 bg-gray-900/40 p-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-xl font-semibold">🚪 Claim Access</div>
              <div className="text-sm text-white/60 mt-1">
                Enable/disable public claiming globally (independent from phases).
              </div>
              <div className="text-xs text-white/40 mt-2">
                Phase distribution metrics are stored on phases; snapshot is per-phase.
              </div>
            </div>

            <button
              onClick={toggleClaim}
              disabled={loading || saving}
              className="px-4 py-2 rounded-xl font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Loading…' : saving ? 'Saving…' : claimOpen ? '🔒 Disable Claiming' : '🔓 Enable Claiming'}
            </button>
          </div>

          {!loading && (
            <p className="mt-4 text-sm text-white/70">
              Claiming is currently <strong>{claimOpen ? 'ENABLED ✅' : 'DISABLED ❌'}</strong>
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="font-semibold">Where do I manage phases now?</div>
          <ul className="list-disc pl-5 text-sm text-white/70 mt-2 space-y-1">
            <li><strong>/admin/phases</strong> → create phases (planned), open/close (manual override), snapshot per phase.</li>
            <li><strong>/api/admin/phases/[id]/snapshot</strong> → closes current phase + auto-opens next planned.</li>
            <li><strong>/admin/control</strong> → global toggles (claim_open, app_enabled, cron_enabled, weights).</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
