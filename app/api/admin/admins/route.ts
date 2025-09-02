// app/api/admin/admins/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { getExtraAdmins, setExtraAdmins, envAdmins } from '@/app/api/_lib/admins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req as any);
    const [env, extra] = [envAdmins(), await getExtraAdmins()];
    return NextResponse.json({ success: true, env, extra });
  } catch (e:any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}

// Body: { wallets: string[] }
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req as any);
    verifyCsrf(req as any);
    const body = await req.json();
    const wallets: string[] = Array.isArray(body?.wallets) ? body.wallets : [];
    if (wallets.length > 200) {
      return NextResponse.json({ success:false, error:'too many wallets (max 200)' }, { status: 400 });
    }
    // basit doğrulama (Solana pubkey'ler genellikle 32-44 arası base58)
    const cleaned = wallets
      .map(w => String(w).trim())
      .filter(w => /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(w));

    await setExtraAdmins(cleaned, admin);
    return NextResponse.json({ success: true, extra: cleaned });
  } catch (e:any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
