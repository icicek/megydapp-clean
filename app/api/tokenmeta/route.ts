// app/api/tokenmeta/route.ts
import { NextResponse } from 'next/server';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import {
  findMetadataPda,
  fetchMetadata,
} from '@metaplex-foundation/mpl-token-metadata';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mint = searchParams.get('mint');
    const cluster = searchParams.get('cluster') || 'mainnet-beta';

    if (!mint) {
      return NextResponse.json(
        { ok: false, error: 'Missing ?mint=<address>' },
        { status: 400 }
      );
    }

    const endpoint =
      cluster === 'devnet'
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';

    const umi = createUmi(endpoint);
    const mintPk = umiPublicKey(mint);

    const metadataPda = findMetadataPda(umi, { mint: mintPk });
    const metadata = await fetchMetadata(umi, metadataPda);

    // Umi: fields are top-level (not metadata.data.*)
    const name = (metadata.name ?? '').trim();
    const symbol = (metadata.symbol ?? '').trim();
    const uri = (metadata.uri ?? '').trim();

    let json: any = null;
    if (uri && /^https?:\/\//i.test(uri)) {
      try {
        const res = await fetch(uri, { cache: 'no-store' });
        if (res.ok) {
          json = await res.json();
        }
      } catch {
        json = null;
      }
    }

    return NextResponse.json({
      ok: true,
      mint,
      cluster,
      name,
      symbol,
      uri,
      onchain: metadata,
      json,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
