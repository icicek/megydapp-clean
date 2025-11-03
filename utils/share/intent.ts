// utils/share/intent.ts
function q(v: string | undefined | null) { return encodeURIComponent(v ?? ''); }

export function xIntentUrl(opts: { text?: string; url?: string; hashtags?: string[]; via?: string }) {
  const params = new URLSearchParams();
  if (opts.text) params.set('text', opts.text);
  if (opts.url) params.set('url', opts.url);
  if (opts.hashtags?.length) params.set('hashtags', opts.hashtags.join(','));
  if (opts.via) params.set('via', opts.via);
  return `https://x.com/intent/post?${params.toString()}`;
}

export function telegramShareUrl(opts: { text?: string; url?: string }) {
  // Telegram yalnızca text+url’i kabul eder
  const params = new URLSearchParams();
  if (opts.url) params.set('url', opts.url);
  if (opts.text) params.set('text', opts.text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function whatsappShareUrl(opts: { text?: string; url?: string }) {
  const text = [opts.text, opts.url].filter(Boolean).join(' ');
  return `https://api.whatsapp.com/send?text=${q(text)}`;
}

export function mailtoUrl(opts: { subject?: string; body?: string }) {
  const params = new URLSearchParams();
  if (opts.subject) params.set('subject', opts.subject);
  if (opts.body) params.set('body', opts.body);
  return `mailto:?${params.toString()}`;
}
