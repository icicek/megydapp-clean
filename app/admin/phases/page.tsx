// app/admin/phases/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import useAdminWalletGuard from '@/hooks/useAdminWalletGuard';

type PhaseStatus = 'planned' | 'active' | 'reviewing' | 'completed';

type PhaseRow = {
  phase_id: number;
  phase_no: number;
  name: string;
  status?: PhaseStatus;

  pool_megy?: any;
  rate_usd_per_megy?: any;
  target_usd?: any;

  opened_at?: any;
  closed_at?: any;
  snapshot_taken_at?: any;
  finalized_at?: any;
  created_at?: any;
  updated_at?: any;

  used_usd?: any;
  used_rows?: any;
  used_wallets?: any;

  used_usd_forecast?: any;
  alloc_rows_forecast?: any;
  alloc_wallets_forecast?: any;

  alloc_usd_sum?: any;
  alloc_wallets?: any;
  queue_usd?: any;
};

type CreatePhaseResponse =
  | { success: true; phase: any }
  | { success: false; error: string };

const CARD =
  'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm hover:shadow transition-shadow';

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function sendJSON<T>(url: string, method: string, body?: any): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

function fmtNum(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString();
}

function fmtRate(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: 12 });
}

function normalizePhaseStatus(s: any): PhaseStatus {
  const v = String(s ?? '').trim().toLowerCase();

  if (v === 'open') return 'active';
  if (v === 'reviewed') return 'reviewing';
  if (v === 'in_review' || v === 'inreview') return 'reviewing';

  if (v === 'active') return 'active';
  if (v === 'reviewing') return 'reviewing';
  if (v === 'completed') return 'completed';
  if (v === 'planned' || v === '') return 'planned';

  return 'planned';
}

