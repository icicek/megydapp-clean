// app/api/admin/phases/[id]/claim-preview/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

function toId(params: any): number {
  const id = Number(params?.id);
  return Number.isFinite(id) ? id : 0;
}

function escapeHtml(v: any): string {
  const s = String(v ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtNum(v: any, maxFrac = 6): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
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

type Warn = { level: 'info' | 'warn' | 'error'; code: string; message: string };

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nearlyEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function buildWarnings(input: { alloc: any; snap: any; phaseFinalizedAt?: any }): Warn[] {
  const w: Warn[] = [];
  const alloc = input.alloc ?? {};
  const snap = input.snap ?? {};
  const isFinalized = !!input.phaseFinalizedAt;

  const allocUsd = toNum(alloc.usd_sum);
  const allocMegy = toNum(alloc.megy_sum);
  const allocWallets = toNum(alloc.n_wallets);

  const snapUsd = toNum(snap.usd_sum);
  const snapMegy = toNum(snap.megy_sum);
  const snapWallets = toNum(snap.n_wallets);
  const shareSum = toNum(snap.share_ratio_sum);

  const hasAlloc = allocWallets > 0 || allocUsd > 0 || allocMegy > 0;
  const hasSnap = snapWallets > 0 || snapUsd > 0 || snapMegy > 0;

  // Tolerances (numeric + rounding)
  const USD_EPS = 0.01;     // 1 cent
  const MEGY_EPS = 0.0001;  // small token tolerance
  const SHARE_EPS = 1e-4;

  // ✅ FINALIZED MODE: suppress noisy warnings, show only actionable errors
  if (isFinalized) {
    const megyOk = nearlyEqual(allocMegy, snapMegy, MEGY_EPS);
    const usdOk = nearlyEqual(allocUsd, snapUsd, USD_EPS);

    if (!megyOk || !usdOk) {
      w.push({
        level: 'error',
        code: 'FINALIZE_BLOCKED_MISMATCH',
        message:
          'Phase is finalized but totals do not match. Finalized phases must have exact allocation↔snapshot consistency.',
      });

      w.push({
        level: 'info',
        code: 'WHAT_TO_CHECK',
        message:
          'Look at: (1) phase_allocations totals vs claim_snapshots totals, (2) missing/extra wallets, (3) if NOT finalized you can re-run snapshot, (4) check for late contributions included/excluded.',
      });

      return w; // ✅ stop here: no other warn/info noise
    }

    // If finalized and totals are OK, we can optionally still check share sum.
    // (Share sum is informational and can be useful.)
    if (snapWallets > 0 && !nearlyEqual(shareSum, 1, SHARE_EPS)) {
      w.push({
        level: 'info',
        code: 'SHARE_SUM_NOT_ONE',
        message: `Share ratio sum is ${shareSum} (expected ~1.0)`,
      });
    }

    return w; // ✅ finalized + ok → done
  }

  // ---- NON-FINALIZED MODE (normal warnings) ----

  if (hasAlloc && !hasSnap) {
    w.push({
      level: 'warn',
      code: 'SNAPSHOT_EMPTY',
      message: 'No claim_snapshots found. Snapshot may not have been taken yet.',
    });
  }

  if (!nearlyEqual(allocMegy, snapMegy, MEGY_EPS)) {
    w.push({
      level: 'warn',
      code: 'MEGY_POOL_MISMATCH',
      message: `MEGY mismatch: allocations=${allocMegy} vs claim_snapshots=${snapMegy}`,
    });
  }

  if (!nearlyEqual(allocUsd, snapUsd, USD_EPS)) {
    w.push({
      level: 'warn',
      code: 'USD_TOTAL_MISMATCH',
      message: `USD mismatch: allocations=${allocUsd} vs claim_snapshots=${snapUsd}`,
    });
  }

  if (allocWallets !== 0 && snapWallets !== 0 && allocWallets !== snapWallets) {
    w.push({
      level: 'warn',
      code: 'WALLET_COUNT_MISMATCH',
      message: `Wallet count mismatch: allocations=${allocWallets} vs claim_snapshots=${snapWallets}`,
    });
  }

  if (snapWallets > 0 && !nearlyEqual(shareSum, 1, SHARE_EPS)) {
    w.push({
      level: 'info',
      code: 'SHARE_SUM_NOT_ONE',
      message: `Share ratio sum is ${shareSum} (expected ~1.0)`,
    });
  }

  // Quick sanity on negative totals
  if (allocUsd < -USD_EPS || snapUsd < -USD_EPS || allocMegy < -MEGY_EPS || snapMegy < -MEGY_EPS) {
    w.push({
      level: 'error',
      code: 'NEGATIVE_TOTALS',
      message: `Negative totals detected (allocUsd=${allocUsd}, snapUsd=${snapUsd}, allocMegy=${allocMegy}, snapMegy=${snapMegy})`,
    });
  }

  return w;
}

function renderHtml(data: {
  phase: any;
  totals: { allocations: any; claimSnapshots: any };
  top: any[];
  warnings: Warn[];
  urls: { json: string; html: string };
}) {
  const { phase, totals, top, warnings, urls } = data;

  const title = `Claim Preview – Phase #${phase?.phase_no ?? '?'}`;

  const alloc = totals?.allocations ?? {};
  const snap = totals?.claimSnapshots ?? {};

  const banner = (warnings ?? []).map((x) => {
    const cls =
      x.level === 'error'
        ? 'border:#ef4444;background:rgba(239,68,68,0.12);color:#fecaca;'
        : x.level === 'warn'
        ? 'border:#f59e0b;background:rgba(245,158,11,0.12);color:#fde68a;'
        : 'border:#60a5fa;background:rgba(96,165,250,0.10);color:#bfdbfe;';
  
    const extra =
      x.code === 'FINALIZE_BLOCKED_MISMATCH'
        ? `
          <div class="muted" style="margin-top:6px;">
            What to check:
            <ul style="margin:6px 0 0 16px; padding:0;">
              <li>phase_allocations totals vs claim_snapshots totals</li>
              <li>Missing or extra wallets in snapshots</li>
              <li>If NOT finalized, re-run snapshot</li>
              <li>Late contributions included / excluded</li>
            </ul>
          </div>
        `
        : '';
  
    return `<div class="alert" style="${cls}">
      <div class="code">${escapeHtml(x.code)}</div>
      <div class="msg">${escapeHtml(x.message)}</div>
      ${extra}
    </div>`;
  }).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      --bg:#0b0f18;
      --card:#0f1422;
      --line:#2a2f3a;
      --muted:#9ca3af;
      --text:#e5e7eb;
      --link:#60a5fa;
    }
    body{
      margin:0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background:var(--bg);
      color:var(--text);
      padding:24px;
    }
    h1{ margin:0 0 6px 0; font-size:20px; }
    h2{ margin:0 0 10px 0; font-size:14px; color:var(--muted); font-weight:600; letter-spacing:.2px;}
    .muted{ color:var(--muted); font-size:12px; }
    .wrap{ max-width:1100px; margin:0 auto; }
    .box{
      border:1px solid var(--line);
      border-radius:14px;
      padding:16px;
      background:var(--card);
      margin-top:14px;
      overflow:auto;
    }
    .grid{
      display:grid;
      grid-template-columns: 1fr;
      gap:14px;
    }
    @media(min-width:900px){
      .grid{ grid-template-columns: 1fr 1fr; }
    }
    table{
      width:100%;
      border-collapse:collapse;
      font-size:13px;
      min-width: 760px;
    }
    th, td{
      border-bottom:1px solid var(--line);
      padding:10px 10px;
      text-align:left;
      vertical-align:top;
      white-space:nowrap;
    }
    th{
      color:var(--muted);
      font-weight:600;
      font-size:12px;
    }
    td.num, th.num{ text-align:right; }
    a{ color:var(--link); text-decoration:none; }
    a:hover{ text-decoration:underline; }
    .pill{
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,0.04);
      font-size:12px;
      color:var(--text);
    }
    .kv{
      display:grid;
      grid-template-columns: 170px 1fr;
      gap:8px 12px;
      font-size:13px;
    }
    .k{ color:var(--muted); }
    .v{ color:var(--text); overflow-wrap:anywhere; }
    .actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      align-items:center;
    }
    .btn{
      cursor:pointer;
      border:1px solid var(--line);
      background:rgba(255,255,255,0.06);
      color:var(--text);
      padding:8px 10px;
      border-radius:10px;
      font-size:12px;
    }
    .btn:hover{ background:rgba(255,255,255,0.10); }
    .alerts{ display:flex; flex-direction:column; gap:10px; margin-top:14px; }
    .alert{
      border:1px solid;
      border-radius:12px;
      padding:10px 12px;
    }
    .alert .code{ font-weight:700; font-size:12px; margin-bottom:2px; }
    .alert .msg{ font-size:12px; }
    .toast{
      position: fixed;
      right: 18px;
      bottom: 18px;
      background: rgba(17, 24, 39, 0.92);
      border: 1px solid var(--line);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 12px;
      display:none;
      max-width: 360px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <div class="muted">Read-only. Generated from <code>claim_snapshots</code> + <code>phase_allocations</code>.</div>

    <div class="box">
      <h2>Actions</h2>
      <button class="btn" data-copy="${escapeHtml(urls.json)}" onclick="copyFromDataset(this)">
        Copy JSON URL
      </button>
      <button class="btn" data-copy="${escapeHtml(urls.html)}" onclick="copyFromDataset(this)">
        Copy HTML URL
      </button>
        <a class="btn" href="${escapeHtml(urls.json)}" target="_blank" rel="noreferrer">Open JSON</a>
        <a class="btn" href="${escapeHtml(urls.html)}" target="_blank" rel="noreferrer">Open HTML</a>
        <button class="btn" onclick="copyText('${escapeHtml(urls.json)}')">Copy JSON URL</button>
        <button class="btn" onclick="copyText('${escapeHtml(urls.html)}')">Copy HTML URL</button>
      </div>
      <div class="muted" style="margin-top:8px;">
        JSON URL: <span style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(urls.json)}</span>
      </div>
    </div>

    ${
      warnings?.length
        ? `<div class="alerts">${banner}</div>`
        : `<div class="box"><div class="muted">No anomalies detected ✅</div></div>`
    }

    <div class="box">
      <h2>Phase Meta</h2>
      <div class="kv">
        <div class="k">Phase</div>
        <div class="v">#${escapeHtml(phase?.phase_no)} — ${escapeHtml(phase?.name ?? '')}</div>

        <div class="k">Status</div>
        <div class="v"><span class="pill">${escapeHtml(phase?.status ?? '')}</span></div>

        <div class="k">Rate</div>
        <div class="v">${escapeHtml(fmtNum(phase?.rate_usd_per_megy, 12))} USD/MEGY</div>

        <div class="k">Opened</div>
        <div class="v">${escapeHtml(fmtDate(phase?.opened_at))}</div>

        <div class="k">Closed</div>
        <div class="v">${escapeHtml(fmtDate(phase?.closed_at))}</div>

        <div class="k">Snapshot taken</div>
        <div class="v">${escapeHtml(fmtDate(phase?.snapshot_taken_at))}</div>

        ${phase?.finalized_at ? `
          <div class="k">Finalized</div>
          <div class="v">
            <span class="pill">✅ finalized</span>
            <span class="muted" style="margin-left:8px;">${escapeHtml(fmtDate(phase.finalized_at))}</span>
          </div>
        ` : `
          <div class="k">Finalized</div>
          <div class="v"><span class="pill" style="opacity:.7;">not finalized</span></div>
        `}
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <h2>Totals — Allocations (phase_allocations)</h2>
        <div class="kv">
          <div class="k">Rows</div><div class="v">${escapeHtml(fmtNum(alloc?.n_rows, 0))}</div>
          <div class="k">Wallets</div><div class="v">${escapeHtml(fmtNum(alloc?.n_wallets, 0))}</div>
          <div class="k">USD sum</div><div class="v">${escapeHtml(fmtNum(alloc?.usd_sum, 6))}</div>
          <div class="k">MEGY sum</div><div class="v">${escapeHtml(fmtNum(alloc?.megy_sum, 6))}</div>
        </div>
      </div>

      <div class="box">
        <h2>Totals — Claim Snapshots (claim_snapshots)</h2>
        <div class="kv">
          <div class="k">Wallets</div><div class="v">${escapeHtml(fmtNum(snap?.n_wallets, 0))}</div>
          <div class="k">USD sum</div><div class="v">${escapeHtml(fmtNum(snap?.usd_sum, 6))}</div>
          <div class="k">MEGY sum</div><div class="v">${escapeHtml(fmtNum(snap?.megy_sum, 6))}</div>
          <div class="k">Share sum</div><div class="v">${escapeHtml(fmtNum(snap?.share_ratio_sum, 12))}</div>
        </div>
      </div>
    </div>

    <div class="box">
      <h2>Top wallets (by MEGY)</h2>
      <table>
        <thead>
          <tr>
            <th>Wallet</th>
            <th class="num">MEGY</th>
            <th class="num">USD</th>
            <th class="num">Share ratio</th>
            <th>Claim status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${
            (Array.isArray(top) ? top : []).map((r) => `
              <tr>
                <td>${escapeHtml(r?.wallet_address)}</td>
                <td class="num">${escapeHtml(fmtNum(r?.megy_amount, 6))}</td>
                <td class="num">${escapeHtml(fmtNum(r?.contribution_usd, 6))}</td>
                <td class="num">${escapeHtml(fmtNum(r?.share_ratio, 12))}</td>
                <td>${escapeHtml(r?.claim_status)}</td>
                <td>${escapeHtml(fmtDate(r?.created_at))}</td>
              </tr>
            `).join('')
          }
        </tbody>
      </table>
      <div class="muted" style="margin-top:10px;">
        Tip: use browser search (Ctrl/⌘+F) to find a wallet quickly.
      </div>
    </div>

  </div>

  <div id="toast" class="toast"></div>
  <script>
    function copyFromDataset(btn){
      const v = btn && btn.dataset ? btn.dataset.copy : '';
      copyText(v || '');
    }
    function showToast(msg){
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(()=>{ t.style.display='none'; }, 1800);
    }
    async function copyText(text){
      try{
        await navigator.clipboard.writeText(text);
        showToast('Copied ✅');
      }catch(e){
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Copied ✅');
      }
    }
  </script>
