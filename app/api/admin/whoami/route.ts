// app/api/admin/whoami/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);

  // strict=1 ise eski davranış (401) korunur; aksi halde 200 + {ok:false}
  const strict =
    req.headers.get('x-strict') === '1' || url.searchParams.get('strict') === '1';

  try {
    const wallet = await requireAdmin(req); // Cookie/Authorization doğrulaması
    return NextResponse.json({ ok: true, wallet });
  } catch (e: any) {
    if (!strict) {
      // 🔇 Sessiz mod (DEFAULT): admin değilse 200 döner, cüzdan akışını bozmaz
      return NextResponse.json({ ok: false, wallet: null }, { status: 200 });
    }
    const { status, body } = httpErrorFrom(e, 401);
    return NextResponse.json(body, { status });
  }
}
