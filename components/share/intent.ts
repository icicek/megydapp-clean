// components/share/intent.ts
// Only builds share URLs; no side effects, no DOM APIs.

export type SharePayload = {
    url: string;
    text: string;
    hashtags?: string[];   // e.g., ["MEGY","Coincarnation"]
    via?: string;          // e.g., "Coincarnation"
    utm?: string;          // e.g., "utm_source=share&utm_medium=claimpanel"
  };
  
  export function buildTwitterIntent(p: SharePayload): string {
    const params = new URLSearchParams();
    if (p.text) params.set('text', p.text);
    if (p.url)  params.set('url', addUtm(p.url, p.utm));
    if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
    if (p.via) params.set('via', p.via);
    return `https://twitter.com/intent/tweet?${params.toString()}`;
  }
  
  export function buildTelegramIntent(p: SharePayload): string {
    // Telegram supports url + text
    const params = new URLSearchParams();
    if (p.url)  params.set('url', addUtm(p.url, p.utm));
    if (p.text) params.set('text', p.text);
    return `https://t.me/share/url?${params.toString()}`;
  }
  
  export function buildWhatsAppIntent(p: SharePayload): string {
    // WhatsApp uses a single "text" param
    const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
    const params = new URLSearchParams({ text: combined });
    return `https://wa.me/?${params.toString()}`;
  }
  
  // ---- small util ----
  function addUtm(u: string, utm?: string): string {
    if (!utm) return u;
    try {
      const url = new URL(u);
      // If utm is a querystring like "a=b&c=d"
      for (const part of utm.split('&')) {
        const [k, v] = part.split('=');
        if (k) url.searchParams.set(k, v ?? '');
      }
      return url.toString();
    } catch {
      return u;
    }
  }
  