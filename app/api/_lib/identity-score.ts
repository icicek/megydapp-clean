//app/api/_lib/identity-score.ts
import { sql } from '@/app/api/_lib/db';

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function recalculateIdentityScores(identityId: string) {
  const id = String(identityId || '').trim();

  if (!id) {
    return {
      ok: false,
      humanConfidenceScore: 0,
      riskScore: 0,
      error: 'IDENTITY_ID_REQUIRED',
    };
  }

  const [walletRows, fingerprintRows, socialRows, contributionRows, refundRows, identityRows] =
    await Promise.all([
      sql`
        SELECT COUNT(*)::int AS count
        FROM identity_wallets
        WHERE identity_id = ${id}
          AND chain = 'solana'
          AND verified_at IS NOT NULL
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM identity_fingerprints
        WHERE identity_id = ${id}
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM identity_socials
        WHERE identity_id = ${id}
          AND verified_at IS NOT NULL
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM contributions c
        JOIN identity_wallets iw
          ON LOWER(iw.wallet_address) = LOWER(c.wallet_address)
        WHERE iw.identity_id = ${id}
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM contribution_invalidations ci
        JOIN identity_wallets iw
          ON LOWER(iw.wallet_address) = LOWER(ci.wallet_address)
        WHERE iw.identity_id = ${id}
          AND ci.refund_status IN ('requested', 'refunded')
      `,

      sql`
        SELECT created_at
        FROM identities
        WHERE id = ${id}
        LIMIT 1
      `,
    ]);

  const walletCount = Number(walletRows?.[0]?.count || 0);
  const fingerprintCount = Number(fingerprintRows?.[0]?.count || 0);
  const socialCount = Number(socialRows?.[0]?.count || 0);
  const contributionCount = Number(contributionRows?.[0]?.count || 0);
  const refundCount = Number(refundRows?.[0]?.count || 0);

  const createdAt = identityRows?.[0]?.created_at
    ? new Date(identityRows[0].created_at)
    : null;

  const ageMs = createdAt ? Date.now() - createdAt.getTime() : 0;
  const ageDays = ageMs > 0 ? ageMs / (1000 * 60 * 60 * 24) : 0;

  let humanConfidenceScore = 0;
  let riskScore = 0;

  // Human confidence signals
  if (walletCount >= 1) humanConfidenceScore += 25;
  if (fingerprintCount >= 1) humanConfidenceScore += 10;
  if (contributionCount >= 1) humanConfidenceScore += 10;
  if (ageDays >= 7) humanConfidenceScore += 10;
  if (walletCount >= 2 && walletCount <= 5) humanConfidenceScore += 15;
  if (socialCount >= 1) humanConfidenceScore += 20;

  // Risk signals
  if (walletCount > 10) riskScore += 20;
  if (refundCount >= 3) riskScore += 15;
  if (refundCount >= 5) riskScore += 10;
  if (ageDays > 0 && ageDays < 0.01 && contributionCount >= 3) riskScore += 20;

  const sharedFingerprintRows = await sql`
    SELECT COUNT(DISTINCT other.identity_id)::int AS count
    FROM identity_fingerprints mine
    JOIN identity_fingerprints other
      ON other.fingerprint_hash = mine.fingerprint_hash
    WHERE mine.identity_id = ${id}
      AND other.identity_id <> ${id}
  `;

  const sharedFingerprintIdentityCount = Number(sharedFingerprintRows?.[0]?.count || 0);

  if (sharedFingerprintIdentityCount >= 2) riskScore += 20;
  if (sharedFingerprintIdentityCount >= 5) riskScore += 20;

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
    ok: true,
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