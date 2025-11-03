// lib/share/channels.ts
export type ShareChannel =
  | 'x' | 'telegram' | 'whatsapp' | 'discord' | 'tiktok' | 'instagram' | 'email'
  | 'copy-link' | 'download-image' | 'system';

export type SharePayload = {
  url: string;
  text?: string;
  hashtags?: string[];
  via?: string;
  imageUrl?: string;
  subject?: string;
  utm?: string;
};

export function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isInAppWallet(): boolean {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  return ua.includes('phantom') || ua.includes('solflare') || ua.includes('backpack')
      || ua.includes('rainbow') || ua.includes('metamask');
}

export function fullUrl(u: string, utm?: string) {
  return utm ? (u + (u.includes('?') ? '&' : '?') + utm) : u;
}

export function buildTweetUrl(p: SharePayload): string {
  const u = new URL('https://x.com/intent/tweet');
  const text = p.text ?? '';
  u.searchParams.set('text', text);
  u.searchParams.set('url', fullUrl(p.url, p.utm));
  if (p.hashtags?.length) u.searchParams.set('hashtags', p.hashtags.join(','));
  if (p.via) u.searchParams.set('via', p.via);
  return u.toString();
}

export function buildTelegramUrl(p: SharePayload): string {
  const u = new URL('https://t.me/share/url');
  u.searchParams.set('url', fullUrl(p.url, p.utm));
  u.searchParams.set('text', p.text ?? '');
  return u.toString();
}

export function buildWhatsAppUrl(p: SharePayload): string {
  const text = `${p.text ?? ''} ${fullUrl(p.url, p.utm)}`.trim();
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function buildMailto(p: SharePayload): string {
  const subject = p.subject ?? 'Coincarnation';
  const body = `${p.text ?? ''}\n\n${fullUrl(p.url, p.utm)}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