function fmtDate(v: any): string {
  if (!v) return '-';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

type SnapshotResponse = {
  success: boolean;
  error?: string;
  message?: string;
  phaseId?: number;
  phaseNo?: number;
  snapshot_taken_at?: string | null;
  totals?: { usdSum: number; targetUsd?: number; megySum: number; allocations: number };
};

type AdvanceResponse = {
  success: boolean;
  phaseAdvance?: {
    success: boolean;
    changed: boolean;
    activePhaseId: number | null;
    activePhaseNo: number | null;
    openedPhaseIds: number[];
    movedUnassigned: number;
    note?: string;
  };
  recompute?: null;
  message?: string;
};

export default function AdminPhasesPage() {
  const [rows, setRows] = useState<PhaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [highlightId, setHighlightId] = useState<number | null>(null);
  function scrollToPhase(id: number) {
    if (!id) return;
    setHighlightId(id);

    window.setTimeout(() => {
      const el = document.getElementById(`phase-row-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);

    window.setTimeout(() => setHighlightId(null), 2500);
  }

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [pool, setPool] = useState('500000');
  const [rate, setRate] = useState('1');
  const [saving, setSaving] = useState(false);

  const computedTarget = useMemo(() => {
    const p = Number(pool);
    const r = Number(rate);
    if (!Number.isFinite(p) || !Number.isFinite(r) || p <= 0 || r <= 0) return '';
    return String(p * r);
  }, [pool, rate]);

  const canCreate = useMemo(() => {
    const p = Number(pool);
    const r = Number(rate);
    return name.trim() !== '' && Number.isFinite(p) && p > 0 && Number.isFinite(r) && r > 0;
  }, [name, pool, rate]);

  const [openEdit, setOpenEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPool, setEditPool] = useState('500000');
  const [editRate, setEditRate] = useState('1');
  const [editDefaults, setEditDefaults] = useState<{ name: string; pool: string; rate: string } | null>(null);

  const {
    loading: adminGuardLoading,
    canRunCriticalAdminAction,
    guardMessage,
    walletMatches,
    sessionWallet,
    connectedWallet,
  } = useAdminWalletGuard();

  const computedEditTarget = useMemo(() => {
    const p = Number(editPool);
    const r = Number(editRate);
    if (!Number.isFinite(p) || !Number.isFinite(r) || p <= 0 || r <= 0) return '';
    return String(p * r);
  }, [editPool, editRate]);

  const canSaveEdit = useMemo(() => {
    const p = Number(editPool);
    const r = Number(editRate);
    return editId != null && editName.trim() !== '' && Number.isFinite(p) && p > 0 && Number.isFinite(r) && r > 0;
  }, [editId, editName, editPool, editRate]);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const actives = useMemo(() => rows.filter((r) => r.status === 'active'), [rows]);
  const active = actives[0] ?? null;

  const reviewingCount = useMemo(
    () => rows.filter((r) => r.status === 'reviewing').length,
    [rows]
  );

  const nextPlannedId = useMemo(() => {
    const planned = rows.filter((r) => !r.status || r.status === 'planned');
    if (planned.length === 0) return null;

    let best = planned[0];
    for (const r of planned) {
      if (Number(r.phase_no) < Number(best.phase_no)) best = r;
    }
    return best.phase_id;
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const an = Number(a.phase_no ?? 0);
      const bn = Number(b.phase_no ?? 0);
      if (an !== bn) return an - bn;
      return Number(a.phase_id ?? 0) - Number(b.phase_id ?? 0);
    });
  }, [rows]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const j1 = await getJSON<{ success: boolean; phases: PhaseRow[]; queue?: any }>('/api/phases/list');

      const phases = Array.isArray(j1?.phases) ? j1.phases : [];
      const normalized = phases.map((p) => ({
        ...p,
        status: normalizePhaseStatus((p as any).status),
      }));

      const qUsd = Number((j1 as any)?.queue?.queue_usd ?? 0);
      const finalRows = normalized.map((p) =>
        p.status === 'active' ? { ...p, queue_usd: qUsd } : p
      );

      setRows(finalRows);
    } catch (e: any) {
      setMsg(`❌ Failed to load phases (${e?.message || 'error'})`);
    } finally {
      setLoading(false);
    }
  }

  function ensureCriticalAdminAccess(): boolean {
    if (adminGuardLoading) {
      setMsg('⏳ Checking admin wallet...');
      return false;
    }
  
    if (!canRunCriticalAdminAction) {
      setMsg(`⚠️ ${guardMessage || 'Admin wallet verification failed.'}`);
      return false;
    }
  
    return true;
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createPhase() {
    if (!ensureCriticalAdminAccess()) return;

    setSaving(true);
    setMsg(null);
    try {
      const body = {
        name: name.trim(),
        pool_megy: Number(pool),
        rate_usd_per_megy: Number(rate),
      };

      const j = await sendJSON<CreatePhaseResponse>('/api/admin/phases', 'POST', body);
      if (!j.success) throw new Error(j.error || 'CREATE_FAILED');

      setOpenCreate(false);
      setName('');

      await refresh();
      setMsg('✅ Phase created');

      const createdId = (j as any)?.phase?.phase_id ?? (j as any)?.phase?.id ?? 0;
      scrollToPhase(Number(createdId) || 0);
    } catch (e: any) {
      const err = String(e?.message || '');
      if (err.includes('RATE_TOO_GOOD_VS_PREVIOUS')) {
        setMsg('⚠️ New phase rate cannot be lower than the previous phase rate.');
      } else {
        setMsg(`❌ ${e?.message || 'Create failed'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function openPhase(id: number) {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setBusyId(id);

    try {
      await sendJSON(`/api/admin/phases/${id}/open`, 'POST');
      await refresh();
      setMsg('✅ Phase opened. Queue allocation will be handled by allocator.');
      scrollToPhase(id);
    } catch (e: any) {
      const err = String(e?.message || '');

      if (err.includes('ACTIVE_PHASE_EXISTS')) {
        setMsg('⚠️ There is already an active phase. Advance or complete it first.');
      } else if (err.includes('PHASE_NOT_PLANNED')) {
        setMsg('⚠️ Only planned phases can be opened.');
      } else if (err.includes('PHASE_NOT_FOUND')) {
        setMsg('❌ Phase not found.');
      } else if (err.includes('NOT_NEXT_PLANNED')) {
        setMsg('⚠️ You can only open the next planned phase (smallest phase_no).');
      } else {
        setMsg(`❌ ${err || 'Open failed'}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(p: PhaseRow) {
    setMsg(null);
    setEditId(p.phase_id);

    const n = String(p.name || '');
    const pl = String(p.pool_megy ?? '');
    const rt = String(p.rate_usd_per_megy ?? '');

    setEditName(n);
    setEditPool(pl);
    setEditRate(rt);

    setEditDefaults({ name: n, pool: pl, rate: rt });
    setOpenEdit(true);
  }

  async function saveEdit() {
    if (!ensureCriticalAdminAccess()) return;

    if (editId == null) return;

    const id = editId;
    setSaving(true);
    setMsg(null);

    try {
      const body = {
        name: editName.trim(),
        pool_megy: Number(editPool),
        rate_usd_per_megy: Number(editRate),
      };

      const j = await sendJSON<{ success: boolean; phase?: any; error?: string }>(
        `/api/admin/phases/${id}`,
        'PATCH',
        body
      );

      if (!j?.success) throw new Error(j?.error || 'PHASE_EDIT_FAILED');

      setOpenEdit(false);
      setEditId(null);

      await refresh();
      setMsg('✅ Phase updated');
      scrollToPhase(id);
    } catch (e: any) {
      const err = String(e?.message || '');
      if (err.includes('RATE_TOO_GOOD_VS_PREVIOUS')) {
        setMsg('⚠️ Edited phase rate cannot be lower than the previous phase rate.');
      } else if (err.includes('RATE_TOO_BAD_VS_NEXT')) {
        setMsg('⚠️ Edited phase rate cannot be higher than the next phase rate.');
      } else {
        setMsg(`❌ ${e?.message || 'Edit failed'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function snapshotPhase(id: number) {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setBusyId(id);

    try {
      const ok = window.confirm(
        'Take snapshot for this reviewing phase?\n\nThis will finalize claim data for this phase and mark it as completed. It does NOT open the next phase.'
      );
      if (!ok) return;

      const j = await sendJSON<SnapshotResponse>(`/api/admin/phases/${id}/snapshot`, 'POST');

      await refresh();
      await new Promise((r) => setTimeout(r, 50));

      if (j?.success) {
        scrollToPhase(id);
        setMsg(
          j?.message ||
            `✅ Snapshot complete — Phase #${j?.phaseNo ?? id} is now completed.`
        );
      } else {
        setMsg(`❌ ${j?.error || 'SNAPSHOT_FAILED'}`);
      }
    } catch (e: any) {
      const err = String(e?.message || '');
      if (err.includes('PHASE_NOT_REVIEWING')) {
        setMsg('⚠️ Only reviewing phases can be snapshotted.');
      } else if (err.includes('PHASE_NOT_FULL')) {
        setMsg('⚠️ This phase is not full yet, so snapshot is blocked.');
      } else if (err.includes('NO_ALLOCATIONS_TO_SNAPSHOT')) {
        setMsg('⚠️ There are no allocations to snapshot for this phase.');
      } else {
        setMsg(`❌ ${err || 'Snapshot failed'}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function finalizePhase(id: number) {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setBusyId(id);

    try {
      const ok = window.confirm(
        'Finalize this completed phase?\n\nThis will approve the snapshot after consistency checks.'
      );
      if (!ok) return;

      const j = await sendJSON<{ success: boolean; error?: string; message?: string }>(
        `/api/admin/phases/${id}/finalize`,
        'POST'
      );

      await refresh();
      setMsg(j?.message || '✅ Phase finalized');
      scrollToPhase(id);
    } catch (e: any) {
      const err = String(e?.message || '');
      if (err.includes('FINALIZE_BLOCKED_MISMATCH')) {
        setMsg('⚠️ Finalize blocked due to allocation/snapshot mismatch. Check Claim Preview first.');
      } else {
        setMsg(`❌ ${e?.message || 'Finalize failed'}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deletePhase(id: number) {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setBusyId(id);
    try {
      const ok = window.confirm('Delete this planned phase?\n\nThis cannot be undone.');
      if (!ok) return;

      await sendJSON(`/api/admin/phases/${id}`, 'DELETE');
      await refresh();
      setMsg('✅ Phase deleted');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Delete failed'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function movePhase(id: number, dir: 'up' | 'down') {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setBusyId(id);
    try {
      await sendJSON(`/api/admin/phases/${id}/move`, 'POST', { dir });
      await refresh();
      scrollToPhase(id);
      setMsg('✅ Phase order updated');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Move failed'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function advanceLifecycle() {
    if (!ensureCriticalAdminAccess()) return;

    setMsg(null);
    setAdvancing(true);

    try {
      const j = await sendJSON<AdvanceResponse>(`/api/admin/phases/advance`, 'POST');

      await refresh();

      const opened = Array.isArray(j?.phaseAdvance?.openedPhaseIds)
        ? j.phaseAdvance!.openedPhaseIds
        : [];

      if (opened.length > 0) {
        scrollToPhase(Number(opened[0]));
      } else if (j?.phaseAdvance?.activePhaseId) {
        scrollToPhase(Number(j.phaseAdvance.activePhaseId));
      }

      const changed = !!j?.phaseAdvance?.changed;
      const note = j?.phaseAdvance?.note ? ` • ${j.phaseAdvance.note}` : '';

      setMsg(
        changed
          ? `✅ Phase lifecycle advanced successfully${note}`
          : `ℹ️ No lifecycle change was needed${note}`
      );
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Advance failed'}`);
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Phases</h1>
            <p className="text-xs text-white/60 mt-1">
              Manage planned, active, reviewing, completed, and finalized phases.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={advanceLifecycle}
              disabled={advancing}
              className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/15 text-sm disabled:opacity-50"
              title="Advance phase lifecycle only. This does not run recompute."
            >
              {advancing ? 'Advancing…' : 'Advance Lifecycle'}
            </button>
            <button
              onClick={() => setOpenCreate(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm"
            >
              + Add Phase
            </button>
          </div>
        </div>

        {!adminGuardLoading && !walletMatches && (
          <div className={`${CARD} text-sm text-yellow-200 border-yellow-500/20 bg-yellow-500/10`}>
            ⚠️ Critical actions require your connected wallet to match the active admin session wallet.
            {sessionWallet ? ` Session: ${sessionWallet}` : ''}
            {connectedWallet ? ` • Connected: ${connectedWallet}` : ''}
          </div>
        )}
        
        {msg && <div className={`${CARD} text-sm`}>{msg}</div>}
        {loading && <div className={`${CARD} text-sm text-white/70`}>Loading…</div>}

        <div className={CARD}>
          <div className="text-sm text-white/80">
            Active phase:{' '}
            {actives.length === 0 ? (
              <span className="font-semibold text-white/60">None</span>
            ) : actives.length === 1 ? (
              <span className="font-semibold text-emerald-300">
                #{actives[0].phase_no} — {actives[0].name}
              </span>
            ) : (
              <span className="font-semibold text-yellow-300">
                ⚠ Multiple active phases ({actives.length})
              </span>
            )}
          </div>

          {actives.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {actives
                .slice()
                .sort((a, b) => Number(a.phase_no) - Number(b.phase_no))
                .map((p) => (
                  <button
                    key={p.phase_id}
                    onClick={() => scrollToPhase(p.phase_id)}
                    className="px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-[11px] text-yellow-200 hover:bg-yellow-500/15"
                    title="Scroll to phase"
                  >
                    #{p.phase_no} — {p.name || '(unnamed)'}
                  </button>
                ))}
            </div>
          )}

          <div className="text-[11px] text-white/55 mt-1">
            Reviewing phases:{' '}
            <span className="font-semibold text-yellow-200">{reviewingCount}</span>
          </div>

          <div className="text-[11px] text-white/55 mt-2 space-y-1">
            <div>
              • Allocation truth comes from <span className="font-semibold text-white/75">phase_allocations</span>.
            </div>
            <div>
              • Lifecycle advance is handled separately from snapshot and from allocation.
            </div>
            <div>
              • Snapshot only finalizes claim data for a reviewing phase and marks it as completed.
            </div>
            <div>
              • Manual phase opening only changes lifecycle. Queue allocation is handled by allocator.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0b0f18]">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-white/5 text-white/70">
                <tr>
                  <th className="text-left px-4 py-3">Phase</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Pool (MEGY)</th>
                  <th className="text-left px-4 py-3">Rate (USD/MEGY)</th>
                  <th className="text-left px-4 py-3">Target (USD)</th>
                  <th className="text-left px-4 py-3">Progress</th>
                  <th className="text-left px-4 py-3">Opened</th>
                  <th className="text-left px-4 py-3">Closed</th>
                  <th className="text-left px-4 py-3">Snapshot</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((p) => {
                  const isActive = p.status === 'active';
                  const isCompleted = p.status === 'completed';
                  const isPlanned = !p.status || p.status === 'planned';
                  const isReviewing = p.status === 'reviewing';
                  const canShowClaimPreview = isCompleted || !!p.snapshot_taken_at;
                  const isFinalized = !!p.finalized_at;
                  const canFinalize = isCompleted && !!p.snapshot_taken_at && !isFinalized;
                  const isBusy = busyId === p.phase_id;
                  const canShowOpen = isPlanned && actives.length === 0 && nextPlannedId === p.phase_id;
                  const activeRate = active ? Number(active.rate_usd_per_megy ?? 0) : null;
                  const thisRate = Number(p.rate_usd_per_megy ?? 0);

                  const rateTooGood =
                    !!active &&
                    isPlanned &&
                    Number.isFinite(activeRate) &&
                    Number.isFinite(thisRate) &&
                    activeRate! > 0 &&
                    thisRate > 0 &&
                    thisRate < activeRate!;

                  return (
                    <tr
                      id={`phase-row-${p.phase_id}`}
                      key={p.phase_id}
                      className={[
                        'border-t border-white/10 hover:bg-white/5',
                        highlightId === p.phase_id ? 'ring-2 ring-emerald-500/40 bg-white/[0.03]' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">
                          #{p.phase_no} — {p.name || '(unnamed)'}
                        </div>

                        {rateTooGood && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-200"
                            title={`Invalid: planned rate (${fmtRate(thisRate)}) is better than active rate (${fmtRate(activeRate)}). Fix rate or reorder phases.`}
                          >
                            ⚠ Rate too good vs active
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={[
                              'px-2 py-1 rounded-md text-xs border',
                              isActive
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                : p.status === 'reviewing'
                                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                                  : isCompleted
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                                    : 'bg-white/5 border-white/10 text-white/70',
                            ].join(' ')}
                          >
                            {(p.status || 'planned') as any}
                          </span>

                          {isFinalized && (
                            <span className="px-2 py-1 rounded-md text-xs border bg-emerald-500/10 border-emerald-500/30 text-emerald-200 font-semibold">
                              finalized
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-white/80">{fmtNum(p.pool_megy)}</td>
                      <td className="px-4 py-3 text-white/80">{fmtRate(p.rate_usd_per_megy)}</td>
                      <td className="px-4 py-3 text-white/80">
                        {p.target_usd == null || p.target_usd === '' ? '-' : fmtNum(p.target_usd)}
                      </td>

                      <td className="px-4 py-3 text-white/80">
                        {(() => {
                          const target = Number(p.target_usd ?? 0);
                          const wUsed = Number((p as any).used_usd ?? 0);
                          const fUsed = Number((p as any).used_usd_forecast ?? 0);

                          const wPct = target > 0 ? Math.min(100, (wUsed / target) * 100) : 0;
                          const fPct = target > 0 ? Math.min(100, (fUsed / target) * 100) : 0;

                          return (
                            <div className="min-w-[260px] space-y-2">
                              <div>
                                <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                                  <span className="text-white/50">Window</span>
                                  <span className="font-semibold text-white/70">{wPct.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10">
                                  <div className="h-full bg-emerald-500/70" style={{ width: `${wPct}%` }} />
                                </div>
                                <div className="mt-1 text-[10px] text-white/40">
                                  {wUsed.toLocaleString(undefined, { maximumFractionDigits: 4 })} /{' '}
                                  {target.toLocaleString()} •{' '}
                                  {Number((p as any).used_wallets ?? 0).toLocaleString()} wallets •{' '}
                                  {Number((p as any).used_rows ?? 0).toLocaleString()} rows
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                                  <span className="text-white/50">Forecast</span>
                                  <span className="font-semibold text-white/70">{fPct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
                                  <div className="h-full bg-sky-500/60" style={{ width: `${fPct}%` }} />
                                </div>
                                <div className="mt-1 text-[10px] text-white/40">
                                  {fUsed.toLocaleString(undefined, { maximumFractionDigits: 4 })} /{' '}
                                  {target.toLocaleString()} •{' '}
                                  {Number((p as any).alloc_wallets_forecast ?? 0).toLocaleString()} wallets •{' '}
                                  {Number((p as any).alloc_rows_forecast ?? 0).toLocaleString()} rows
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3 text-white/60 text-xs">{fmtDate(p.opened_at)}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">{fmtDate(p.closed_at)}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">
                        {p.snapshot_taken_at ? '✅ taken' : '-'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isPlanned && !isCompleted && (
                            <>
                              <button
                                onClick={() => startEdit(p)}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs disabled:opacity-50"
                                title="Edit planned phase"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => deletePhase(p.phase_id)}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs disabled:opacity-50"
                                title="Delete planned phase (irreversible)"
                              >
                                Delete
                              </button>

                              <button
                                onClick={() => movePhase(p.phase_id, 'up')}
                                disabled={isBusy}
                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] text-white/70 disabled:opacity-50"
                                title="Move up (swap phase_no)"
                              >
                                ↑
                              </button>

                              <button
                                onClick={() => movePhase(p.phase_id, 'down')}
                                disabled={isBusy}
                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] text-white/70 disabled:opacity-50"
                                title="Move down (swap phase_no)"
                              >
                                ↓
                              </button>

                              {canShowOpen && (
                                <button
                                  onClick={() => openPhase(p.phase_id)}
                                  disabled={isBusy}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs disabled:opacity-50"
                                  title="Open this planned phase. This changes lifecycle only; queue allocation is handled by allocator."
                                >
                                  {isBusy ? 'Working…' : 'Open'}
                                </button>
                              )}
                            </>
                          )}

                          {(isActive || isReviewing) && (
                            <button
                              onClick={() => snapshotPhase(p.phase_id)}
                              disabled={isBusy || !isReviewing}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs disabled:opacity-50"
                              title="Snapshot finalizes claim data for a reviewing phase and marks it as completed."
                            >
                              {isBusy ? 'Working…' : 'Snapshot'}
                            </button>
                          )}

                          {canFinalize && (
                            <button
                              onClick={() => finalizePhase(p.phase_id)}
                              disabled={isBusy}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs disabled:opacity-50"
                              title="Approve this completed snapshot after consistency checks."
                            >
                              {isBusy ? 'Working…' : 'Finalize'}
                            </button>
                          )}

                          {canShowClaimPreview && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => window.open(`/api/admin/phases/${p.phase_id}/claim-preview`, '_blank')}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs disabled:opacity-50"
                                title="Open claim preview (default)"
                              >
                                Preview
                              </button>

                              <button
                                onClick={() =>
                                  window.open(`/api/admin/phases/${p.phase_id}/claim-preview?format=html`, '_blank')
                                }
                                disabled={isBusy}
                                className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                                title="Preview as HTML"
                              >
                                HTML
                              </button>

                              <button
                                onClick={() => window.open(`/api/admin/phases/${p.phase_id}/claim-preview`, '_blank')}
                                disabled={isBusy}
                                className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200 hover:bg-blue-500/15 disabled:opacity-50"
                                title="Preview as JSON"
                              >
                                JSON
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={10}>
                      No phases yet. Create Phase #1.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {openCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0f18] p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Create Phase</div>
                <button
                  onClick={() => setOpenCreate(false)}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs text-white/60 mb-1">Name</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                    placeholder="Phase 1 — Genesis"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Pool (MEGY)</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="1"
                      value={pool}
                      onChange={(e) => setPool(e.target.value)}
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Rate (USD/MEGY)</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                      placeholder="1"
                    />
                    <div className="text-[11px] text-white/45 mt-1">Example: 1 means 1 USD per 1 MEGY.</div>
                    {Number(rate) > 10 && (
                      <div className="text-[11px] mt-1 text-yellow-300">
                        ⚠ Rate looks unusually high. Are you sure?
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Target (USD)</div>
                    <input
                      value={computedTarget || ''}
                      readOnly
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2 opacity-80"
                      placeholder="Auto-calculated (Pool × Rate)"
                      title="Auto-calculated: Pool × Rate. Saved in DB as generated column."
                    />
                  </div>
                </div>

                <div className="text-[11px] text-white/55">
                  Rule: new planned phase rate cannot be lower than the previous phase rate.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setOpenCreate(false)}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createPhase}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm disabled:opacity-50"
                    disabled={saving || !canCreate}
                  >
                    {saving ? 'Creating…' : 'Create'}
                  </button>
                </div>

                <div className="text-[11px] text-white/55">
                  Tip: Give iconic names. These will show in ClaimPanel snapshot history.
                </div>
              </div>
            </div>
          </div>
        )}

        {openEdit && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0f18] p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Edit Phase</div>
                <button
                  onClick={() => setOpenEdit(false)}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-sm"
                  disabled={saving}
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs text-white/60 mb-1">Name</div>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                    placeholder="Phase 2 — ..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Pool (MEGY)</div>
                    <input
                      inputMode="decimal"
                      value={editPool}
                      onChange={(e) => setEditPool(e.target.value)}
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                      type="number"
                      min={0}
                      step="1"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Rate (USD/MEGY)</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2"
                    />
                    <div className="text-[11px] text-white/45 mt-1">Example: 1 means 1 USD per 1 MEGY.</div>
                    {Number(editRate) > 10 && (
                      <div className="text-[11px] mt-1 text-yellow-300">
                        ⚠ Rate looks unusually high. Are you sure?
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Target (USD)</div>
                    <input
                      value={computedEditTarget || ''}
                      readOnly
                      className="w-full rounded-lg bg-[#0a0f19] border border-white/10 px-3 py-2 opacity-80"
                      placeholder="Auto-calculated (Pool × Rate)"
                      title="Auto-calculated: Pool × Rate. DB will store target_usd automatically."
                    />
                  </div>
                </div>

                <div className="text-[11px] text-white/55">
                  Rule: planned phase rates must stay monotonic between previous and next phases.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setOpenEdit(false)}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={saveEdit}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm disabled:opacity-50"
                    disabled={saving || !canSaveEdit}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>

                  <button
                    onClick={() => {
                      if (!editDefaults) return;
                      setEditName(editDefaults.name);
                      setEditPool(editDefaults.pool);
                      setEditRate(editDefaults.rate);
                    }}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
                    disabled={saving || !editDefaults}
                    title="Reset changes"
                  >
                    Reset
                  </button>
                </div>

                <div className="text-[11px] text-white/55">
                  Rule: Only planned phases are editable.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}