// app/api/admin/config/admins/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { listAdmins, replaceAdmins, isEnvAdmin } from '@/app/api/_lib/admins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const wallet = await requireAdmin(req);
    if (!isEnvAdmin(wallet)) {
      return NextResponse.json({ success:false, error:'forbidden' }, { status: 403 });
    }
    const wallets = await listAdmins();
    return NextResponse.json({ success: true, wallets });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    verifyCsrf(req);
    const wallet = await requireAdmin(req);
    if (!isEnvAdmin(wallet)) {
      return NextResponse.json({ success:false, error:'forbidden' }, { status: 403 });
    }

    const body = await req.json();
    let wallets: string[] = [];
    if (Array.isArray(body?.wallets)) wallets = body.wallets;
    else if (typeof body?.wallets === 'string') {
      wallets = body.wallets.split(/[\s,;]+/g).map((s: string) => s.trim()).filter(Boolean);
    } else {
      return NextResponse.json({ success:false, error:'wallets required' }, { status: 400 });
    }

    const saved = await replaceAdmins(wallets, wallet);
    return NextResponse.json({ success: true, wallets: saved });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
