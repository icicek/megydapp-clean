// components/share/intent.ts
// Only builds share URLs or returns helpers; no window DOM calls here.

export type SharePayload = {
  url: string;
  text: string;
  hashtags?: string[];   // e.g., ["MEGY","Coincarnation"]
  via?: string;          // e.g., "Coincarnation"
  utm?: string;          // e.g., "utm_source=share&utm_medium=claimpanel"
  subject?: string;      // email subject (optional)
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

// ---- small util ----
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

// ---- URL builders (no side effects) ----

export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);
  if (p.url)  params.set('url', addUtm(p.url, p.utm));
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via);
  // x.com/intent/post da çalışır; twitter.com/intent/tweet daha yaygın
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

// Telegram: web intent
export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url)  params.set('url', addUtm(p.url, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

// WhatsApp: web intent
export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

// Email: mailto
export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${addUtm(p.url, p.utm)}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

// Kopyalama: modal içinde panoya basılacak metni üretir
export function buildCopyText(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  const link = addUtm(p.url, p.utm);
  return `${p.text}\n${link}${tags ? `\n${tags}` : ''}`;
}

/**
 * Uygulama deeplink adayları (mobilde uygulamayı açmayı dener, başarılı olmazsa web fallback kullanılmalı).
 * Instagram ve TikTok caption’ı önceden doldurtmuyor; sadece uygulamayı açarız.
 */
export const APP_LINKS = {
  telegram: (p: SharePayload) => [
    'tg://msg',        // dene
    'tg://',           // dene
    buildTelegramWeb(p)
  ],
  whatsapp: (p: SharePayload) => [
    `whatsapp://send?text=${encodeURIComponent(`${p.text} ${addUtm(p.url, p.utm)}`.trim())}`,
    buildWhatsAppWeb(p),
  ],
  instagram: (_p: SharePayload) => [
    'instagram://app',
    'https://www.instagram.com/',
  ],
  tiktok: (_p: SharePayload) => [
    'tiktok://',
    'snssdk1128://',
    'https://www.tiktok.com/explore',
  ],
};