</body>
</html>`;
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    await requireAdmin(req as any);

    const phaseId = toId(ctx?.params);
    if (!phaseId) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_ID' }, { status: 400 });
    }

    const format = req.nextUrl.searchParams.get('format');
    const wantsHtml = format === 'html';

    // Phase
    const ph = (await sql`
      SELECT id, phase_no, name, status, snapshot_taken_at, opened_at, closed_at, rate_usd_per_megy, finalized_at
      FROM phases
      WHERE id = ${phaseId}
      LIMIT 1;
    `) as any[];

    if (!ph?.[0]) {
      return NextResponse.json({ success: false, error: 'PHASE_NOT_FOUND' }, { status: 404 });
    }

    // Alloc totals
    const alloc = (await sql`
      SELECT
        COUNT(*)::int AS n_rows,
        COUNT(DISTINCT wallet_address)::int AS n_wallets,
        COALESCE(SUM(usd_allocated),0)::numeric AS usd_sum,
        COALESCE(SUM(megy_allocated),0)::numeric AS megy_sum
      FROM phase_allocations
      WHERE phase_id = ${phaseId};
    `) as any[];

    // Claim totals
    const snap = (await sql`
      SELECT
        COUNT(*)::int AS n_wallets,
        COALESCE(SUM(contribution_usd),0)::numeric AS usd_sum,
        COALESCE(SUM(megy_amount),0)::numeric AS megy_sum,
        COALESCE(SUM(share_ratio),0)::numeric AS share_ratio_sum
      FROM claim_snapshots
      WHERE phase_id = ${phaseId};
    `) as any[];

    // Top 50 preview
    const top = (await sql`
      SELECT
        wallet_address,
        megy_amount,
        contribution_usd,
        share_ratio,
        claim_status,
        created_at
      FROM claim_snapshots
      WHERE phase_id = ${phaseId}
      ORDER BY megy_amount DESC, contribution_usd DESC
      LIMIT 50;
    `) as any[];

    // ✅ LIVE MODE (snapshot yoksa): contributions üzerinden hesapla
    const wantsLive = !ph?.[0]?.snapshot_taken_at && !ph?.[0]?.finalized_at;

    let allocRow = alloc?.[0] ?? null;
    let snapRow  = snap?.[0] ?? null;
    let topRows  = Array.isArray(top) ? top : [];

    if (wantsLive) {
      const rate = Number(ph?.[0]?.rate_usd_per_megy || 0);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json({ success: false, error: 'BAD_PHASE_RATE' }, { status: 400 });
      }

      const liveTop = (await sql`
        WITH phases_sorted AS (
          SELECT
            p.id,
            p.phase_no,
            COALESCE(p.target_usd,0)::numeric AS target_usd_num,
            SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC) AS cum_target,
            (SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC)
              - COALESCE(p.target_usd,0)::numeric) AS cum_prev
          FROM phases p
        ),
        this_phase AS (
          SELECT * FROM phases_sorted WHERE id = ${phaseId} LIMIT 1
        ),
        eligible AS (
          SELECT
            c.id AS contribution_id,
            c.wallet_address,
            COALESCE(c.usd_value,0)::numeric AS usd_value,
            c.timestamp
          FROM contributions c
          WHERE COALESCE(c.usd_value,0)::numeric > 0
            AND COALESCE(c.network,'solana') = 'solana'
            AND COALESCE(c.alloc_status,'pending') <> 'invalid'
          ORDER BY c.timestamp ASC, c.id ASC
        ),
        running AS (
          SELECT
            e.*,
            (SUM(e.usd_value) OVER (ORDER BY e.timestamp ASC, e.contribution_id ASC) - e.usd_value) AS rt_prev,
            SUM(e.usd_value) OVER (ORDER BY e.timestamp ASC, e.contribution_id ASC) AS rt
          FROM eligible e
        ),
        alloc AS (
          SELECT
            r.wallet_address,
            GREATEST(
              0,
              LEAST(r.rt, tp.cum_target) - GREATEST(r.rt_prev, tp.cum_prev)
            )::numeric AS usd_allocated
          FROM running r
          CROSS JOIN this_phase tp
          WHERE r.rt > tp.cum_prev AND r.rt_prev < tp.cum_target
        ),
        wallet_alloc AS (
          SELECT wallet_address, SUM(usd_allocated)::numeric AS usd_sum
          FROM alloc
          WHERE usd_allocated > 0
          GROUP BY wallet_address
        ),
        with_megy AS (
          SELECT
            wallet_address,
            usd_sum AS contribution_usd,
            (usd_sum / ${rate})::numeric AS megy_amount
          FROM wallet_alloc
        ),
        totals AS (
          SELECT
            COALESCE(SUM(contribution_usd),0)::numeric AS usd_total,
            COALESCE(SUM(megy_amount),0)::numeric AS megy_total
          FROM with_megy
        )
        SELECT
          w.wallet_address,
          w.megy_amount,
          w.contribution_usd,
          CASE WHEN t.megy_total > 0 THEN (w.megy_amount / t.megy_total) ELSE 0 END AS share_ratio,
          'live'::text AS claim_status,
          NOW() AS created_at
        FROM with_megy w
        CROSS JOIN totals t
        ORDER BY w.megy_amount DESC, w.contribution_usd DESC
        LIMIT 50;
      `) as any[];

      const liveTotals = (await sql`
        WITH phases_sorted AS (
          SELECT
            p.id,
            COALESCE(p.target_usd,0)::numeric AS target_usd_num,
            SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC) AS cum_target,
            (SUM(COALESCE(p.target_usd,0)::numeric) OVER (ORDER BY p.phase_no ASC, p.id ASC)
              - COALESCE(p.target_usd,0)::numeric) AS cum_prev
          FROM phases p
        ),
        this_phase AS (
          SELECT * FROM phases_sorted WHERE id = ${phaseId} LIMIT 1
        ),
        eligible AS (
          SELECT
            c.id AS contribution_id,
            c.wallet_address,
            COALESCE(c.usd_value,0)::numeric AS usd_value,
            c.timestamp
          FROM contributions c
          WHERE COALESCE(c.usd_value,0)::numeric > 0
            AND COALESCE(c.network,'solana') = 'solana'
            AND COALESCE(c.alloc_status,'pending') <> 'invalid'
          ORDER BY c.timestamp ASC, c.id ASC
        ),
        running AS (
          SELECT
            e.*,
            (SUM(e.usd_value) OVER (ORDER BY e.timestamp ASC, e.contribution_id ASC) - e.usd_value) AS rt_prev,
            SUM(e.usd_value) OVER (ORDER BY e.timestamp ASC, e.contribution_id ASC) AS rt
          FROM eligible e
        ),
        alloc AS (
          SELECT
            r.contribution_id,
            r.wallet_address,
            GREATEST(
              0,
              LEAST(r.rt, tp.cum_target) - GREATEST(r.rt_prev, tp.cum_prev)
            )::numeric AS usd_allocated
          FROM running r
          CROSS JOIN this_phase tp
          WHERE r.rt > tp.cum_prev AND r.rt_prev < tp.cum_target
        ),
        wallet_alloc AS (
          SELECT wallet_address, SUM(usd_allocated)::numeric AS usd_sum
          FROM alloc
          WHERE usd_allocated > 0
          GROUP BY wallet_address
        )
        SELECT
          (SELECT COUNT(*) FROM alloc WHERE usd_allocated > 0)::int AS n_rows,
          (SELECT COUNT(*) FROM wallet_alloc)::int AS n_wallets,
          COALESCE((SELECT SUM(usd_sum) FROM wallet_alloc),0)::numeric AS usd_sum,
          COALESCE((SELECT SUM(usd_sum)/${rate} FROM wallet_alloc),0)::numeric AS megy_sum
      `) as any[];

      allocRow = liveTotals?.[0] ?? { n_rows: 0, n_wallets: 0, usd_sum: 0, megy_sum: 0 };
      snapRow  = { n_wallets: 0, usd_sum: 0, megy_sum: 0, share_ratio_sum: 0 };
      topRows  = liveTop;
    }

    const warnings = buildWarnings({
      alloc: allocRow,
      snap: snapRow,
      phaseFinalizedAt: ph?.[0]?.finalized_at ?? null,
    });

    // Build absolute-ish URLs (relative is ok too, but this is nicer for copy)
    const origin = req.nextUrl.origin;
    const jsonUrl = `${origin}/api/admin/phases/${phaseId}/claim-preview`;
    const htmlUrl = `${origin}/api/admin/phases/${phaseId}/claim-preview?format=html`;

    const payload = {
      phase: ph[0],
      totals: {
        allocations: allocRow,
        claimSnapshots: snapRow,
      },
      top: topRows,
      warnings,
    };

    const rate = Number(ph[0]?.rate_usd_per_megy || 0);
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ success: false, error: 'BAD_PHASE_RATE' }, { status: 400 });
    }

    if (wantsHtml) {
      return new NextResponse(
        renderHtml({
          phase: payload.phase,
          totals: payload.totals,
          top: payload.top,
          warnings: payload.warnings,
          urls: { json: jsonUrl, html: htmlUrl },
        }),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    return NextResponse.json({
      success: true,
      ...payload,
      message: '✅ Claim preview ready (read-only).',
    });
  } catch (err: unknown) {
    const { status, body } = httpErrorFrom(err, 500);
    return NextResponse.json(body, { status });
  }
}