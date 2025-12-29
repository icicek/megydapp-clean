// app/api/vote/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { cache, statusKey } from '@/app/api/_lib/cache';
import {
  setStatus as upsertTokenStatus,
  getStatus as getTokenStatus,
} from '@/app/api/_lib/token-registry';
import { getVoteThreshold } from '@/app/api/_lib/settings';

import { getStatusRow, resolveEffectiveStatus } from '@/app/api/_lib/registry';
import type { TokenStatus } from '@/app/api/_lib/types';
import { getTokenThresholds } from '@/app/api/_lib/token-thresholds';
import classifyToken from '@/app/api/utils/classifyToken';

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
  } catch {
    return false;
  }
}

/**
 * If status is deadcoin AND it is locked by admin/community,
 * voting should NOT rewrite it (idempotent).
 *
 * Supports legacy + new meta shapes:
 * - meta.lock_deadcoin === true
 * - meta.lock.deadcoin === true
 * - meta.source === 'community' | 'admin'
 */
function isLockedDeadcoinStatus(s: any): boolean {
  if (s?.status !== 'deadcoin') return false;
  const m = s?.meta ?? {};
  const source = m?.source ?? null;
  return (
    m?.lock_deadcoin === true ||
    m?.lock?.deadcoin === true ||
    source === 'community' ||
    source === 'admin'
  );
}

function parseAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// registry.meta içinden source seçimi (status resolver ile uyumlu)
function pickRegistrySource(row: any): string | null {
  const meta = row?.meta;
  if (meta && typeof meta === 'object') {
    const src = (meta as any).source;
    if (typeof src === 'string') return src;
  }
  return row?.updated_by ?? row?.reason ?? null;
}

/**
 * Yeni mimariye göre: bu mint için voteEligible mı?
 * - registry + metrics + thresholds + resolveEffectiveStatus
 */
async function computeVoteEligibility(mint: string): Promise<{
  status: TokenStatus;
  decision: {
    zone: 'healthy' | 'wd_gray' | 'wd_vote' | 'deadzone';
    highLiq: boolean;
    voteEligible: boolean;
  };
}> {
  // 1) Registry snapshot
  const row = await getStatusRow(mint);
  const registryStatus = (row?.status ?? null) as TokenStatus | null;
  const registrySource = pickRegistrySource(row);

  // 2) Thresholds
  const thresholds = await getTokenThresholds();

  // 3) Metrics + USD (classifyToken)
  const cls = await classifyToken({ mint }, 1);

  const metricsCategory =
    cls.category === 'healthy' ||
    cls.category === 'walking_dead' ||
    cls.category === 'deadcoin'
      ? cls.category
      : null;

  const usdValue = Number(cls.usdValue ?? 0) || 0;
  const liquidityUSD = Number(cls.liquidity ?? 0) || 0;
  const volumeUSD = Number(cls.volume ?? 0) || 0;

  // 4) Effective decision → resolveEffectiveStatus zaten { status, decision } dönüyor
  const resolved = resolveEffectiveStatus({
    registryStatus,
    registrySource,
    metricsCategory,
    usdValue,
    liquidityUSD,
    volumeUSD,
    thresholds,
  });

  const status = (resolved as any).status as TokenStatus;
  const decision = (resolved as any).decision ?? {
    zone: 'wd_gray' as const,
    highLiq: false,
    voteEligible: false,
  };

  return { status, decision };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, voterWallet, voteYes, ts, message, signature } = body || {};

    if (
      !mint ||
      !voterWallet ||
      typeof voteYes !== 'boolean' ||
      !ts ||
      !message ||
      !signature
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'mint, voterWallet, voteYes, ts, message, signature are required',
        },
        { status: 400 },
      );
    }

    // ✅ Origin allowlist (existing guard)
    const origin = req.headers.get('origin') || '';
    const allow = parseAllowedOrigins();
    if (allow.length && !allow.some((a) => origin.startsWith(a))) {
      return NextResponse.json(
        { success: false, error: 'Origin not allowed' },
        { status: 403 },
      );
    }

    // ✅ Signature verification (existing guard)
    const expected = buildMessage(mint, voterWallet, Number(ts));
    if (message !== expected) {
      return NextResponse.json(
        { success: false, error: 'Malformed message' },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) {
      return NextResponse.json(
        { success: false, error: 'Stale timestamp' },
        { status: 400 },
      );
    }

    if (!verifySig(voterWallet, message, signature)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // ✅ Yeni: vote eligibility kontrolü
    let eligibility;
    try {
      eligibility = await computeVoteEligibility(mint);
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error: 'vote_eligibility_unavailable',
          detail: err?.message || null,
        },
        { status: 503 },
      );
    }

    if (!eligibility.decision.voteEligible) {
      return NextResponse.json(
        {
          success: false,
          error: 'vote_not_eligible',
          status: eligibility.status,
          decision: eligibility.decision,
        },
        { status: 409 },
      );
    }

    // ✅ Upsert vote (supports changing YES/NO)
    await sql`
      INSERT INTO deadcoin_votes (mint, wallet_address, vote_yes)
      VALUES (${mint}, ${voterWallet}, ${voteYes})
      ON CONFLICT (mint, wallet_address) DO UPDATE
      SET vote_yes = EXCLUDED.vote_yes, updated_at = NOW()
    `;

    // ✅ Count YES votes (live)
    const yesRows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM deadcoin_votes
      WHERE mint = ${mint} AND vote_yes = TRUE
    `) as unknown as { c: number }[];
    const yesCount = yesRows[0]?.c ?? 0;

    // ✅ Live threshold (DB->cache->ENV default)
    const threshold = await getVoteThreshold();

    // ✅ Registry guard (do not override blacklist/redlist)
    const current = await getTokenStatus(mint); // { status, meta, ... }
    if (current?.status === 'blacklist' || current?.status === 'redlist') {
      return NextResponse.json({
        success: true,
        votesYes: yesCount,
        threshold,
        applied: false,
        blocked: true,
        blockedBy: current.status,
      });
    }

    let applied = false;

    // ✅ Apply only when threshold reached
    if (yesCount >= threshold) {
      // ✅ If already a locked deadcoin, do nothing (idempotent)
      if (!isLockedDeadcoinStatus(current)) {
        await upsertTokenStatus({
          mint,
          newStatus: 'deadcoin',
          changedBy: 'community',
          reason: 'community_threshold',
          meta: {
            // 🔑 used by resolveEffectiveStatus / UI
            source: 'community',
            lock_deadcoin: true,
            lock_reason: 'community_threshold',

            // debug / transparency
            yesCount,
            threshold,
            appliedAt: new Date().toISOString(),
          },
        });

        // invalidate /api/status cache
        try {
          cache.del(statusKey(mint));
        } catch {}
      }
      applied = true;
    }

    return NextResponse.json({
      success: true,
      votesYes: yesCount,
      threshold,
      applied,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
