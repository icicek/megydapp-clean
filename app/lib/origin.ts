// app/lib/origin.ts
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||           // ✅ senin Vercel değişkenin
  process.env.NEXT_PUBLIC_APP_ORIGIN ||        // opsiyonel fallback
  process.env.APP_ORIGIN ||                    // opsiyonel fallback (server-only)
  (typeof window !== 'undefined' ? window.location.origin : '') ||
  'https://coincarnation.com';

export function absoluteUrl(path: string) {
  if (!path) return APP_URL;
  return path.startsWith('http') ? path : `${APP_URL}${path}`;
}
