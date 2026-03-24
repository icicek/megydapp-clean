// app/api/admin/is-allowed/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function parseAllowlist(): Set<string> {
  const one = (process.env.ADMIN_WALLET || '').trim();
  const many = (process.env.ADMIN_WALLETS || '').trim();
  const arr = [one, ...many.split(',')].map((s) => s.trim()).filter(Boolean);
  return new Set(arr.map((s) => s.toLowerCase()));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const walletParam = (url.searchParams.get('wallet') || '').trim().toLowerCase();

    const allow = parseAllowlist();

    if (!walletParam) {
      return NextResponse.json({
        ok: true,
        allowed: false,
        via: null,
        reason: 'No wallet provided',
      });
    }

    const allowed = allow.size > 0 && allow.has(walletParam);

    return NextResponse.json({
      ok: true,
      allowed,
      via: allowed ? 'allowlist' : null,
      reason: allowed
        ? 'Wallet is on ADMIN_WALLET(S)'
        : allow.size === 0
        ? 'No allowlist configured'
        : 'Wallet not on allowlist',
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, allowed: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}