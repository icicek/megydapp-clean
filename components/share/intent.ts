// components/share/intent.ts
// Clean, guaranteed-export version for ShareCenter integration

export type SharePayload = {
  url: string;
  text: string;
  hashtags?: string[];
  via?: string;
  utm?: string;
  subject?: string;
};

// 👇 Explicit export to satisfy TS resolver
export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

// ---- Builders ----

export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);
  if (p.url) params.set('url', addUtm(p.url, p.utm));
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url) params.set('url', addUtm(p.url, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
  return `https://wa.me/?text=${encodeURIComponent(combined)}`;
}

export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${addUtm(p.url, p.utm)}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---- App Links ----
export const APP_LINKS: Record<string, (p: SharePayload) => string[]> = {
  telegram: (p) => [
    `tg://msg`,
    `tg://`,
    buildTelegramWeb(p),
  ],
  whatsapp: (p) => [
    `whatsapp://send?text=${encodeURIComponent(`${p.text} ${addUtm(p.url, p.utm)}`.trim())}`,
    buildWhatsAppWeb(p),
  ],
  instagram: () => [
    'instagram://app',
    'https://www.instagram.com/',
  ],
  tiktok: () => [
    'tiktok://',
    'snssdk1128://',
    'https://www.tiktok.com/explore',
  ],
};

// ---- Copy text ----
export function buildCopyText(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  const link = addUtm(p.url, p.utm);
  return `${p.text}\n${link}${tags ? `\n${tags}` : ''}`;
}

// ---- Helper ----
function addUtm(u: string, utm?: string): string {
  if (!utm) return u;
  try {
    const url = new URL(u);
    for (const part of utm.split('&')) {
      const [k, v] = part.split('=');
      if (k) url.searchParams.set(k, v ?? '');
    }
    return url.toString();
  } catch {
    return u;
  }
}
