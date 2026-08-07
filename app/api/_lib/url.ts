// app/api/_lib/url.ts

const DEFAULT_ALLOWED = [
  'coincarnation.com',
  'www.coincarnation.com',
  'megydapp.vercel.app',
];

function normalizeHost(
  host: string
): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function allowedHostsFromEnv() {
  const raw =
    process.env.ALLOWED_REDIRECT_HOSTS || '';

  const extra =
    raw
      .split(',')
      .map((host) => normalizeHost(host))
      .filter(Boolean);

  const base =
    DEFAULT_ALLOWED.map(
      (host) => normalizeHost(host)
    );

  return Array.from(
    new Set([
      ...base,
      ...extra,
    ])
  );
}

export function isAllowedUrl(
  url: string
) {
  try {
    const parsed =
      new URL(url);

    if (
      parsed.username ||
      parsed.password
    ) {
      return false;
    }

    if (
      parsed.protocol !== 'https:'
    ) {
      return false;
    }

    const host =
      normalizeHost(
        parsed.hostname
      );

    const allowed =
      allowedHostsFromEnv();

    return allowed.includes(host);
  } catch {
    return false;
  }
}

export function assertAllowedRedirect(
  url: string
) {
  if (!isAllowedUrl(url)) {
    const error: any =
      new Error(
        'Disallowed redirect/app_url'
      );

    error.code =
      'BAD_REDIRECT';

    throw error;
  }

  return url;
}