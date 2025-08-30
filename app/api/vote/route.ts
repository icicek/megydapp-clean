// app/api/vote/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { cache, statusKey } from '@/app/api/_lib/cache';
import { setStatus as upsertTokenStatus } from '@/app/api/_lib/token-registry';
import { getVoteThreshold } from '@/app/api/_lib/settings';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

function buildMessage(mint: string, wallet: string, ts: number) {
  return `coincarnation:vote:deadcoin\nmint:${mint}\nwallet:${wallet}\nts:${ts}`;
}
function verifySig(wallet: string, message: string, signature: string) {
  try {
    const pub = bs58.decode(wallet);
    const sig = bs58.decode(signature);
    const bytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(bytes, sig, pub);
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, voterWallet, voteYes, ts, message, signature } = body || {};
    if (!mint || !voterWallet || typeof voteYes !== 'boolean' || !ts || !message || !signature) {
      return NextResponse.json({ success: false, error: 'mint, voterWallet, voteYes, ts, message, signature are required' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || '';
    const allow = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    if (allow.length && !allow.some(a => origin.startsWith(a))) {
      return NextResponse.json({ success: false, error: 'Origin not allowed' }, { status: 403 });
    }

    const expected = buildMessage(mint, voterWallet, Number(ts));
    if (message !== expected) return NextResponse.json({ success: false, error: 'Malformed message' }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) return NextResponse.json({ success: false, error: 'Stale timestamp' }, { status: 400 });
    if (!verifySig(voterWallet, message, signature)) return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });

    await sql`
      INSERT INTO deadcoin_votes (mint, wallet_address, vote_yes)
      VALUES (${mint}, ${voterWallet}, ${voteYes})
      ON CONFLICT (mint, wallet_address) DO UPDATE
      SET vote_yes = EXCLUDED.vote_yes, updated_at = NOW()
    `;

    const yesRows = await sql`
      SELECT COUNT(*)::int AS c
      FROM deadcoin_votes
      WHERE mint = ${mint} AND vote_yes = TRUE
    ` as unknown as { c: number }[];
    const yesCount = yesRows[0]?.c ?? 0;

    // 🔥 Canlı eşik (cache’li; DB yoksa ENV → 3)
    const threshold = await getVoteThreshold();

    let applied = false;
    if (yesCount >= threshold) {
      await upsertTokenStatus({
        mint,
        newStatus: 'deadcoin',
        changedBy: 'auto_vote',
        reason: 'community_threshold',
        meta: { source: 'votes', yesCount, threshold },
      });
      try { cache.del(statusKey(mint)); } catch {}
      applied = true;
    }

    return NextResponse.json({
      success: true,
      votesYes: yesCount,
      threshold,
      applied,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
