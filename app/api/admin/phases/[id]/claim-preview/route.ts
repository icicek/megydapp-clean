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

function renderHtml(data: {
  phase: any;
  totals: { allocations: any; claimSnapshots: any };
  top: any[];
}) {
  const { phase, totals, top } = data;

  const title = `Claim Preview – Phase #${phase?.phase_no ?? '?'}`;

  const alloc = totals?.allocations ?? {};
  const snap = totals?.claimSnapshots ?? {};

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
    .links{ margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <div class="muted">Read-only. Generated from <code>claim_snapshots</code> + <code>phase_allocations</code>.</div>

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
      </div>

      <div class="links muted">
        <a href="?">View JSON</a>
        <span>·</span>
        <a href="?format=html">View HTML</a>
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
      SELECT id, phase_no, name, status, snapshot_taken_at, opened_at, closed_at, rate_usd_per_megy
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

    const payload = {
      phase: ph[0],
      totals: {
        allocations: alloc?.[0] ?? null,
        claimSnapshots: snap?.[0] ?? null,
      },
      top,
    };

    if (wantsHtml) {
      return new NextResponse(renderHtml(payload), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
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