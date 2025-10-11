const DEFAULT_ALLOWED = [
  'coincarnation.com',
  'www.coincarnation.com',
  'megydapp.vercel.app',
];

function normalizeHost(h: string) {
  return h.toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function allowedHostsFromEnv() {
  const raw = process.env.ALLOWED_REDIRECT_HOSTS || '';
  const extra = raw.split(',').map(s => normalizeHost(s)).filter(Boolean);
  const base = DEFAULT_ALLOWED.map(normalizeHost);
  return Array.from(new Set([...base, ...extra]));
}

export function isAllowedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;   // no basic auth
    if (u.protocol !== 'https:') return false;    // HTTPS only
    const host = normalizeHost(u.hostname);
    const allowed = allowedHostsFromEnv();
    return allowed.includes(host);
  } catch {
    return false;
  }
}

export function assertAllowedRedirect(url: string) {
  if (!isAllowedUrl(url)) {
    const e: any = new Error('Disallowed redirect/app_url');
    e.code = 'BAD_REDIRECT';
    throw e;
  }
  return url;
}
