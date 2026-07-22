// app/api/_lib/identity-config.ts

export const IDENTITY_RISK_BLOCK_THRESHOLD = 50;

export const IDENTITY_SCORE_WEIGHTS = {
  humanConfidence: {
    verifiedWallet: 25,
    additionalVerifiedWallets: 15,
    fingerprint: 10,
    contribution: 15,
    verifiedSocial: 25,
    establishedIdentity: 10,
  },

  risk: {
    sharedFingerprint: 15,
    heavilySharedFingerprint: 15,
  },
} as const;

export const IDENTITY_SCORE_THRESHOLDS = {
  additionalVerifiedWallets: 2,
  establishedIdentityAgeDays: 7,
  sharedFingerprintIdentities: 2,
  heavilySharedFingerprintIdentities: 5,
} as const;