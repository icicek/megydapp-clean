// app/lib/origin.ts

/**
 * Safely read the canonical public app URL and normalize it
 * to an origin with no trailing slash.
 */
function sanitize(
  value: string | undefined | null
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.origin;
  } catch {
    return null;
  }
}

/*
 * NEXT_PUBLIC_APP_URL is the single canonical application URL.
 *
 * It is intentionally public because the application's origin
 * is not a secret and is required by both client and server code.
 */
const configuredAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? '';

export const APP_URL: string =
  sanitize(configuredAppUrl) ??
  (
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://coincarnation.com'
  );

/**
 * Join a relative path to APP_URL safely.
 *
 * - Absolute HTTP(S) URLs are returned unchanged.
 * - Relative paths are normalized to avoid duplicate slashes.
 */
export function absoluteUrl(
  path: string = ''
): string {
  if (!path) {
    return APP_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base =
    APP_URL.endsWith('/')
      ? APP_URL.slice(0, -1)
      : APP_URL;

  const relative =
    path.startsWith('/')
      ? path
      : `/${path}`;

  return `${base}${relative}`;
}

export function buildReferralUrl(
  referralCode?: string | null
): string {
  const base =
    APP_URL ||
    'https://coincarnation.com';

  if (!referralCode) {
    return base;
  }

  const url =
    new URL(base);

  url.searchParams.set(
    'r',
    referralCode
  );

  return url.toString();
}