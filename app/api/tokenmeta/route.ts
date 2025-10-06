// app/api/tokenmeta/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { PROGRAM_ID as METADATA_PROGRAM_ID, Metadata } from '@metaplex-foundation/mpl-token-metadata';

export const revalidate = 0;                 // Next cache kapalı
export const dynamic = 'force-dynamic';

type MetaOut = { symbol: string; name: string; uri?: string };

let MEMO: Record<string, MetaOut> = {};
let LAST_CLEAN = Date.now();

function getConnection() {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || clusterApiUrl('mainnet-beta');
  return new Connection(endpoint, 'confirmed');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintParam = searchParams.get('mints');
    if (!mintParam) return NextResponse.json({ success: false, error: 'mints required' }, { status: 400 });

    // mints virgülle ayrılsın, whitespace temizle
    const mints = mintParam.split(',').map(s => s.trim()).filter(Boolean);
    const uncached = mints.filter(m => !MEMO[m]);

    if (uncached.length) {
      const conn = getConnection();
      const pdas = uncached.map(m => {
        const mintKey = new PublicKey(m);
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
          METADATA_PROGRAM_ID
        );
        return pda;
      });

      const infos = await conn.getMultipleAccountsInfo(pdas);
      for (let i = 0; i < infos.length; i++) {
        const info = infos[i];
        const mint = uncached[i];
        if (!info?.data) continue;
        try {
          const [meta] = Metadata.deserialize(info.data);
          // Metaplex v1 alanları
          const name = (meta.data.name || '').trim().replace(/\0+$/, '');
          const symbol = (meta.data.symbol || '').trim().replace(/\0+$/, '');
          const uri = (meta.data.uri || '').trim().replace(/\0+$/, '');
          if (symbol) MEMO[mint] = { symbol, name: name || symbol, uri };
        } catch {
          // parse edemediysek boş bırak
        }
      }

      // basit hafıza temizliği (24 saat)
      const now = Date.now();
      if (now - LAST_CLEAN > 24 * 60 * 60 * 1000) {
        MEMO = {};
        LAST_CLEAN = now;
      }
    }

    const out: Record<string, MetaOut | null> = {};
    for (const m of mints) out[m] = MEMO[m] || null;

    return NextResponse.json({ success: true, data: out });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
