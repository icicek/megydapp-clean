//app/api/admin/treasury/overview/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { getServerSolanaConnection } from '@/app/api/_lib/solana/serverRpc';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TreasuryAsset = {
  mint: string;
  amount: string;
  decimals: number;
  tokenAccounts: number;
  program: 'spl-token' | 'token-2022';
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const treasuryAddress =
      process.env.COINCARNE_TREASURY_SOL?.trim();

    if (!treasuryAddress) {
      return NextResponse.json(
        { success: false, error: 'Treasury address not configured' },
        { status: 500 }
      );
    }

    const owner = new PublicKey(treasuryAddress);
    const connection = getServerSolanaConnection();

    const [solBalance, standardTokens, token2022] =
      await Promise.all([
        connection.getBalance(owner),
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);

    const grouped = new Map<string, TreasuryAsset>();

    function collect(
      accounts: typeof standardTokens.value,
      program: 'spl-token' | 'token-2022'
    ) {
      for (const account of accounts) {
        const info = account.account.data.parsed?.info;
        if (!info) continue;

        const mint = String(info.mint || '');
        const tokenAmount = info.tokenAmount;

        if (!mint || !tokenAmount) continue;

        const rawAmount = BigInt(tokenAmount.amount || '0');
        if (rawAmount <= 0n) continue;

        const key = `${program}:${mint}`;
        const existing = grouped.get(key);

        if (existing) {
          existing.amount = (
            BigInt(existing.amount) + rawAmount
          ).toString();
          existing.tokenAccounts += 1;
        } else {
          grouped.set(key, {
            mint,
            amount: rawAmount.toString(),
            decimals: Number(tokenAmount.decimals || 0),
            tokenAccounts: 1,
            program,
          });
        }
      }
    }

    collect(standardTokens.value, 'spl-token');
    collect(token2022.value, 'token-2022');

    const assets = [...grouped.values()].sort((a, b) =>
      a.mint.localeCompare(b.mint)
    );

    return NextResponse.json({
      success: true,
      treasury: treasuryAddress,
      solLamports: solBalance.toString(),
      assets,
      totalAssets: assets.length,
      scannedAt: new Date().toISOString(),
      mode: 'read-only',
    });
  } catch (e: unknown) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
