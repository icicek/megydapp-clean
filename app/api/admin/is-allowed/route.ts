// app/api/admin/is-allowed/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function parseAllowlist(): Set<string> {
  const one = (process.env.ADMIN_WALLET || '').trim();
  const many = (process.env.ADMIN_WALLETS || '').trim();
  const arr = [one, ...many.split(',')].map(s => s.trim()).filter(Boolean);
  return new Set(arr.map(s => s.toLowerCase()));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const walletParam = (url.searchParams.get('wallet') || '').toLowerCase();

    // 1) Admin session cookie (HttpOnly) → varsa direkt izin
    const adminCookie = req.cookies.get('coincarnation_admin');
    if (adminCookie?.value) {
      return NextResponse.json({
        ok: true,
        allowed: true,
        via: 'cookie',
        reason: 'Admin session cookie present',
      });
    }

    // 2) ENV allowlist → cüzdan bu listede ise izin
    const allow = parseAllowlist();
    if (allow.size > 0 && walletParam && allow.has(walletParam)) {
      return NextResponse.json({
        ok: true,
        allowed: true,
        via: 'allowlist',
        reason: 'Wallet is on ADMIN_WALLET(S)',
      });
    }

    return NextResponse.json({
      ok: true,
      allowed: false,
      via: null,
      reason:
        allow.size === 0
          ? 'No allowlist configured and no admin cookie found'
          : 'Wallet not on allowlist and no admin cookie found',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, allowed: false, error: String(e?.message || e) }, { status: 500 });
  }
}
