// app/api/_lib/identity-score.ts

import { sql } from '@/app/api/_lib/db';
import {
  IDENTITY_SCORE_THRESHOLDS,
  IDENTITY_SCORE_WEIGHTS,
} from '@/app/api/_lib/identity-config';

type CountRow = {
  count: number | string | null;
};

type IdentityRow = {
  created_at: string | Date | null;
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function readCount(rows: unknown): number {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }

  const count = Number((rows[0] as CountRow)?.count ?? 0);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.floor(count);
}

function getIdentityAgeDays(createdAt: unknown): number {
  if (!createdAt) {
    return 0;
  }

  const createdAtDate = new Date(createdAt as string | Date);
  const createdAtTimestamp = createdAtDate.getTime();

  if (!Number.isFinite(createdAtTimestamp)) {
    return 0;
  }

  const ageMs = Date.now() - createdAtTimestamp;

  if (ageMs <= 0) {
    return 0;
  }

  return ageMs / (1000 * 60 * 60 * 24);
}

export async function recalculateIdentityScores(identityId: string) {
  const id = String(identityId || '').trim();

  if (!id) {
    return {
      ok: false as const,
      humanConfidenceScore: 0,
      riskScore: 0,
      error: 'IDENTITY_ID_REQUIRED',
    };
  }

  /*
   * Read the Identity first.
   *
   * This prevents the function from silently returning ok: true for an
   * Identity that does not exist.
   */
  const identityRows = (await sql`
    SELECT created_at
    FROM identities
    WHERE id = ${id}
    LIMIT 1
  `) as unknown as IdentityRow[];

  if (!identityRows?.length) {
    return {
      ok: false as const,
      humanConfidenceScore: 0,
      riskScore: 0,
      error: 'IDENTITY_NOT_FOUND',
    };
  }

  const [
    walletRows,
    fingerprintRows,
    socialRows,
    contributionRows,
    refundRows,
    sharedFingerprintRows,
  ] = await Promise.all([
    /*
     * Only verified Solana wallets contribute to Identity confidence.
     */
    sql`
      SELECT COUNT(*)::int AS count
      FROM identity_wallets
      WHERE identity_id = ${id}
        AND chain = 'solana'
        AND verified_at IS NOT NULL
    `,

    /*
     * Count distinct fingerprints rather than raw database rows.
     */
    sql`
      SELECT COUNT(DISTINCT fingerprint_hash)::int AS count
      FROM identity_fingerprints
      WHERE identity_id = ${id}
    `,

    sql`
      SELECT COUNT(*)::int AS count
      FROM identity_socials
      WHERE identity_id = ${id}
        AND verified_at IS NOT NULL
    `,

    /*
     * Contributions are counted only when they belong to a verified Solana
     * wallet linked to this Identity.
     *
     * EXISTS avoids accidental count multiplication caused by joins.
     */
    sql`
      SELECT COUNT(*)::int AS count
      FROM contributions c
      WHERE EXISTS (
        SELECT 1
        FROM identity_wallets iw
        WHERE iw.identity_id = ${id}
          AND iw.chain = 'solana'
          AND iw.verified_at IS NOT NULL
          AND iw.wallet_address = c.wallet_address
      )
    `,

    /*
     * Refund data remains available as an observable signal, but legitimate
     * refund activity does not increase Identity risk.
     */
    sql`
      SELECT COUNT(*)::int AS count
      FROM contribution_invalidations ci
      WHERE ci.refund_status IN ('requested', 'refunded')
        AND EXISTS (
          SELECT 1
          FROM identity_wallets iw
          WHERE iw.identity_id = ${id}
            AND iw.chain = 'solana'
            AND iw.verified_at IS NOT NULL
            AND iw.wallet_address = ci.wallet_address
        )
    `,

    /*
     * Fingerprints are soft risk signals, not proof of duplicate identity.
     *
     * Count how many other Identities share at least one fingerprint with
     * this Identity.
     */
    sql`
      SELECT COUNT(DISTINCT other.identity_id)::int AS count
      FROM identity_fingerprints mine
      JOIN identity_fingerprints other
        ON other.fingerprint_hash = mine.fingerprint_hash
      WHERE mine.identity_id = ${id}
        AND other.identity_id <> ${id}
    `,
  ]);

  const walletCount = readCount(walletRows);
  const fingerprintCount = readCount(fingerprintRows);
  const socialCount = readCount(socialRows);
  const contributionCount = readCount(contributionRows);
  const refundCount = readCount(refundRows);
  const sharedFingerprintIdentityCount = readCount(sharedFingerprintRows);

  const ageDays = getIdentityAgeDays(identityRows[0]?.created_at);

  let humanConfidenceScore = 0;
  let riskScore = 0;

  /*
   * Human Confidence
   *
   * Multiple verified wallets strengthen the Identity graph. Wallet volume
   * is not treated as suspicious because Coincarnation intentionally unifies
   * multiple wallets under one Identity.
   */
  if (walletCount >= 1) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.verifiedWallet;
  }

  if (
    walletCount >=
    IDENTITY_SCORE_THRESHOLDS.additionalVerifiedWallets
  ) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.additionalVerifiedWallets;
  }

  if (fingerprintCount >= 1) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.fingerprint;
  }

  if (contributionCount >= 1) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.contribution;
  }

  if (socialCount >= 1) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.verifiedSocial;
  }

  if (
    ageDays >=
    IDENTITY_SCORE_THRESHOLDS.establishedIdentityAgeDays
  ) {
    humanConfidenceScore +=
      IDENTITY_SCORE_WEIGHTS.humanConfidence.establishedIdentity;
  }

  /*
   * Risk
   *
   * Fast participation, high contribution volume, multiple wallets and
   * legitimate refunds are intentionally not treated as risk signals.
   *
   * Shared fingerprints remain a measured, non-conclusive indicator.
   */
  if (
    sharedFingerprintIdentityCount >=
    IDENTITY_SCORE_THRESHOLDS.sharedFingerprintIdentities
  ) {
    riskScore +=
      IDENTITY_SCORE_WEIGHTS.risk.sharedFingerprint;
  }

  if (
    sharedFingerprintIdentityCount >=
    IDENTITY_SCORE_THRESHOLDS.heavilySharedFingerprintIdentities
  ) {
    riskScore +=
      IDENTITY_SCORE_WEIGHTS.risk.heavilySharedFingerprint;
  }

  humanConfidenceScore = clampScore(humanConfidenceScore);
  riskScore = clampScore(riskScore);

  await sql`
    UPDATE identities
    SET
      human_confidence_score = ${humanConfidenceScore},
      risk_score = ${riskScore},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return {
    ok: true as const,
    identityId: id,
    humanConfidenceScore,
    riskScore,
    signals: {
      walletCount,
      fingerprintCount,
      socialCount,
      contributionCount,
      refundCount,
      ageDays,
      sharedFingerprintIdentityCount,
    },
  };
}