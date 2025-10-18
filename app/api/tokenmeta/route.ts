// app/api/tokenmeta/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { PROGRAM_ID as METADATA_PROGRAM_ID, Metadata } from '@metaplex-foundation/mpl-token-metadata';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

type MetaOut = { symbol: string; name: string; uri?: string };

let MEMO: Record<string, MetaOut> = {};
let LAST_CLEAN = Date.now();

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function getConnection() {
  // Sizin ortam değişkenlerinizle uyumlu genişletilmiş fallback sırası:
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || // sizde bu var
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || // sizde bu da var
    process.env.SOLANA_RPC?.trim() ||
    process.env.ALCHEMY_SOLANA_RPC?.trim() ||
    clusterApiUrl('mainnet-beta');
  return new Connection(endpoint, 'confirmed');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintParam = searchParams.get('mints');
    if (!mintParam) {
      // 400 yerine yumuşatılmış 200 + açıklama isterseniz, aşağıyı 200 yapabilirsiniz.
      return NextResponse.json({ success: false, error: 'mints required' }, { status: 400 });
    }

    // mints virgülle ayrılır; whitespace temizle
    const rawMints = mintParam.split(',').map(s => s.trim()).filter(Boolean);

    // SOL → WSOL normalize + geçersiz PublicKey guard
    const normalized: string[] = [];
    for (const m of rawMints) {
      const mint = m.toUpperCase() === 'SOL' ? WSOL_MINT : m;
      try {
        // Geçersiz mint'leri direkt atla (500 yerine data: null döneceğiz)
        new PublicKey(mint);
        normalized.push(mint);
      } catch {
        // Geçersizse normalized'a eklemiyoruz; aşağıda null döneceğiz
      }
    }

    const uncached = normalized.filter(m => !MEMO[m]);

    if (uncached.length) {
      const conn = getConnection();

      // PDA adreslerini güvenli şekilde üret
      const pdas: PublicKey[] = uncached.map(m => {
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
          const name = (meta.data.name || '').trim().replace(/\0+$/, '');
          const symbol = (meta.data.symbol || '').trim().replace(/\0+$/, '');
          const uri = (meta.data.uri || '').trim().replace(/\0+$/, '');
          if (symbol) {
            MEMO[mint] = { symbol, name: name || symbol, uri };
          } else {
            // Metadata var ama symbol yoksa yine de en azından name ile dolduralım
            MEMO[mint] = { symbol: '', name: name || '', uri };
          }
        } catch {
          // parse edilemediyse cache'e yazma; data[mint] null döneriz
        }
      }

      // basit hafıza temizliği (24 saat)
      const now = Date.now();
      if (now - LAST_CLEAN > 24 * 60 * 60 * 1000) {
        MEMO = {};
        LAST_CLEAN = now;
      }
    }

    // Çıkış; geçersiz/parse edilemeyen mint'ler için null
    const out: Record<string, MetaOut | null> = {};
    for (const m of rawMints) {
      const key = m.toUpperCase() === 'SOL' ? WSOL_MINT : m;
      out[m] = MEMO[key] || null;
    }

    return NextResponse.json({ success: true, data: out });
  } catch (e: any) {
    // Beklenmeyen durumda bile anlaşılır mesaj verelim
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
