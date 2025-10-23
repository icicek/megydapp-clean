// app/api/tokenmeta/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Metaplex Token Metadata Program ID (sabit, resmi):
// https://docs.metaplex.com/programs/token-metadata/addresses
const METAPLEX_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

// PDA: metadata account
function getMetadataPda(mint: PublicKey): PublicKey {
  const seeds = [
    Buffer.from('metadata'),
    METAPLEX_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ];
  const [pda] = PublicKey.findProgramAddressSync(seeds, METAPLEX_PROGRAM_ID);
  return pda;
}

// Küçük yardımcılar
function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintStr = searchParams.get('mint');
    const cluster = (searchParams.get('cluster') || 'mainnet-beta') as
      | 'mainnet-beta'
      | 'devnet';

    if (!mintStr) {
      return NextResponse.json({ ok: false, error: 'Missing ?mint=' }, { status: 400 });
    }

    const endpoint =
      cluster === 'devnet'
        ? 'https://api.devnet.solana.com'
        : process.env.SOLANA_RPC ||
          process.env.NEXT_PUBLIC_SOLANA_RPC ||
          clusterApiUrl('mainnet-beta');

    const conn = new Connection(endpoint, 'confirmed');
    const mint = new PublicKey(mintStr);

    let name: string | null = null;
    let symbol: string | null = null;
    let source: 'token-2022' | 'metaplex' | 'none' = 'none';

    // ---- PATH A: SPL Token-2022 Metadata Extension (varsa)
    try {
      // Dinamik import: derleyici şikayet etmez, yoksa da patlatmayız.
      const mod: any = await import('@solana/spl-token-metadata').catch(() => null);
      if (mod?.getTokenMetadata) {
        const ext = await mod.getTokenMetadata(conn, mint).catch(() => null);
        if (ext) {
          name = tidy(ext.name) ?? name;
          symbol = tidy(ext.symbol) ?? symbol;
          if (name || symbol) source = 'token-2022';
        }
      }
    } catch {
      // extension yoksa sorun değil; Metaplex'e geçeceğiz
    }

    // ---- PATH B: Metaplex Token Metadata PDA (en yaygın yol)
    if (!name || !symbol) {
      try {
        const pda = getMetadataPda(mint);
        const acc = await conn.getAccountInfo(pda, 'confirmed');
        if (acc?.data) {
          // Dinamik import (tip güvenli değilse 'any' ile kullan)
          const mdMod: any = await import('@metaplex-foundation/mpl-token-metadata').catch(() => null);
          if (mdMod?.Metadata?.deserialize) {
            const [md] = mdMod.Metadata.deserialize(acc.data);
            const n = tidy(md?.data?.name);
            const s = tidy(md?.data?.symbol);
            if (n) name = n;
            if (s) symbol = s;
            if (name || symbol) source = 'metaplex';
          } else {
            // Kütüphane yüklenemediyse kaba bir UTF-8 taraması (son çare)
            const first = acc.data.subarray(0, 1024).toString('utf8');
            // Çok kaba bir yakalama; yine de sembol bazen net çıkar
            const guessSymbol = tidy((first.match(/[A-Z0-9]{2,10}/)?.[0]) || null);
            if (guessSymbol && !symbol) {
              symbol = guessSymbol;
              source = 'metaplex';
            }
          }
        }
      } catch {
        // metaplex PDA yoksa/bozuksa da sorun değil
      }
    }

    name = tidy(name);
    symbol = tidy(symbol);

    return NextResponse.json({
      ok: Boolean(name || symbol),
      name,
      symbol,
      source,
      cluster,
      mint: mintStr,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
