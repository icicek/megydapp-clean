// app/api/_lib/user-auth.ts

import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';

export const USER_AUTH_COOKIE = 'coincarnation_user';

const USER_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const CLOCK_TOLERANCE_SECONDS = 5 * 60;

type UserSessionHeader = {
  alg: 'HS256';
  typ: 'JWT';
};

export type UserSessionPayload = {
  identityId: string;
  walletAddress: string;
  iat: number;
  exp: number;
};

function getUserSessionSecret(): string {
  const secret = process.env.USER_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error('Missing env: USER_SESSION_SECRET');
  }

  return secret;
}

function normalizeWalletAddress(walletAddress: string): string {
  const value = walletAddress.trim();

  if (!value) {
    throw new Error('Invalid wallet address.');
  }

  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error('Invalid wallet address.');
  }
}

function encodeBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function createSessionSignature(
  data: string,
  secret: string
): Buffer {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();
}

function isValidSessionHeader(
  value: unknown
): value is UserSessionHeader {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const header = value as Record<string, unknown>;

  return header.alg === 'HS256' && header.typ === 'JWT';
}

function isValidSessionPayload(
  value: unknown
): value is UserSessionPayload {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.identityId === 'string' &&
    payload.identityId.trim().length > 0 &&
    typeof payload.walletAddress === 'string' &&
    payload.walletAddress.trim().length > 0 &&
    typeof payload.iat === 'number' &&
    Number.isInteger(payload.iat) &&
    typeof payload.exp === 'number' &&
    Number.isInteger(payload.exp)
  );
}

function signaturesMatch(
  receivedSignature: Buffer,
  expectedSignature: Buffer
): boolean {
  if (
    receivedSignature.length === 0 ||
    receivedSignature.length !== expectedSignature.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedSignature,
    expectedSignature
  );
}

export function buildUserAuthMessage(
  walletAddress: string,
  nonce: string
): string {
  const canonicalWalletAddress =
    normalizeWalletAddress(walletAddress);

  const normalizedNonce = nonce.trim();

  if (!normalizedNonce) {
    throw new Error('Invalid nonce.');
  }

  return [
    'Coincarnation Identity Verification',
    '',
    `Wallet: ${canonicalWalletAddress}`,
    `Nonce: ${normalizedNonce}`,
    'Purpose: user_auth',
    '',
    'This signature does not authorize a transaction or move funds.',
  ].join('\n');
}

export function createUserNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function signUserSession(payload: {
  identityId: string;
  walletAddress: string;
}): string {
  const identityId = payload.identityId.trim();

  if (!identityId) {
    throw new Error('Invalid Identity ID.');
  }

  const walletAddress =
    normalizeWalletAddress(payload.walletAddress);

  const secret = getUserSessionSecret();
  const now = Math.floor(Date.now() / 1000);

  const header: UserSessionHeader = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const fullPayload: UserSessionPayload = {
    identityId,
    walletAddress,
    iat: now,
    exp: now + USER_SESSION_DURATION_SECONDS,
  };

  const encodedHeader = encodeBase64Url(
    JSON.stringify(header)
  );

  const encodedPayload = encodeBase64Url(
    JSON.stringify(fullPayload)
  );

  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createSessionSignature(data, secret);

  return `${data}.${encodeBase64Url(signature)}`;
}

export function verifyUserSession(
  token: string
): UserSessionPayload | null {
  try {
    const secret = getUserSessionSecret();
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const [
      encodedHeader,
      encodedPayload,
      encodedSignature,
    ] = parts;

    if (
      !encodedHeader ||
      !encodedPayload ||
      !encodedSignature
    ) {
      return null;
    }

    const data = `${encodedHeader}.${encodedPayload}`;

    const receivedSignature =
      decodeBase64Url(encodedSignature);

    const expectedSignature =
      createSessionSignature(data, secret);

    if (
      !signaturesMatch(
        receivedSignature,
        expectedSignature
      )
    ) {
      return null;
    }

    const header = JSON.parse(
      decodeBase64Url(encodedHeader).toString('utf8')
    ) as unknown;

    if (!isValidSessionHeader(header)) {
      return null;
    }

    const payload = JSON.parse(
      decodeBase64Url(encodedPayload).toString('utf8')
    ) as unknown;

    if (!isValidSessionPayload(payload)) {
      return null;
    }

    const identityId = payload.identityId.trim();

    if (!identityId) {
      return null;
    }

    const canonicalWalletAddress =
      normalizeWalletAddress(payload.walletAddress);

    /*
     * Session tokens must contain the canonical Solana address.
     * This prevents multiple textual representations from entering
     * authorization and audit flows.
     */
    if (
      payload.walletAddress !== canonicalWalletAddress
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (payload.exp <= now) {
      return null;
    }

    if (payload.iat > now + CLOCK_TOLERANCE_SECONDS) {
      return null;
    }

    if (payload.exp <= payload.iat) {
      return null;
    }

    if (
      payload.exp - payload.iat >
      USER_SESSION_DURATION_SECONDS +
        CLOCK_TOLERANCE_SECONDS
    ) {
      return null;
    }

    return {
      identityId,
      walletAddress: canonicalWalletAddress,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getUserCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: USER_SESSION_DURATION_SECONDS,
    priority: 'high' as const,
  };
}