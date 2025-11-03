// app/lib/origin.ts

/**
 * Safely read base app URL from env or window, normalize it to an origin
 * (no trailing slash, always a valid absolute URL).
 */
function sanitize(u: string | undefined | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    // Return only the origin to avoid double-slashes when joining
    return url.origin;
  } catch {
    return null;
  }
}

const envUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  process.env.APP_ORIGIN ??
  '';

export const APP_URL: string =
  sanitize(envUrl) ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://coincarnation.com');

/**
 * Join a relative path to APP_URL safely.
 * - Keeps absolute URLs as-is
 * - Avoids double slashes
 */
export function absoluteUrl(path: string = ''): string {
  if (!path) return APP_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const base = APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL;
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}
