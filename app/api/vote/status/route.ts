// app/api/vote/status/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { getVoteThreshold } from '@/app/api/_lib/settings';
import { getStatus as getTokenStatus } from '@/app/api/_lib/token-registry';
import { requireIdentityWalletAccess } from '@/app/api/_lib/identity-guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const mint = String(searchParams.get('mint') || '').trim();
    const wallet = String(searchParams.get('wallet') || '').trim();

    if (!mint) {
      return NextResponse.json(
        { success: false, error: 'mint_required' },
        { status: 400 }
      );
    }

    const threshold = await getVoteThreshold();
    const current = await getTokenStatus(mint);

    const yesRows = (await sql`
      SELECT COUNT(DISTINCT identity_scope)::int AS c
      FROM deadcoin_votes
      WHERE mint = ${mint}
        AND vote_yes = TRUE
        AND identity_scope IS NOT NULL
    `) as unknown as { c: number }[];

    const votesYes = Number(yesRows?.[0]?.c ?? 0);

    let alreadyVoted = false;
    let myVote: boolean | null = null;
    let identityScope: string | null = null;

    if (wallet) {
      const identityGuard = await requireIdentityWalletAccess(wallet);

      if (identityGuard.ok) {
        identityScope = `identity:${identityGuard.identityId}`;

        const voteRows = (await sql`
          SELECT vote_yes
          FROM deadcoin_votes
          WHERE mint = ${mint}
            AND identity_scope = ${identityScope}
          LIMIT 1
        `) as unknown as { vote_yes: boolean }[];

        if (voteRows.length > 0) {
          alreadyVoted = true;
          myVote = Boolean(voteRows[0].vote_yes);
        }
      }
    }

    return NextResponse.json({
      success: true,
      mint,
      status: current?.status ?? null,
      blocked:
        current?.status === 'blacklist' ||
        current?.status === 'redlist',
      blockedBy:
        current?.status === 'blacklist' || current?.status === 'redlist'
          ? current.status
          : null,
      applied: current?.status === 'deadcoin',
      votesYes,
      threshold,
      alreadyVoted,
      myVote,
      identityScope,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}