//app/api/_lib/user-auth.ts
import crypto from 'crypto';

export const USER_AUTH_COOKIE = 'coincarnation_user';

const USER_SESSION_SECRET =
  process.env.USER_SESSION_SECRET ||
  process.env.JWT_SECRET ||
  process.env.ADMIN_JWT_SECRET ||
  '';

if (!USER_SESSION_SECRET) {
  console.warn('[user-auth] Missing USER_SESSION_SECRET');
}

export type UserSessionPayload = {
  identityId: string;
  walletAddress: string;
  iat: number;
  exp: number;
};

export function buildUserAuthMessage(walletAddress: string, nonce: string) {
  return [
    'Coincarnation Identity Verification',
    '',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    'Purpose: user_auth',
    '',
    'This signature does not authorize a transaction or move funds.',
  ].join('\n');
}

export function createUserNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function signUserSession(payload: {
  identityId: string;
  walletAddress: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: UserSessionPayload = {
    identityId: payload.identityId,
    walletAddress: payload.walletAddress,
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', USER_SESSION_SECRET)
    .update(data)
    .digest();

  return `${data}.${base64url(signature)}`;
}

export function verifyUserSession(token: string): UserSessionPayload | null {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const data = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = base64url(
      crypto.createHmac('sha256', USER_SESSION_SECRET).update(data).digest()
    );

    if (encodedSignature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64').toString('utf8')
    ) as UserSessionPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
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
    maxAge: 60 * 60 * 24 * 30,
  };
}