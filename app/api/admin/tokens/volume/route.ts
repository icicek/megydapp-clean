// app/api/admin/tokens/volume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';
import getVolumeAndLiquidity from '@/app/api/utils/getVolumeAndLiquidity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // admin auth (cookie tabanlı)
    await requireAdmin(req as any);

    const { searchParams } = new URL(req.url);
    const mint = (searchParams.get('mint') || '').trim();
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    }

    const vl = await getVolumeAndLiquidity({ mint });

    return NextResponse.json({
      success: true,
      mint,
      ...vl, // { dexVolumeUSD, cexVolumeUSD, totalVolumeUSD, dexLiquidityUSD, dexSource, cexSource }
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
