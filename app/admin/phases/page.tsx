// app/admin/phases/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type PhaseStatus = 'planned' | 'active' | 'completed';

type PhaseRow = {
  phase_id: number;
  phase_no: number;
  name: string;
  status: PhaseStatus; // planned | active | completed
  pool_megy?: any;
  rate_usd_per_megy?: any;
  target_usd?: any;
  opened_at?: any;
  closed_at?: any;
  snapshot_taken_at?: any;
  created_at?: any;
  updated_at?: any;
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
  // small rates like 0.0001 should be visible
  return n.toLocaleString(undefined, { maximumFractionDigits: 12 });
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
  nextOpened?: { id: number; phaseNo: number } | null;
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

  // create modal
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

  // edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPool, setEditPool] = useState('500000');
  const [editRate, setEditRate] = useState('1');
  const [editDefaults, setEditDefaults] = useState<{ name: string; pool: string; rate: string } | null>(null);

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

  // action busy flags
  const [busyId, setBusyId] = useState<number | null>(null);

  const active = useMemo(() => rows.find((r) => r.status === 'active') ?? null, [rows]);

  const nextPlannedId = useMemo(() => {
    const planned = rows.filter((r) => !r.status || r.status === 'planned');
    if (planned.length === 0) return null;
  
    // find smallest phase_no among planned phases
    let best = planned[0];
    for (const r of planned) {
      if (Number(r.phase_no) < Number(best.phase_no)) best = r;
    }
    return best.phase_id;
  }, [rows]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const j = await getJSON<{ success: boolean; phases: PhaseRow[] }>('/api/phases/list');
      setRows(Array.isArray(j?.phases) ? j.phases : []);
    } catch (e: any) {
      setMsg(`❌ Failed to load phases (${e?.message || 'error'})`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createPhase() {
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
      setMsg(`❌ ${e?.message || 'Create failed'}`);
    } finally {
      setSaving(false);
    }
  }

  async function openPhase(id: number) {
    setMsg(null);
    setBusyId(id);
  
    try {
      await sendJSON(`/api/admin/phases/${id}/open`, 'POST');
      await refresh();
      setMsg('✅ Phase opened');
      scrollToPhase(id);
    } catch (e: any) {
      const err = String(e?.message || '');
  
      if (err.includes('ACTIVE_PHASE_EXISTS')) {
        setMsg('⚠️ There is already an active phase. Close it or take a snapshot first.');
      } else if (err.includes('PHASE_NOT_PLANNED')) {
        setMsg('⚠️ Only planned phases can be opened.');
      } else if (err.includes('PHASE_NOT_FOUND')) {
        setMsg('❌ Phase not found.');
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
    if (editId == null) return;

    const id = editId; // capture before any state changes
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
      setMsg(`❌ ${e?.message || 'Edit failed'}`);
    } finally {
      setSaving(false);
    }
  }

  async function closePhase(id: number) {
    setMsg(null);
    setBusyId(id);
  
    try {
      await sendJSON(`/api/admin/phases/${id}/close`, 'POST');
      await refresh();
      setMsg('✅ Phase closed');
      scrollToPhase(id);
    } catch (e: any) {
      const err = String(e?.message || '');
  
      if (err.includes('PHASE_NOT_ACTIVE')) {
        setMsg('⚠️ Only an active phase can be closed.');
      } else {
        setMsg(`❌ ${err || 'Close failed'}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function snapshotPhase(id: number) {
    setMsg(null);
    setBusyId(id);

    try {
      const ok = window.confirm(
        'Take snapshot for this phase?\n\nThis will close the active phase and automatically activate the next planned phase (if any).'
      );
      if (!ok) return;

      const j = await sendJSON<SnapshotResponse>(`/api/admin/phases/${id}/snapshot`, 'POST');

      const nextNo = j?.nextOpened?.phaseNo ?? null;

      await refresh();

      if (j?.success) {
        if (j?.nextOpened?.id) {
            scrollToPhase(j.nextOpened.id);
        }
        const next = nextNo ? ` → Next opened: #${nextNo}` : '';
        setMsg(`✅ Snapshot complete${next}`);
      } else {
        setMsg(`❌ ${j?.error || 'SNAPSHOT_FAILED'}`);
      }
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Snapshot failed'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function deletePhase(id: number) {
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
    setMsg(null);
    setBusyId(id);
    try {
      await sendJSON(`/api/admin/phases/${id}/move`, 'POST', { dir });
      await refresh();
      scrollToPhase(id);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Move failed'}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Phases</h1>
            <p className="text-xs text-white/60 mt-1">
              Create phases, set iconic names, and control open/close/snapshot.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/control"
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            >
              Control
            </Link>
            <button
              onClick={() => setOpenCreate(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm"
            >
              + Add Phase
            </button>
          </div>
        </div>

        {msg && <div className={`${CARD} text-sm`}>{msg}</div>}
        {loading && <div className={`${CARD} text-sm text-white/70`}>Loading…</div>}

        {/* Active banner */}
        <div className={CARD}>
          <div className="text-sm text-white/80">
            Active phase:{' '}
            {active ? (
              <span className="font-semibold text-emerald-300">
                #{active.phase_no} — {active.name}
              </span>
            ) : (
              <span className="font-semibold text-white/60">None</span>
            )}
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            Rule: Only one phase can be active at a time. Snapshot closes active and auto-opens the next planned phase.
          </div>
        </div>

        {/* Table */}
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
                  <th className="text-left px-4 py-3">Opened</th>
                  <th className="text-left px-4 py-3">Closed</th>
                  <th className="text-left px-4 py-3">Snapshot</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((p) => {
                  const isActive = p.status === 'active';
                  const isCompleted = p.status === 'completed';
                  const isPlanned = !p.status || p.status === 'planned';
                  const isBusy = busyId === p.phase_id;
                  const canShowOpen = isPlanned && !active && nextPlannedId === p.phase_id;

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
                        <div className="font-semibold text-white">#{p.phase_no} — {p.name || '(unnamed)'}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={[
                            'px-2 py-1 rounded-md text-xs border',
                            isActive
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                              : isCompleted
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                              : 'bg-white/5 border-white/10 text-white/70',
                          ].join(' ')}
                        >
                          {(p.status || 'planned') as any}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-white/80">{fmtNum(p.pool_megy ?? 0)}</td>
                      <td className="px-4 py-3 text-white/80">{fmtRate(p.rate_usd_per_megy ?? 0)}</td>
                      <td className="px-4 py-3 text-white/80">
                        {p.target_usd == null || p.target_usd === '' ? '-' : fmtNum(p.target_usd)}
                      </td>

                      <td className="px-4 py-3 text-white/60 text-xs">{fmtDate(p.opened_at)}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">{fmtDate(p.closed_at)}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">{p.snapshot_taken_at ? '✅ taken' : '-'}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Planned actions */}
                          {isPlanned && !isCompleted && (
                            <>
                              {canShowOpen && (
                                <button
                                    onClick={() => openPhase(p.phase_id)}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs disabled:opacity-50"
                                    title="Start operation: open the next planned phase"
                                >
                                    {isBusy ? 'Working…' : 'Open'}
                                </button>
                              )}

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
                            </>
                          )}

                          {/* Active actions */}
                          {isActive && (
                            <>
                              <button
                                onClick={() => closePhase(p.phase_id)}
                                disabled={isBusy}
                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] text-white/70 disabled:opacity-50"
                                title="Override: manually complete this phase"
                              >
                                {isBusy ? 'Working…' : 'Close'}
                              </button>

                              <button
                                onClick={() => snapshotPhase(p.phase_id)}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs disabled:opacity-50"
                                title="Snapshot closes this active phase and auto-opens next planned phase"
                              >
                                {isBusy ? 'Working…' : 'Snapshot'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={9}>
                      No phases yet. Create Phase #1.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create modal */}
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
                      <div className="text-[11px] mt-1 text-yellow-300">⚠ Rate looks unusually high. Are you sure?</div>
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

        {/* Edit modal */}
        {openEdit && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0f18] p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Edit Phase</div>
                <button
                  onClick={() => {
                    setOpenEdit(false);
                    // keep editId for UX? optionally clear:
                    // setEditId(null);
                  }}
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
                    {Number(rate) > 10 && (
                      <div className="text-[11px] mt-1 text-yellow-300">⚠ Rate looks unusually high. Are you sure?</div>
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

                <div className="text-[11px] text-white/55">Rule: Only planned phases are editable.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}