// app/api/record/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    console.log('📥 Legacy /api/record received:', body);

    // Eğer yeni yapıya yakın bir payload geldiyse (ör. başka bir client),
    // içten /api/coincarnation/record'a proxy'leyelim:
    const looksNewStyle =
      (body && (body.wallet_address || body.wallet || body.address)) &&
      (body.token_symbol || body.token) &&
      (body.token_amount || body.amount || body.usd_value != null);

    if (looksNewStyle) {
      // Eski anahtarları yeni isimlere dönüştür (best-effort)
      const payload = {
        wallet_address: body.wallet_address || body.wallet || body.address,
        token_symbol: body.token_symbol || body.token,
        token_contract: body.token_contract || body.mint || null,
        token_amount: body.token_amount ?? body.amount ?? null,
        usd_value: body.usd_value ?? null,
        transaction_signature: body.transaction_signature ?? null,
        network: body.network || 'solana',
        user_agent: body.user_agent || '',
        referral_code: body.referral_code || null,
      };

      try {
        const url = new URL('/api/coincarnation/record', req.url);
        const proxied = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        });

        const data = await proxied.json();
        return NextResponse.json(data, { status: proxied.status });
      } catch (e: any) {
        console.error('❌ Proxy to /api/coincarnation/record failed:', e?.message || e);
        // Proxy hata verirse legacy OK döndürmeyelim:
        return NextResponse.json(
          { success: false, error: 'proxy_failed' },
          { status: 502 }
        );
      }
    }

    // Aksi halde: mevcut CoincarneForm minimal payload’ı (wallet/token/amount/number/timestamp)
    // Üretimde kırmamak için success: true döndürmeye devam edelim.
    console.warn('ℹ️ /api/record received legacy payload. Consider migrating client to /api/coincarnation/record.');
    return NextResponse.json({
      success: true,
      legacy: true,
      note: 'Legacy endpoint: migrate to /api/coincarnation/record when possible.',
    });
  } catch (err) {
    console.error('❌ Failed to process /api/record:', err);
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
